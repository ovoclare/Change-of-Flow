import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import scripts.serve as serve
from scripts.serve import update_object_metadata


class ServeTests(unittest.TestCase):
    def test_updates_review_status_and_notes_for_one_object(self):
        catalog = {
            "objects": [
                {"id": "HL-0001", "title": "甲", "reviewStatus": "待审阅", "notes": ""},
                {"id": "HL-0002", "title": "乙", "reviewStatus": "待审阅", "notes": ""},
            ]
        }

        updated = update_object_metadata(
            catalog,
            "HL-0002",
            {"reviewStatus": "已审阅", "notes": "可用于第二章"},
        )

        self.assertTrue(updated)
        self.assertEqual(catalog["objects"][0]["reviewStatus"], "待审阅")
        self.assertEqual(catalog["objects"][1]["reviewStatus"], "已审阅")
        self.assertEqual(catalog["objects"][1]["notes"], "可用于第二章")

    def test_empty_notes_clear_previous_notes(self):
        catalog = {"objects": [{"id": "HL-0001", "reviewStatus": "待审阅", "notes": "旧备注"}]}

        updated = update_object_metadata(catalog, "HL-0001", {"notes": ""})

        self.assertTrue(updated)
        self.assertEqual(catalog["objects"][0]["notes"], "")

    def test_rejects_unknown_review_status(self):
        catalog = {"objects": [{"id": "HL-0001", "reviewStatus": "待审阅", "notes": ""}]}

        with self.assertRaises(ValueError):
            update_object_metadata(catalog, "HL-0001", {"reviewStatus": "乱写"})

    def test_returns_false_for_missing_object(self):
        catalog = {"objects": [{"id": "HL-0001", "reviewStatus": "待审阅", "notes": ""}]}

        self.assertFalse(update_object_metadata(catalog, "HL-9999", {"reviewStatus": "已审阅"}))


class SourceRootDiscoveryTests(unittest.TestCase):
    def make_image(self, root: Path) -> None:
        root.mkdir(parents=True, exist_ok=True)
        (root / "sample.png").write_bytes(b"not really an image, but enough for extension scan")

    def test_finds_codex_sibling_of_program_folder(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp) / "1形制图谱"
            project_root = base / "壶流图库程序"
            data_root = base / "codex整理"
            (project_root / "data").mkdir(parents=True)
            self.make_image(data_root)

            with patch.object(serve, "PROJECT_ROOT", project_root), patch.object(serve, "CATALOG_PATH", project_root / "data" / "catalog.json"):
                self.assertEqual(serve.find_source_root(), data_root.resolve())

    def test_finds_codex_when_program_folder_is_accidentally_nested(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp) / "1形制图谱"
            project_root = base / "壶流图库程序" / "壶流图库程序"
            data_root = base / "codex整理"
            (project_root / "data").mkdir(parents=True)
            self.make_image(data_root)

            with patch.object(serve, "PROJECT_ROOT", project_root), patch.object(serve, "CATALOG_PATH", project_root / "data" / "catalog.json"):
                self.assertEqual(serve.find_source_root(), data_root.resolve())


if __name__ == "__main__":
    unittest.main()
