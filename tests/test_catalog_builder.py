import tempfile
import unittest
from pathlib import Path

from scripts.catalog_builder import build_catalog, classify_phase, normalize_object_title


PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n"
    b"\x00\x00\x00\rIHDR"
    b"\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00"
    b"\x90wS\xde"
    b"\x00\x00\x00\x00IEND\xaeB`\x82"
)


class CatalogBuilderTests(unittest.TestCase):
    def write_png(self, root: Path, relative: str) -> Path:
        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(PNG_BYTES)
        return path

    def test_classifies_thesis_phases_from_period_paths(self):
        self.assertEqual(
            classify_phase(Path("01_按时期分类/01_潜龙勿用_新石器时代/图.png"))["id"],
            "yuan_origin",
        )
        self.assertEqual(
            classify_phase(Path("01_按时期分类/02_见龙在田_夏商至秦汉/青铜盉流/图.jpg"))["id"],
            "heng_diverse",
        )
        self.assertEqual(
            classify_phase(Path("01_按时期分类/03_或跃在渊_魏晋至隋唐五代/图.png"))["id"],
            "li_mature",
        )
        self.assertEqual(
            classify_phase(Path("01_按时期分类/04_飞龙在天_宋元至明清/图.png"))["id"],
            "zhen_peak",
        )
        self.assertEqual(
            classify_phase(Path("01_按时期分类/05_亢龙有悔_晚清至现代/图.png"))["id"],
            "modern_supplement",
        )

    def test_normalizes_numbered_views_to_one_object_title(self):
        self.assertEqual(normalize_object_title("河姆渡文化鸟形盉 (1).png"), "河姆渡文化鸟形盉")
        self.assertEqual(normalize_object_title("龙首青铜盉-2.jpg"), "龙首青铜盉")
        self.assertEqual(normalize_object_title("大汶口文化猪形陶鬹.png"), "大汶口文化猪形陶鬶")

    def test_groups_numbered_views_under_one_object(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.write_png(root, "01_按时期分类/01_潜龙勿用_新石器时代/河姆渡文化鸟形盉 (1).png")
            self.write_png(root, "01_按时期分类/01_潜龙勿用_新石器时代/河姆渡文化鸟形盉 (2).png")

            catalog = build_catalog(root, existing_catalog=None)

            self.assertEqual(len(catalog["objects"]), 1)
            self.assertEqual(catalog["objects"][0]["id"], "HL-0001")
            self.assertEqual(catalog["objects"][0]["title"], "河姆渡文化鸟形盉")
            self.assertEqual(len(catalog["objects"][0]["imageIds"]), 2)

    def test_preserves_existing_object_and_image_ids(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            image = self.write_png(root, "01_按时期分类/04_飞龙在天_宋元至明清/宋-湖田窑-影青执壶.png")
            first = build_catalog(root, existing_catalog=None)
            first["objects"][0]["reviewStatus"] = "已审阅"

            second = build_catalog(root, existing_catalog=first)

            self.assertEqual(second["objects"][0]["id"], first["objects"][0]["id"])
            self.assertEqual(second["objects"][0]["reviewStatus"], "已审阅")
            self.assertEqual(second["images"][0]["id"], first["images"][0]["id"])
            self.assertEqual(Path(second["images"][0]["path"]), image)

    def test_retains_missing_images_without_deleting_records(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            image = self.write_png(root, "01_按时期分类/03_或跃在渊_魏晋至隋唐五代/唐-白釉侈口曲柄注子.png")
            first = build_catalog(root, existing_catalog=None)
            image.unlink()

            second = build_catalog(root, existing_catalog=first)

            self.assertEqual(len(second["objects"]), 1)
            self.assertEqual(second["images"][0]["fileStatus"], "missing")


if __name__ == "__main__":
    unittest.main()
