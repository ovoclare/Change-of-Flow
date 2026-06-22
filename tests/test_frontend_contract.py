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

    def test_review_form_appears_before_metadata(self):
        app = self.read("prototype/app.js")
        self.assertLess(app.index('id="reviewForm"'), app.index('class="meta-grid"'))

    def test_card_title_has_two_line_room(self):
        css = self.read("prototype/styles.css")
        self.assertIn("-webkit-line-clamp: 2", css)
        self.assertIn("grid-auto-rows: 274px", css)

    def test_main_image_stays_inside_image_stage(self):
        css = self.read("prototype/styles.css")
        self.assertIn(".image-stage {\n  position: relative;\n  display: grid;\n  place-items: center;\n  min-height: 0;\n  overflow: hidden;", css)
        self.assertIn("max-height: 100%", css)

    def test_detail_has_editable_review_controls(self):
        app = self.read("prototype/app.js")
        self.assertIn("reviewStatusSelect", app)
        self.assertIn("notesField", app)
        self.assertIn("clearNotes", app)
        self.assertIn("saveReview", app)
        self.assertIn("saveObjectReview", app)
        self.assertIn("showReviewSaveMessage", app)

    def test_timeline_view_controls_exist(self):
        html = self.read("prototype/index.html")
        app = self.read("prototype/app.js")
        self.assertIn('id="gridViewMode"', html)
        self.assertIn('id="timelineViewMode"', html)
        self.assertIn('id="timelineKilnSelect"', html)
        self.assertIn("viewMode", app)
        self.assertIn("renderTimeline", app)
        self.assertIn("buildTimelineGroups", app)

    def test_timeline_groups_one_kiln_by_era(self):
        app = self.read("prototype/app.js")
        self.assertIn("timelineKiln", app)
        self.assertIn("availableTimelineKilns", app)
        self.assertIn("ERA_ORDER", app)
        self.assertIn("object.kilnOrCulture", app)
        self.assertIn("object.era", app)

    def test_timeline_layout_css_exists(self):
        css = self.read("prototype/styles.css")
        self.assertIn(".timeline-view", css)
        self.assertIn(".timeline-era", css)
        self.assertIn(".timeline-object", css)
        self.assertIn("overflow-x: auto", css)

    def test_timeline_has_featured_representative_image(self):
        app = self.read("prototype/app.js")
        css = self.read("prototype/styles.css")
        self.assertIn("representativeObject", app)
        self.assertIn("timelineFeaturedCard", app)
        self.assertIn("timelineRail", app)
        self.assertIn("timeline-featured", app)
        self.assertIn("object.id !== representative.id", app)
        self.assertLess(app.index("timelineFeaturedCard(representative)"), app.index("timelineRail(group)"))
        self.assertIn(".timeline-featured", css)
        self.assertIn(".timeline-featured img", css)

    def test_timeline_hover_expands_cards_in_layout(self):
        app = self.read("prototype/app.js")
        css = self.read("prototype/styles.css")
        self.assertNotIn("imageHoverPreview", app)
        self.assertNotIn("showImageHoverPreview", app)
        self.assertNotIn("positionImageHoverPreview", app)
        self.assertNotIn(".image-hover-preview", css)
        self.assertIn("grid-template-rows: auto auto 1fr", css)
        self.assertIn("grid-template-columns 180ms ease", css)
        self.assertIn("height 180ms ease", css)
        self.assertIn(".timeline-featured:hover img", css)
        self.assertIn(".timeline-object:hover", css)


if __name__ == "__main__":
    unittest.main()
