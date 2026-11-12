"""Persistent Gmail SMTP outbox and local operator commands."""
import argparse
from email.message import EmailMessage
from email.policy import SMTP
import logging
import os
from pathlib import Path
import re
import smtplib
import sqlite3
import ssl
import threading
import time


def validate_email(value):
    if not isinstance(value, str):
        raise ValueError("invalid email")
    value = value.strip()
    if value and (len(value) > 254 or not re.fullmatch(
        r"[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*", value
    )):
        raise ValueError("invalid email")
    return value


def initialize_outbox(db):
    db.execute("CREATE TABLE IF NOT EXISTS email_dispatch (id INTEGER PRIMARY KEY CHECK(id=1), resume_at REAL NOT NULL)")
    db.execute("INSERT OR IGNORE INTO email_dispatch VALUES (1, 0)")
    db.execute("""CREATE TABLE IF NOT EXISTS email_jobs (
        entry_id TEXT PRIMARY KEY, recipient TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt REAL NOT NULL DEFAULT 0, error TEXT NOT NULL DEFAULT ''
    )""")


class MailWorker:
    def __init__(self, database, archive, connect, smtp_factory=smtplib.SMTP):
        self.database, self.archive, self.connect = database, archive, connect
        self.smtp_factory = smtp_factory
        self.username = os.environ.get("PICSNAP_GMAIL_ADDRESS", "").strip()
        self.password = os.environ.get("PICSNAP_GMAIL_APP_PASSWORD", "").replace(" ", "")
        self.configured = bool(self.username and self.password)
        if self.configured:
            validate_email(self.username)
        self.stop = threading.Event()
        self.thread = None
        self.paused = False
        self.gate = threading.Lock()
        self.lock_file = None

    def start(self):
        # One server owns recovery and dispatch for this database, including across processes.
        self.lock_file = open(str(self.database) + ".mail.lock", "a+b")
        try:
            if os.name == "nt":
                import msvcrt
                self.lock_file.seek(0)
                self.lock_file.write(b"0")
                self.lock_file.flush()
                self.lock_file.seek(0)
                msvcrt.locking(self.lock_file.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(self.lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            self.lock_file.close()
            self.lock_file = None
            raise ValueError("Another PicSnap server owns this database's email worker.")
        with self.connect(self.database) as db:
            db.execute("UPDATE email_jobs SET status='unknown', error='interrupted' WHERE status='sending'")
        if self.configured:
            self.thread = threading.Thread(target=self.run, name="guestbook-mail", daemon=True)
            self.thread.start()

    def close(self):
        self.stop.set()
        if self.thread:
            self.thread.join()
        if self.lock_file:
            self.lock_file.close()
            self.lock_file = None

    def run(self):
        while not self.stop.is_set():
            try:
                if not self.paused:
                    self.process_one()
            except Exception:
                logging.exception("Guestbook email worker failed; queue retained")
            self.stop.wait(2)

    def process_one(self):
        if not self.configured or self.paused:
            return
        with self.gate, self.connect(self.database) as db:
            db.execute("BEGIN IMMEDIATE")
            if db.execute("SELECT resume_at FROM email_dispatch WHERE id=1").fetchone()[0] > time.time():
                return
            job = db.execute("""SELECT j.* FROM email_jobs j JOIN entries e ON e.id=j.entry_id
                WHERE j.status='pending' AND j.next_attempt<=? AND e.archived=1
                ORDER BY j.next_attempt, j.rowid LIMIT 1""", [time.time()]).fetchone()
            if job is None:
                return
            db.execute("UPDATE email_jobs SET status='sending', attempts=attempts+1 WHERE entry_id=?", [job["entry_id"]])
        status, error, delay = "accepted", "", 0
        data_started = False
        smtp = None
        try:
            message = EmailMessage(policy=SMTP)
            message["From"] = f"PicSnap <{self.username}>"
            message["To"] = job["recipient"]
            message["Subject"] = "방명록 사진을 보내드립니다"
            message["Message-ID"] = f"<picsnap-{job['entry_id']}@{self.username.split('@')[1]}>"
            message.set_content("방명록에 남겨주셔서 감사합니다. 사진과 글이 담긴 PNG를 첨부합니다.")
            message.add_attachment(self.archive.path_for(job["entry_id"]).read_bytes(),
                                   maintype="image", subtype="png", filename="PicSnap.png")
            smtp = self.smtp_factory("smtp.gmail.com", 587, timeout=20)
            smtp.ehlo()
            smtp.starttls(context=ssl.create_default_context())
            smtp.ehlo()
            smtp.login(self.username, self.password)
            for command, address in ((smtp.mail, self.username), (smtp.rcpt, job["recipient"])):
                code, response = command(address)
                if code not in (250, 251):
                    raise smtplib.SMTPResponseException(code, response)
            # Deletion before DATA cancels delivery. Once DATA begins it may already be accepted.
            with self.gate, self.connect(self.database) as db:
                if not db.execute("SELECT 1 FROM email_jobs WHERE entry_id=?", [job["entry_id"]]).fetchone():
                    return
                data_started = True
            code, response = smtp.data(message.as_bytes())
            if code != 250:
                raise smtplib.SMTPResponseException(code, response)
        except smtplib.SMTPAuthenticationError:
            status, error = "failed", "authentication"
            self.paused = True
            logging.error("Gmail authentication failed. Check SMTP environment settings and restart; retry the failed job via guestbook_mail.py.")
        except smtplib.SMTPResponseException as exc:
            text = exc.smtp_error.decode(errors="replace").lower() if isinstance(exc.smtp_error, bytes) else str(exc.smtp_error).lower()
            if "limit" in text or "quota" in text:
                status, error, delay = "pending", "quota", 86400
            elif 400 <= exc.smtp_code < 500:
                status, error, delay = "pending", f"smtp_{exc.smtp_code}", min(3600, 60 * 2 ** min(job["attempts"], 6))
            else:
                status, error = "failed", f"smtp_{exc.smtp_code}"
        except FileNotFoundError:
            status, error = "failed", "missing_png"
        except (OSError, smtplib.SMTPException):
            status = "unknown" if data_started else "pending"
            error, delay = "transport", 300
        finally:
            if smtp:
                smtp.close()
        with self.connect(self.database) as db:
            db.execute("UPDATE email_jobs SET status=?, error=?, next_attempt=? WHERE entry_id=? AND status='sending'",
                       [status, error, time.time() + delay, job["entry_id"]])
            if error == "quota":
                db.execute("UPDATE email_dispatch SET resume_at=? WHERE id=1", [time.time() + delay])
                db.execute("UPDATE email_jobs SET next_attempt=MAX(next_attempt, ?) WHERE status='pending'", [time.time() + delay])


def main():
    parser = argparse.ArgumentParser(description="Inspect email jobs or explicitly retry failed/uncertain delivery.")
    parser.add_argument("--database", default=os.environ.get("PICSNAP_GUESTBOOK_DB", str(Path(__file__).parent / ".guestbook-data/guestbook.sqlite3")))
    parser.add_argument("command", choices=["list", "retry"])
    parser.add_argument("entry_id", nargs="?")
    args = parser.parse_args()
    if args.command == "retry" and not args.entry_id:
        parser.error("retry requires an entry ID; an uncertain delivery may be sent twice")
    db = sqlite3.connect(Path(args.database).resolve().as_uri() + "?mode=rw", uri=True)
    try:
        with db:
            if args.command == "list":
                for row in db.execute("SELECT entry_id, status, attempts, next_attempt, error FROM email_jobs ORDER BY rowid"):
                    print(*row, sep="\t")
            else:
                result = db.execute("UPDATE email_jobs SET status='pending', next_attempt=0, error='' WHERE entry_id=? AND status IN ('failed','unknown')", [args.entry_id])
                print(f"Queued {result.rowcount} job(s).")
    finally:
        db.close()


if __name__ == "__main__":
    main()
