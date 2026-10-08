"""Build an XPI using only Python's standard library: python build.py."""
import json
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent


def build():
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    # Zotero 10 rejects extensions without these fields in ExtensionData.parseManifest().
    settings = manifest.get("applications", {}).get("zotero", {})
    required = ("id", "update_url", "strict_min_version", "strict_max_version")
    missing = [name for name in required if not isinstance(settings.get(name), str) or not settings[name]]
    if missing:
        raise ValueError("Missing Zotero manifest fields: " + ", ".join(missing))
    update_url = urlparse(settings["update_url"])
    if update_url.scheme != "https" or not update_url.hostname:
        raise ValueError("Zotero requires a secure HTTPS update URL")
    target = ROOT / "dist" / f"zotero-batch-add-info-{manifest['version']}.xpi"
    target.parent.mkdir(exist_ok=True)
    files = [ROOT / "manifest.json", ROOT / "bootstrap.js"]
    for directory in ("content", "locale"):
        files.extend(path for path in (ROOT / directory).rglob("*") if path.is_file())
    with ZipFile(target, "w", ZIP_DEFLATED) as archive:
        for path in sorted(files):
            archive.write(path, path.relative_to(ROOT).as_posix())
    print(target)
    return target


if __name__ == "__main__":
    build()
