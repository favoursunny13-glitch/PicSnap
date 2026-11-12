"""Render private PNG copies from the public guestbook detail template."""

import base64
import os
from tempfile import NamedTemporaryFile


class ArchiveError(Exception):
    pass


class PhotoArchive:
    def __init__(self, directory, site_root):
        self.directory = directory
        self.html = (site_root / "guestbook.html").read_text(encoding="utf-8")
        self.css = (site_root / "guestbook.css").read_text(encoding="utf-8")
        self.script = (site_root / "js" / "guestbook-detail.js").read_text(encoding="utf-8")

    def initialize(self):
        self.directory.mkdir(parents=True, exist_ok=True)
        png = self.render(
            {"name": "보관 확인", "capturedAt": "2020-01-01T00:00:00Z", "comment": ""},
            "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
        )
        with NamedTemporaryFile(dir=self.directory, prefix=".archive-check-") as probe:
            probe.write(png)
            probe.flush()
            os.fsync(probe.fileno())

    def path_for(self, entry_id):
        # Preserve distinct legacy IDs even on a case-insensitive filesystem.
        filename = entry_id if entry_id == entry_id.lower() else "_" + entry_id.encode("ascii").hex()
        return self.directory / f"{filename}.png"

    def ensure(self, entry):
        destination = self.path_for(entry["id"])
        if destination.is_file():
            return
        image = "data:image/jpeg;base64," + base64.b64encode(entry["photo"]).decode("ascii")
        png = self.render(
            {"name": entry["name"], "capturedAt": entry["captured_at"], "comment": entry["comment"]},
            image,
        )
        temporary = None
        try:
            with NamedTemporaryFile(dir=self.directory, prefix=".archive-", delete=False) as output:
                temporary = output.name
                output.write(png)
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary, destination)
        finally:
            if temporary is not None and os.path.exists(temporary):
                os.unlink(temporary)

    def render(self, entry, image):
        try:
            from playwright.sync_api import Error, sync_playwright
        except ImportError as error:
            raise ArchiveError("Install the archive requirements and Playwright Chromium.") from error
        try:
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(timeout=8000, chromium_sandbox=True)
                try:
                    page = browser.new_page(
                        viewport={"width": 1200, "height": 1000}, device_scale_factor=2,
                        offline=True,
                    )
                    page.set_default_timeout(8000)
                    page.set_content('<!doctype html><html lang="ko" class="photo-archive"><body></body></html>')
                    page.add_style_tag(content=self.css)
                    page.add_script_tag(content=self.script)
                    page.evaluate("""async ({ html, entry, image }) => {
                        const template = new DOMParser().parseFromString(html, "text/html");
                        const dialog = template.querySelector("#photo-dialog");
                        document.body.append(dialog);
                        PicSnapGuestbook.fillPhotoDetail(dialog, entry, image);
                        dialog.show();
                        await Promise.all([dialog.querySelector("img").decode(), document.fonts.ready]);
                    }""", {"html": self.html, "entry": entry, "image": image})
                    return page.locator("#photo-dialog").screenshot(omit_background=True, animations="disabled")
                finally:
                    browser.close()
        except Error as error:
            raise ArchiveError("Chromium could not render the guestbook detail.") from error
