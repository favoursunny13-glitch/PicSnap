"""PicSnap static site and persistent, shared photo guestbook. Python 3.10+."""
import argparse
import base64
import binascii
from contextlib import contextmanager
import json
import os
from datetime import datetime, timedelta, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re
import sqlite3
from urllib.parse import parse_qs, unquote, urlsplit
from guestbook_archive import ArchiveError, PhotoArchive
from guestbook_mail import MailWorker, initialize_outbox, validate_email

ROOT = Path(__file__).resolve().parent
DATA = ROOT / ".guestbook-data"
KOREA = timezone(timedelta(hours=9))
MAX_BODY = 4 * 1024 * 1024
ID_PATTERN = re.compile(r"^[a-zA-Z0-9-]{16,64}$")


@contextmanager
def connect(path):
    connection = sqlite3.connect(path, timeout=15)
    connection.row_factory = sqlite3.Row
    try:
        with connection:
            yield connection
    finally:
        connection.close()


class GuestbookServer(ThreadingHTTPServer):
    def server_close(self):
        if hasattr(self, "mailer"):
            self.mailer.close()
        super().server_close()


class GuestbookHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def json_response(self, status, value):
        body = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlsplit(self.path).path
        try:
            if path == "/api/guestbook/health":
                with connect(self.server.database) as db:
                    db.execute("SELECT 1 FROM entries LIMIT 1")
                return self.json_response(200, {"service": "picsnap-guestbook", "emailConfigured": self.server.mailer.configured})
            if path == "/api/guestbook":
                return self.list_entries()
            if path.startswith("/api/guestbook/photos/"):
                return self.get_photo(path.rsplit("/", 1)[-1])
            if path.startswith("/api/"):
                return self.json_response(404, {"error": "not_found"})
            return super().do_GET()
        except sqlite3.Error:
            return self.json_response(503, {"error": "storage_unavailable"})

    def list_entries(self):
        query = parse_qs(urlsplit(self.path).query)
        name = query.get("name", [""])[0].strip()[:30].lower()
        date = query.get("date", [""])[0]
        try:
            offset = max(0, int(query.get("offset", [0])[0]))
            limit = min(48, max(1, int(query.get("limit", [24])[0])))
            if date:
                datetime.strptime(date, "%Y-%m-%d")
        except ValueError:
            return self.json_response(400, {"error": "invalid_filter"})
        where = "WHERE archived = 1 AND instr(name_search, ?) > 0"
        values = [name]
        if date:
            where += " AND captured_date = ?"
            values.append(date)
        with connect(self.server.database) as db:
            total = db.execute(f"SELECT count(*) FROM entries {where}", values).fetchone()[0]
            rows = db.execute(
                f"SELECT id, name, comment, captured_at, created_at FROM entries {where} ORDER BY captured_at DESC, id DESC LIMIT ? OFFSET ?",
                [*values, limit, offset],
            ).fetchall()
        return self.json_response(200, {"items": [
            {"id": row["id"], "name": row["name"], "comment": row["comment"], "capturedAt": row["captured_at"],
             "createdAt": row["created_at"], "photoUrl": f"./api/guestbook/photos/{row['id']}"} for row in rows
        ], "total": total})

    def get_photo(self, entry_id):
        if not ID_PATTERN.fullmatch(entry_id):
            return self.json_response(404, {"error": "not_found"})
        with connect(self.server.database) as db:
            row = db.execute("SELECT photo FROM entries WHERE id = ? AND archived = 1", [entry_id]).fetchone()
        if row is None:
            return self.json_response(404, {"error": "not_found"})
        self.send_response(200)
        self.send_header("Content-Type", "image/jpeg")
        self.send_header("Content-Length", str(len(row["photo"])))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(row["photo"])

    def do_POST(self):
        if urlsplit(self.path).path != "/api/guestbook":
            return self.json_response(404, {"error": "not_found"})
        # A browser on another site must not be able to submit entries here.
        origin = self.headers.get("Origin")
        if origin and urlsplit(origin).netloc != self.headers.get("Host"):
            return self.json_response(403, {"error": "invalid_origin"})
        if self.headers.get_content_type() != "application/json":
            return self.json_response(415, {"error": "json_required"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= MAX_BODY:
                return self.json_response(413, {"error": "image_too_large"})
            data = json.loads(self.rfile.read(length))
            entry_id = data["id"]
            name = " ".join(data["name"].split())
            if not ID_PATTERN.fullmatch(entry_id) or not 1 <= len(name) <= 30:
                raise ValueError("invalid entry")
            email = validate_email(data.get("email", ""))
            comment = data.get("comment", "")
            if not isinstance(comment, str) or len(comment.encode("utf-16-le")) // 2 > 500:
                raise ValueError("invalid comment")
            comment = comment.strip()
            captured = datetime.fromisoformat(data["capturedAt"].replace("Z", "+00:00"))
            if captured.tzinfo is None:
                raise ValueError("timezone required")
            captured = captured.astimezone(timezone.utc)
            if captured > datetime.now(timezone.utc) + timedelta(minutes=5):
                raise ValueError("future capture")
            captured_at = captured.isoformat(timespec="milliseconds").replace("+00:00", "Z")
            image = data["image"]
            prefix = "data:image/jpeg;base64,"
            if not image.startswith(prefix):
                raise ValueError("jpeg required")
            photo = base64.b64decode(image[len(prefix):], validate=True)
            if not 4 <= len(photo) <= 3 * 1024 * 1024 or not photo.startswith(b"\xff\xd8\xff") or not photo.endswith(b"\xff\xd9"):
                raise ValueError("invalid jpeg")
        except (ValueError, TypeError, KeyError, AttributeError, binascii.Error):
            return self.json_response(400, {"error": "invalid_entry"})
        try:
            with connect(self.server.database) as db:
                # Commit the submitted data before writing a file so a retry can finish
                # publication even if the process stopped just after the PNG was written.
                db.execute("BEGIN IMMEDIATE")
                can_update = not self.server.archive.path_for(entry_id).is_file()
                is_new = not db.execute("SELECT 1 FROM entries WHERE id=?", [entry_id]).fetchone()
                db.execute("""
                    INSERT INTO entries
                        (id, name, name_search, captured_at, captured_date, created_at, photo, comment, archived)
                    SELECT ?, ?, ?, ?, ?, ?, ?, ?, 0 WHERE NOT EXISTS
                        (SELECT 1 FROM deleted_entries WHERE id = ?)
                    ON CONFLICT(id) DO UPDATE SET name = excluded.name, name_search = excluded.name_search,
                        captured_at = excluded.captured_at, captured_date = excluded.captured_date,
                        photo = excluded.photo, comment = excluded.comment
                    WHERE entries.archived = 0 AND ?
                """, [
                    entry_id, name, name.lower(), captured_at, captured.astimezone(KOREA).date().isoformat(),
                    datetime.now(timezone.utc).isoformat(), photo, comment, entry_id, can_update,
                ])
                if is_new and email and db.execute("SELECT 1 FROM entries WHERE id=?", [entry_id]).fetchone():
                    db.execute("INSERT OR IGNORE INTO email_jobs(entry_id, recipient) VALUES (?, ?)", [entry_id, email])
            with connect(self.server.database) as db:
                db.execute("BEGIN IMMEDIATE")
                entry = db.execute("SELECT * FROM entries WHERE id = ?", [entry_id]).fetchone()
                if entry is not None:
                    self.server.archive.ensure(entry)
                    if not entry["archived"]:
                        db.execute("UPDATE entries SET archived = 1 WHERE id = ?", [entry_id])
        except (ArchiveError, OSError) as error:
            self.log_error("Guestbook archive write failed (%s)", type(error).__name__)
            return self.json_response(503, {"error": "archive_unavailable"})
        except sqlite3.Error:
            return self.json_response(503, {"error": "storage_unavailable"})
        if entry is None:
            return self.json_response(409, {"error": "entry_deleted"})
        with connect(self.server.database) as db:
            job = db.execute("SELECT status FROM email_jobs WHERE entry_id=?", [entry_id]).fetchone()
        return self.json_response(200, {"id": entry_id, "emailStatus": job["status"] if job else "not_requested"})

    def do_DELETE(self):
        match = re.fullmatch(r"/api/guestbook/([a-zA-Z0-9-]{16,64})", urlsplit(self.path).path)
        if not match:
            return self.json_response(404, {"error": "not_found"})
        origin = self.headers.get("Origin")
        if origin and urlsplit(origin).netloc != self.headers.get("Host"):
            return self.json_response(403, {"error": "invalid_origin"})
        entry_id = match.group(1)
        try:
            with self.server.mailer.gate, connect(self.server.database) as db:
                db.execute("DELETE FROM email_jobs WHERE entry_id=?", [entry_id])
                db.execute("""
                    INSERT OR IGNORE INTO deleted_entries (id)
                    SELECT id FROM entries WHERE id = ? AND archived = 1
                """, [entry_id])
                db.execute("DELETE FROM entries WHERE id = ? AND archived = 1", [entry_id])
            return self.json_response(200, {"id": entry_id})
        except sqlite3.Error:
            return self.json_response(503, {"error": "storage_unavailable"})

    def send_head(self):
        requested = Path(self.translate_path(self.path))
        path = requested.resolve()
        try:
            relative = path.relative_to(ROOT)
        except ValueError:
            self.send_error(404)
            return None
        if any(part.startswith(".") for part in relative.parts) or path.suffix in {".py", ".sqlite3", ".db", ".pyc"} or path.is_dir() and path != ROOT:
            self.send_error(404)
            return None
        # Exclude the data directory even when a custom location is inside the site.
        if path == self.server.database or (self.server.database.parent != ROOT and self.server.database.parent in path.parents):
            self.send_error(404)
            return None
        archive = self.server.archive.directory
        if any(candidate.is_relative_to(archive) for candidate in (requested, path)):
            self.send_error(404)
            return None
        return super().send_head()


def create_server(host="127.0.0.1", port=8000, database=None, archive_dir=None):
    database = Path(database or DATA / "guestbook.sqlite3").resolve()
    archive_dir = Path(archive_dir or database.parent / "archive").resolve()
    if ROOT.is_relative_to(archive_dir):
        raise ValueError("The archive must use a dedicated folder.")
    archive = PhotoArchive(archive_dir, ROOT)
    server = GuestbookServer((host, port), GuestbookHandler, bind_and_activate=False)
    try:
        server.server_bind()
        archive.initialize()
        initialize_database(database, archive)
        server.database = database
        server.archive = archive
        server.mailer = MailWorker(database, archive, connect)
        server.mailer.start()
        server.server_activate()
    except BaseException:
        server.server_close()
        raise
    return server


def initialize_database(database, archive):
    database.parent.mkdir(parents=True, exist_ok=True)
    with connect(database) as db:
        db.execute("PRAGMA journal_mode=WAL")
        initialize_outbox(db)
        db.execute("""CREATE TABLE IF NOT EXISTS entries (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, name_search TEXT NOT NULL,
            captured_at TEXT NOT NULL, captured_date TEXT NOT NULL,
            created_at TEXT NOT NULL, photo BLOB NOT NULL
        )""")
        # Existing guestbooks gain optional comments without changing saved photos.
        columns = {row["name"] for row in db.execute("PRAGMA table_info(entries)")}
        if "comment" not in columns:
            db.execute("ALTER TABLE entries ADD COLUMN comment TEXT NOT NULL DEFAULT ''")
        if "archived" not in columns:
            db.execute("ALTER TABLE entries ADD COLUMN archived INTEGER NOT NULL DEFAULT 1")
        db.execute("CREATE TABLE IF NOT EXISTS deleted_entries (id TEXT PRIMARY KEY)")
        db.execute("CREATE INDEX IF NOT EXISTS entries_date ON entries(captured_at DESC)")
        entries = db.execute("SELECT id, archived FROM entries").fetchall()
    for entry_id, archived in entries:
        if not ID_PATTERN.fullmatch(entry_id):
            raise ArchiveError("An existing guestbook record has an invalid ID.")
        has_archive = archive.path_for(entry_id).is_file()
        if bool(archived) == has_archive:
            continue
        with connect(database) as db:
            db.execute("BEGIN IMMEDIATE")
            entry = db.execute("SELECT * FROM entries WHERE id = ?", [entry_id]).fetchone()
            if entry is None:
                continue
            try:
                archive.ensure(entry)
            except (ArchiveError, OSError) as error:
                raise ArchiveError(f"Could not archive existing guestbook record {entry_id}.") from error
            db.execute("UPDATE entries SET archived = 1 WHERE id = ?", [entry_id])


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--database", default=os.environ.get("PICSNAP_GUESTBOOK_DB"))
    parser.add_argument("--archive-dir", default=os.environ.get("PICSNAP_GUESTBOOK_ARCHIVE_DIR"))
    args = parser.parse_args()
    try:
        server = create_server(args.host, args.port, args.database, args.archive_dir)
    except (ArchiveError, OSError, sqlite3.Error, ValueError) as error:
        parser.exit(1, f"PicSnap: {error}\n")
    print(f"PicSnap: http://{args.host}:{server.server_port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
