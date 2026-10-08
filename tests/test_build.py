import contextlib
import hashlib
import io
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch
from zipfile import ZipFile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import build


class BuildTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        for name in ("manifest.json", "bootstrap.js"):
            shutil.copy2(build.ROOT / name, self.root / name)
        for name in ("content", "locale"):
            shutil.copytree(build.ROOT / name, self.root / name)

    def build_package(self):
        with patch.object(build, "ROOT", self.root), contextlib.redirect_stdout(io.StringIO()):
            return build.build()

    def test_release_feed_matches_actual_installation_package(self):
        package = self.build_package()
        with ZipFile(package) as archive:
            self.assertIsNone(archive.testzip())
            manifest = json.loads(archive.read("manifest.json"))
            self.assertIn("bootstrap.js", archive.namelist())
            self.assertNotIn("updates.json", archive.namelist())
        settings = manifest["applications"]["zotero"]
        feed = json.loads((self.root / "dist" / "updates.json").read_text(encoding="utf-8"))
        self.assertEqual(list(feed["addons"]), [settings["id"]])
        update, = feed["addons"][settings["id"]]["updates"]
        self.assertEqual(update["version"], manifest["version"])
        self.assertEqual(settings["update_url"], build.UPDATE_URL)
        self.assertTrue(update["update_link"].endswith(f"/v{manifest['version']}/{package.name}"))
        self.assertEqual(update["update_hash"], "sha256:" + hashlib.sha256(package.read_bytes()).hexdigest())
        self.assertEqual(update["applications"]["zotero"], {
            "strict_min_version": settings["strict_min_version"],
            "strict_max_version": settings["strict_max_version"],
        })

    def test_next_version_replaces_feed_with_new_package_and_hash(self):
        original = self.build_package().read_bytes()
        path = self.root / "manifest.json"
        manifest = json.loads(path.read_text(encoding="utf-8"))
        version_parts = manifest["version"].split(".")
        version_parts[-1] = str(int(version_parts[-1]) + 1)
        next_version = ".".join(version_parts)
        manifest["version"] = next_version
        path.write_text(json.dumps(manifest), encoding="utf-8")
        package = self.build_package()
        feed = json.loads((self.root / "dist" / "updates.json").read_text(encoding="utf-8"))
        update, = feed["addons"][manifest["applications"]["zotero"]["id"]]["updates"]
        self.assertEqual(update["version"], next_version)
        self.assertTrue(update["update_link"].endswith(f"/v{next_version}/zotero-batch-add-info-{next_version}.xpi"))
        self.assertNotEqual(package.read_bytes(), original)
        self.assertEqual(update["update_hash"], "sha256:" + hashlib.sha256(package.read_bytes()).hexdigest())

    def test_placeholder_update_url_does_not_produce_a_release(self):
        path = self.root / "manifest.json"
        manifest = json.loads(path.read_text(encoding="utf-8"))
        manifest["applications"]["zotero"]["update_url"] = "https://example.invalid/updates.json"
        path.write_text(json.dumps(manifest), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "manifest update_url"):
            self.build_package()
        self.assertFalse((self.root / "dist").exists())


if __name__ == "__main__":
    unittest.main()
