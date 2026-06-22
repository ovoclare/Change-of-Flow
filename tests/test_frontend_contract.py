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

    def test_searchbar_has_kiln_and_era_filters(self):
        html = self.read("prototype/index.html")
        app = self.read("prototype/app.js")
        self.assertIn('id="kilnFilter"', html)
        self.assertIn('id="eraFilter"', html)
        self.assertIn("kilnFilter", app)
        self.assertIn("eraFilter", app)
        self.assertIn("renderFacetFilters", app)
        self.assertIn("availableKilnFilters", app)
        self.assertIn("availableEraFilters", app)
        self.assertIn("object.kilnOrCulture !== state.kilnFilter", app)
        self.assertIn("timelineEraLabel(object.era) !== state.eraFilter", app)

    def test_timeline_groups_one_kiln_by_era(self):
        app = self.read("prototype/app.js")
        self.assertIn("timelineKiln", app)
        self.assertIn("availableTimelineKilns", app)
        self.assertIn("ERA_ORDER", app)
        self.assertIn("object.kilnOrCulture", app)
        self.assertIn("object.era", app)

    def test_timeline_has_all_option_and_honors_phase_filter(self):
        app = self.read("prototype/app.js")
        self.assertIn('const TIMELINE_ALL_KILNS = "__all__"', app)
        self.assertIn('label: "全部"', app)
        self.assertIn("if (!matchesFilters(object)) return false", app)
        self.assertIn("selectedTimelineAllKilns", app)

    def test_timeline_kiln_selection_does_not_call_itself(self):
        app = self.read("prototype/app.js")
        start = app.index("function ensureTimelineKilnSelection")
        end = app.index("function timelineObjects", start)
        body = app[start:end]
        self.assertIn("availableTimelineKilns()", body)
        self.assertNotIn("const kilnOptions = ensureTimelineKilnSelection();", body)

    def test_phase_click_resets_timeline_kiln_scope(self):
        app = self.read("prototype/app.js")
        self.assertIn("function selectPhase", app)
        self.assertIn("state.timelineKiln = TIMELINE_ALL_KILNS", app)
        self.assertIn('button.addEventListener("click", () => selectPhase(phase.id))', app)
        self.assertNotIn('state.selectedPhase = "all";\n    applyFilters();\n  });\n  els.timelineKilnSelect', app)

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

    def test_timeline_limits_thumbnail_stack_and_links_to_filtered_grid(self):
        app = self.read("prototype/app.js")
        css = self.read("prototype/styles.css")
        self.assertIn("TIMELINE_PREVIEW_LIMIT = 3", app)
        self.assertIn("smallObjects.slice(0, TIMELINE_PREVIEW_LIMIT)", app)
        self.assertIn("timelineMoreButton", app)
        self.assertIn("showKilnGrid", app)
        self.assertIn("showEraGrid", app)
        self.assertIn("state.viewMode = \"grid\"", app)
        self.assertIn("state.kilnFilter = kiln", app)
        self.assertIn("state.eraFilter = era", app)
        self.assertIn("timeline-era-title-button", app)
        self.assertIn(".timeline-more-button", css)
        self.assertIn(".timeline-era-title-button", css)

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

    def test_timeline_edge_hover_auto_scroll_exists(self):
        app = self.read("prototype/app.js")
        css = self.read("prototype/styles.css")
        self.assertIn("TIMELINE_EDGE_SCROLL_ZONE", app)
        self.assertIn("timelineEdgeScroll", app)
        self.assertIn("setupTimelineEdgeScroll", app)
        self.assertIn("updateTimelineEdgeScroll", app)
        self.assertIn("requestAnimationFrame", app)
        self.assertIn("els.gallery.scrollLeft", app)
        self.assertIn('els.gallery.addEventListener("mousemove"', app)
        self.assertIn('els.gallery.addEventListener("mouseleave"', app)
        self.assertIn(".gallery.timeline-view::before", css)
        self.assertIn(".gallery.timeline-view::after", css)
        self.assertIn("linear-gradient", css)
        self.assertIn('content: "‹"', css)
        self.assertIn('content: "›"', css)
        self.assertIn("pointer-events: none", css)

    def test_timeline_drag_scroll_and_boundary_fades_exist(self):
        app = self.read("prototype/app.js")
        css = self.read("prototype/styles.css")
        self.assertIn("timelineDragScroll", app)
        self.assertIn("startTimelineDragScroll", app)
        self.assertIn("moveTimelineDragScroll", app)
        self.assertIn("endTimelineDragScroll", app)
        self.assertIn("updateTimelineEdgeAvailability", app)
        self.assertIn("event.button !== 0", app)
        self.assertIn('els.gallery.addEventListener("mousedown"', app)
        self.assertIn('els.gallery.addEventListener("scroll"', app)
        self.assertIn('document.addEventListener("mousemove"', app)
        self.assertIn('document.addEventListener("mouseup"', app)
        self.assertIn("timeline-at-left", app)
        self.assertIn("timeline-at-right", app)
        self.assertIn(".gallery.timeline-view.timeline-at-left::before", css)
        self.assertIn(".gallery.timeline-view.timeline-at-right::after", css)
        self.assertIn("cursor: grabbing", css)

    def test_timeline_uses_dynasty_level_era_labels(self):
        app = self.read("prototype/app.js")
        self.assertIn("function timelineEraLabel", app)
        self.assertIn('[/清宣统民国|清末民国|清至民国/, "清—民国"]', app)
        self.assertIn('if (/明初|明中期|明晚期|明代|明|洪武|永乐|宣德|嘉靖|隆庆|万历/.test(compact)) return "明";', app)
        self.assertIn('if (/清代|清|康熙|雍正|乾隆|嘉庆|道光|光绪|宣统|晚清|清末|十八世纪|十九世纪/.test(compact)) return "清";', app)
        self.assertIn("const era = timelineEraLabel(object.era);", app)

    def test_timeline_labels_count_dynasties_not_fine_periods(self):
        app = self.read("prototype/app.js")
        self.assertIn("个朝代/时期", app)
        self.assertIn("朝代/时期 ·", app)


if __name__ == "__main__":
    unittest.main()
