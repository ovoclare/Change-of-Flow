import unittest

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


if __name__ == "__main__":
    unittest.main()
