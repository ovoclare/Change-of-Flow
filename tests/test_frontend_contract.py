import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class FrontendContractTests(unittest.TestCase):
    def read(self, relative: str) -> str:
        return (ROOT / relative).read_text(encoding="utf-8")

    def test_selection_render_preserves_gallery_scroll(self):
        app = self.read("prototype/app.js")
        self.assertIn("function preserveGalleryScroll", app)
        self.assertIn("preserveGalleryScroll(() => render())", app)

    def test_cards_expose_period_and_kiln_metadata(self):
        app = self.read("prototype/app.js")
        self.assertIn("card-meta-grid", app)
        self.assertIn("object.era", app)
        self.assertIn("object.kilnOrCulture", app)
        self.assertIn("object.phaseLabel", app)

    def test_detail_title_is_outside_image_stage(self):
        html = self.read("prototype/index.html")
        self.assertIn('id="detailHeader"', html)
        self.assertLess(html.index('id="detailHeader"'), html.index('class="image-stage"'))

    def test_card_title_has_three_line_room(self):
        css = self.read("prototype/styles.css")
        self.assertIn("-webkit-line-clamp: 3", css)
        self.assertIn("grid-auto-rows: 292px", css)


if __name__ == "__main__":
    unittest.main()
