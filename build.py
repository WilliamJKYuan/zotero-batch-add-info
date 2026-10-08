"""Build an XPI using only Python's standard library: python build.py."""
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
REPOSITORY_URL = "https://github.com/WilliamJKYuan/zotero-batch-add-info"
UPDATE_URL = f"{REPOSITORY_URL}/releases/latest/download/updates.json"


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
    if settings["update_url"] != UPDATE_URL:
        raise ValueError(f"The manifest update_url must be {UPDATE_URL}")
    target = ROOT / "dist" / f"zotero-batch-add-info-{manifest['version']}.xpi"
    target.parent.mkdir(exist_ok=True)
    files = [ROOT / "manifest.json", ROOT / "bootstrap.js"]
    for directory in ("content", "locale"):
        files.extend(path for path in (ROOT / directory).rglob("*") if path.is_file())
    with ZipFile(target, "w", ZIP_DEFLATED) as archive:
        for path in sorted(files):
            archive.write(path, path.relative_to(ROOT).as_posix())
    tag = f"v{manifest['version']}"
    updates = {
        "addons": {
            settings["id"]: {
                "updates": [{
                    "version": manifest["version"],
                    "update_link": f"{REPOSITORY_URL}/releases/download/{tag}/{target.name}",
                    "update_hash": "sha256:" + hashlib.sha256(target.read_bytes()).hexdigest(),
                    "update_info_url": f"{REPOSITORY_URL}/releases/tag/{tag}",
                    "applications": {
                        "zotero": {
                            "strict_min_version": settings["strict_min_version"],
                            "strict_max_version": settings["strict_max_version"],
                        }
                    },
                }]
            }
        }
    }
    update_target = target.parent / "updates.json"
    update_target.write_text(json.dumps(updates, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(target)
    print(update_target)
    return target


if __name__ == "__main__":
    build()
