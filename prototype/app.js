const ERA_ORDER = [
  "新石器时代",
  "夏",
  "夏—商—周",
  "商",
  "商—周",
  "西周",
  "东周",
  "春秋",
  "战国",
  "战国—汉",
  "秦",
  "汉",
  "三国",
  "魏晋南北朝",
  "隋",
  "唐",
  "五代",
  "五代—宋",
  "辽",
  "宋",
  "金",
  "宋—元",
  "元",
  "元—明",
  "明",
  "清",
  "清—民国",
  "民国",
  "现代",
  "待判断",
];

const TIMELINE_ALL_KILNS = "__all__";
const TIMELINE_EDGE_SCROLL_ZONE = 92;
const TIMELINE_EDGE_SCROLL_MAX_SPEED = 18;

const timelineEdgeScroll = {
  velocity: 0,
  frameId: null,
};

const state = {
  catalog: null,
  imageById: new Map(),
  objects: [],
  filteredObjects: [],
  viewMode: "grid",
  selectedPhase: "all",
  selectedObjectId: null,
  selectedImageId: null,
  query: "",
  nature: "all",
  status: "all",
  timelineKiln: TIMELINE_ALL_KILNS,
  reviewSaveMessage: "",
};

const els = {
  stats: document.querySelector("#stats"),
  phaseNav: document.querySelector("#phaseNav"),
  mergeSummary: document.querySelector("#mergeSummary"),
  gallery: document.querySelector("#gallery"),
  viewTitle: document.querySelector("#viewTitle"),
  viewSubtitle: document.querySelector("#viewSubtitle"),
  detailHeader: document.querySelector("#detailHeader"),
  detailContent: document.querySelector("#detailContent"),
  mainImage: document.querySelector("#mainImage"),
  imageStrip: document.querySelector("#imageStrip"),
  searchInput: document.querySelector("#searchInput"),
  natureFilter: document.querySelector("#natureFilter"),
  statusFilter: document.querySelector("#statusFilter"),
  clearFilters: document.querySelector("#clearFilters"),
  gridViewMode: document.querySelector("#gridViewMode"),
  timelineViewMode: document.querySelector("#timelineViewMode"),
  timelineKilnSelect: document.querySelector("#timelineKilnSelect"),
  prevObject: document.querySelector("#prevObject"),
  nextObject: document.querySelector("#nextObject"),
};

async function loadCatalog() {
  const response = await fetch("/api/catalog", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`无法读取目录索引：${response.status}`);
  }
  return response.json();
}

function imageUrl(imageId) {
  return `/image/${encodeURIComponent(imageId)}`;
}

function firstNormalImage(object) {
  const imageId = object.imageIds.find((id) => state.imageById.get(id)?.fileStatus === "normal") ?? object.imageIds[0];
  return state.imageById.get(imageId);
}

function objectSearchText(object) {
  const images = object.imageIds.map((id) => state.imageById.get(id)).filter(Boolean);
  return [
    object.id,
    object.title,
    object.phaseLabel,
    object.era,
    object.vesselType,
    object.kilnOrCulture,
    object.flowForm,
    object.material,
    object.sourceOrCollection,
    object.dataNature,
    ...images.flatMap((image) => [image.fileName, image.relativePath]),
  ]
    .join(" ")
    .toLowerCase();
}

function matchesFilters(object) {
  if (state.selectedPhase !== "all" && object.phaseId !== state.selectedPhase) return false;
  if (state.nature === "core" && !object.isCeramicSpoutCore) return false;
  if (state.nature === "predecessor" && object.isCeramicSpoutCore) return false;
  if (state.status !== "all" && object.reviewStatus !== state.status) return false;
  if (state.query && !objectSearchText(object).includes(state.query.toLowerCase())) return false;
  return true;
}

function selectedTimelineAllKilns() {
  return !state.timelineKiln || state.timelineKiln === TIMELINE_ALL_KILNS;
}

function matchesTimelineFilters(object) {
  if (!matchesFilters(object)) return false;
  if (!selectedTimelineAllKilns() && object.kilnOrCulture !== state.timelineKiln) return false;
  return true;
}

function applyFilters() {
  state.filteredObjects = state.objects.filter(matchesFilters);
  if (state.viewMode === "timeline") {
    ensureTimelineKilnSelection();
  }
  const selectionPool = state.viewMode === "timeline" ? timelineObjects() : state.filteredObjects;
  if (!selectionPool.some((object) => object.id === state.selectedObjectId)) {
    state.selectedObjectId = selectionPool[0]?.id ?? null;
    state.selectedImageId = null;
  }
  render();
}

function phaseCounts() {
  const counts = new Map();
  for (const object of state.objects) {
    counts.set(object.phaseId, (counts.get(object.phaseId) ?? 0) + 1);
  }
  return counts;
}

function availableTimelineKilns() {
  const baseObjects = state.objects.filter(matchesFilters);
  const allEras = new Set(baseObjects.map((object) => timelineEraLabel(object.era)));
  const kilnMap = new Map();
  for (const object of baseObjects) {
    const kiln = object.kilnOrCulture || "待判断";
    if (!kilnMap.has(kiln)) {
      kilnMap.set(kiln, { value: kiln, label: kiln, count: 0, eras: new Set() });
    }
    const item = kilnMap.get(kiln);
    item.count += 1;
    item.eras.add(timelineEraLabel(object.era));
  }
  const kilnOptions = [...kilnMap.values()]
    .map((item) => ({ value: item.value, label: item.label, count: item.count, eraCount: item.eras.size }))
    .sort((a, b) => {
      if (a.label === "待判断") return 1;
      if (b.label === "待判断") return -1;
      return b.eraCount - a.eraCount || b.count - a.count || a.label.localeCompare(b.label, "zh-Hans-CN");
    });
  return [
    { value: TIMELINE_ALL_KILNS, label: "全部", count: baseObjects.length, eraCount: allEras.size },
    ...kilnOptions,
  ];
}

function ensureTimelineKilnSelection() {
  const kilnOptions = availableTimelineKilns();
  const optionValues = new Set(kilnOptions.map((item) => item.value));
  if (!optionValues.has(state.timelineKiln)) {
    state.timelineKiln = TIMELINE_ALL_KILNS;
  }
  return kilnOptions;
}

function timelineObjects() {
  return state.objects.filter(matchesTimelineFilters);
}

function timelineEraLabel(rawEra) {
  const era = String(rawEra || "待判断").trim();
  const compact = era.replace(/\s+/g, "");
  if (!compact || ["待判断", "待考证", "未知"].includes(compact)) return "待判断";

  const rangeRules = [
    [/夏商周/, "夏—商—周"],
    [/商周/, "商—周"],
    [/战国汉代|战国至汉/, "战国—汉"],
    [/五代北宋|五代至宋/, "五代—宋"],
    [/宋元|宋至元/, "宋—元"],
    [/元至明|元明/, "元—明"],
    [/清宣统民国|清末民国|清至民国/, "清—民国"],
  ];
  for (const [pattern, label] of rangeRules) {
    if (pattern.test(compact)) return label;
  }

  if (/新石器|河姆渡|良渚|大汶口|龙山|齐家/.test(compact)) return "新石器时代";
  if (/二里头|夏/.test(compact)) return "夏";
  if (/商/.test(compact)) return "商";
  if (/西周/.test(compact)) return "西周";
  if (/东周/.test(compact)) return "东周";
  if (/春秋/.test(compact)) return "春秋";
  if (/战国/.test(compact)) return "战国";
  if (/秦/.test(compact)) return "秦";
  if (/汉/.test(compact)) return "汉";
  if (/三国/.test(compact)) return "三国";
  if (/魏晋南北朝|魏晋|南北朝|东晋|西晋|南朝|北朝/.test(compact)) return "魏晋南北朝";
  if (/隋/.test(compact)) return "隋";
  if (/唐/.test(compact)) return "唐";
  if (/五代/.test(compact)) return "五代";
  if (/北宋|南宋|宋代|宋/.test(compact)) return "宋";
  if (/辽代|辽/.test(compact)) return "辽";
  if (/金代|金/.test(compact)) return "金";
  if (/元代|元/.test(compact)) return "元";
  if (/明初|明中期|明晚期|明代|明|洪武|永乐|宣德|嘉靖|隆庆|万历/.test(compact)) return "明";
  if (/清代|清|康熙|雍正|乾隆|嘉庆|道光|光绪|宣统|晚清|清末|十八世纪|十九世纪/.test(compact)) return "清";
  if (/民国/.test(compact)) return "民国";
  if (/现代|当代/.test(compact)) return "现代";
  return era;
}

function buildTimelineGroups(objects) {
  const groups = new Map();
  for (const object of objects) {
    const era = timelineEraLabel(object.era);
    if (!groups.has(era)) {
      groups.set(era, []);
    }
    groups.get(era).push(object);
  }
  return [...groups.entries()]
    .map(([era, items]) => ({
      era,
      objects: items.slice().sort((a, b) => a.title.localeCompare(b.title, "zh-Hans-CN")),
    }))
    .sort((a, b) => compareEra(a.era, b.era));
}

function compareEra(a, b) {
  return eraRank(a) - eraRank(b) || String(a).localeCompare(String(b), "zh-Hans-CN");
}

function eraRank(era) {
  const index = ERA_ORDER.indexOf(era || "待判断");
  return index === -1 ? ERA_ORDER.length + 100 : index;
}

function renderPhases() {
  const counts = phaseCounts();
  const allButton = phaseButton({ id: "all", label: "全部条目" }, state.objects.length);
  els.phaseNav.replaceChildren(allButton, ...state.catalog.phases.map((phase) => phaseButton(phase, counts.get(phase.id) ?? 0)));
}

function phaseButton(phase, count) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `phase-button ${state.selectedPhase === phase.id ? "active" : ""}`;
  button.innerHTML = `<strong>${escapeHtml(phase.label)}</strong><span>${count} 件器物</span>`;
  button.addEventListener("click", () => selectPhase(phase.id));
  return button;
}

function selectPhase(phaseId) {
  state.selectedPhase = phaseId;
  state.timelineKiln = TIMELINE_ALL_KILNS;
  state.selectedImageId = null;
  applyFilters();
}

function renderStats() {
  const stats = state.catalog.stats;
  els.stats.textContent = `${stats.objectCount} 件器物 · ${stats.imageCount} 张图 · ${stats.pendingMergeCount} 组待确认`;
}

function renderMergeSummary() {
  const pending = state.catalog.pendingMergeGroups ?? [];
  if (!pending.length) {
    els.mergeSummary.textContent = "暂无候选合并组";
    return;
  }
  const items = pending.slice(0, 6).map((group) => {
    const div = document.createElement("div");
    div.textContent = `${group.objectId} · ${group.title}（${group.imageIds.length} 图）`;
    return div;
  });
  if (pending.length > 6) {
    const more = document.createElement("div");
    more.textContent = `另有 ${pending.length - 6} 组`;
    items.push(more);
  }
  els.mergeSummary.replaceChildren(...items);
}

function renderViewHeader() {
  if (state.viewMode === "timeline") {
    ensureTimelineKilnSelection();
    const objects = timelineObjects();
    const groups = buildTimelineGroups(objects);
    const phase = currentPhase();
    const phaseScope = phase ? phase.label : "全部论文分期";
    const kilnScope = selectedTimelineAllKilns() ? "全部窑口/文化" : state.timelineKiln;
    els.viewTitle.textContent = timelineTitle(phase);
    els.viewSubtitle.textContent = `${groups.length} 个朝代/时期 · ${objects.length} 件器物 · ${phaseScope} · ${kilnScope}`;
    return;
  }
  const phase = currentPhase();
  els.viewTitle.textContent = phase ? phase.label : "全部条目";
  els.viewSubtitle.textContent = `${state.filteredObjects.length} 件符合当前筛选`;
}

function currentPhase() {
  return state.selectedPhase === "all" ? null : state.catalog.phases.find((item) => item.id === state.selectedPhase) ?? null;
}

function timelineTitle(phase) {
  if (phase && !selectedTimelineAllKilns()) {
    return `${shortPhaseLabel(phase.label)} · ${state.timelineKiln}时间轴`;
  }
  if (phase) {
    return `${phase.label}时间轴`;
  }
  if (!selectedTimelineAllKilns()) {
    return `${state.timelineKiln}时间轴`;
  }
  return "全部时间轴";
}

function renderGallery() {
  renderViewControls();
  if (state.viewMode === "timeline") {
    renderTimeline();
    return;
  }
  stopTimelineEdgeScroll();
  els.gallery.className = "gallery";
  if (!state.filteredObjects.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "没有符合条件的条目";
    els.gallery.replaceChildren(empty);
    return;
  }
  const cards = state.filteredObjects.map((object) => {
    const image = firstNormalImage(object);
    const card = document.createElement("article");
    card.className = `object-card ${object.id === state.selectedObjectId ? "active" : ""}`;
    card.tabIndex = 0;
    card.innerHTML = `
      <img class="thumb" src="${image ? imageUrl(image.id) : ""}" alt="${escapeHtml(object.title)}" loading="lazy">
      <div class="card-body">
        <strong class="card-title">${escapeHtml(object.title)}</strong>
        <div class="card-meta-grid">
          <span><b>阶段</b>${escapeHtml(shortPhaseLabel(object.phaseLabel))}</span>
          <span><b>时代</b>${escapeHtml(object.era)}</span>
          <span><b>窑口</b>${escapeHtml(object.kilnOrCulture)}</span>
        </div>
        <div class="tags">
          <span class="tag">${escapeHtml(object.id)}</span>
          <span class="tag ${object.isCeramicSpoutCore ? "core" : "predecessor"}">${escapeHtml(object.dataNature)}</span>
          <span class="tag flow">${escapeHtml(object.flowForm)}</span>
          ${object.imageIds.length > 1 ? `<span class="tag">${object.imageIds.length} 图</span>` : ""}
        </div>
      </div>
    `;
    card.addEventListener("click", () => selectObject(object.id));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectObject(object.id);
      }
    });
    return card;
  });
  els.gallery.replaceChildren(...cards);
}

function renderViewControls() {
  els.gridViewMode.classList.toggle("active", state.viewMode === "grid");
  els.timelineViewMode.classList.toggle("active", state.viewMode === "timeline");
  els.timelineKilnSelect.classList.toggle("hidden", state.viewMode !== "timeline");

  const kilnOptions = ensureTimelineKilnSelection();
  const optionNodes = kilnOptions.map((item) => {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = `${item.label}（${item.eraCount} 朝代/时期 · ${item.count} 件）`;
    option.selected = item.value === state.timelineKiln;
    return option;
  });
  els.timelineKilnSelect.replaceChildren(...optionNodes);
}

function renderTimeline() {
  const objects = timelineObjects();
  const groups = buildTimelineGroups(objects);
  els.gallery.className = "gallery timeline-view";
  if (!groups.length) {
    const empty = document.createElement("div");
    empty.className = "empty timeline-empty";
    empty.textContent = "当前时间轴筛选下没有条目";
    els.gallery.replaceChildren(empty);
    return;
  }
  const board = document.createElement("div");
  board.className = "timeline-board";
  const columns = groups.map((group) => timelineEraColumn(group));
  board.replaceChildren(...columns);
  els.gallery.replaceChildren(board);
}

function timelineEraColumn(group) {
  const representative = representativeObject(group.objects);
  const column = document.createElement("section");
  column.className = "timeline-era";
  if (representative) {
    column.append(timelineFeaturedCard(representative));
  }
  column.append(timelineRail(group));
  const stack = document.createElement("div");
  stack.className = "timeline-stack";
  const smallObjects = representative ? group.objects.filter((object) => object.id !== representative.id) : group.objects;
  const cards = smallObjects.map((object) => timelineObjectCard(object));
  stack.replaceChildren(...cards);
  column.append(stack);
  return column;
}

function timelineRail(group) {
  const rail = document.createElement("div");
  rail.className = "timeline-rail";
  rail.innerHTML = `
    <div class="timeline-marker" aria-hidden="true"><span></span></div>
    <header class="timeline-era-head">
      <h2>${escapeHtml(group.era)}</h2>
      <p>${group.objects.length} 件</p>
    </header>
  `;
  return rail;
}

function representativeObject(objects) {
  return objects
    .slice()
    .sort((a, b) => {
      if (a.isCeramicSpoutCore !== b.isCeramicSpoutCore) {
        return a.isCeramicSpoutCore ? -1 : 1;
      }
      return a.title.localeCompare(b.title, "zh-Hans-CN");
    })[0] ?? null;
}

function timelineFeaturedCard(object) {
  const image = firstNormalImage(object);
  const card = document.createElement("article");
  card.className = `timeline-featured ${object.id === state.selectedObjectId ? "active" : ""}`;
  card.tabIndex = 0;
  card.innerHTML = `
    <img src="${image ? imageUrl(image.id) : ""}" alt="${escapeHtml(object.title)}" loading="lazy">
    <div>
      <span>典型代表</span>
      <strong>${escapeHtml(object.title)}</strong>
      <em>${escapeHtml(object.flowForm)} · ${escapeHtml(object.id)}</em>
    </div>
  `;
  bindTimelineCard(card, object);
  return card;
}

function timelineObjectCard(object) {
  const image = firstNormalImage(object);
  const card = document.createElement("article");
  card.className = `timeline-object ${object.id === state.selectedObjectId ? "active" : ""}`;
  card.tabIndex = 0;
  card.innerHTML = `
    <img src="${image ? imageUrl(image.id) : ""}" alt="${escapeHtml(object.title)}" loading="lazy">
    <div>
      <strong>${escapeHtml(object.title)}</strong>
      <span>${escapeHtml(object.flowForm)} · ${escapeHtml(object.id)}</span>
    </div>
  `;
  bindTimelineCard(card, object);
  return card;
}

function bindTimelineCard(card, object) {
  card.addEventListener("click", () => selectObject(object.id));
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectObject(object.id);
    }
  });
}

function setupTimelineEdgeScroll() {
  els.gallery.addEventListener("mousemove", updateTimelineEdgeScroll);
  els.gallery.addEventListener("mouseleave", stopTimelineEdgeScroll);
}

function updateTimelineEdgeScroll(event) {
  if (state.viewMode !== "timeline" || !els.gallery.classList.contains("timeline-view")) {
    stopTimelineEdgeScroll();
    return;
  }

  const maxScroll = els.gallery.scrollWidth - els.gallery.clientWidth;
  if (maxScroll <= 0) {
    stopTimelineEdgeScroll();
    return;
  }

  const rect = els.gallery.getBoundingClientRect();
  const leftDistance = event.clientX - rect.left;
  const rightDistance = rect.right - event.clientX;
  let velocity = 0;

  if (leftDistance >= 0 && leftDistance < TIMELINE_EDGE_SCROLL_ZONE) {
    const intensity = 1 - leftDistance / TIMELINE_EDGE_SCROLL_ZONE;
    velocity = -Math.max(3, TIMELINE_EDGE_SCROLL_MAX_SPEED * intensity);
  } else if (rightDistance >= 0 && rightDistance < TIMELINE_EDGE_SCROLL_ZONE) {
    const intensity = 1 - rightDistance / TIMELINE_EDGE_SCROLL_ZONE;
    velocity = Math.max(3, TIMELINE_EDGE_SCROLL_MAX_SPEED * intensity);
  }

  timelineEdgeScroll.velocity = velocity;
  els.gallery.classList.toggle("timeline-edge-left-active", velocity < 0);
  els.gallery.classList.toggle("timeline-edge-right-active", velocity > 0);

  if (velocity !== 0 && timelineEdgeScroll.frameId === null) {
    timelineEdgeScroll.frameId = requestAnimationFrame(stepTimelineEdgeScroll);
  }
}

function stepTimelineEdgeScroll() {
  if (state.viewMode !== "timeline" || timelineEdgeScroll.velocity === 0) {
    stopTimelineEdgeScroll();
    return;
  }

  const maxScroll = els.gallery.scrollWidth - els.gallery.clientWidth;
  const nextScrollLeft = Math.max(0, Math.min(maxScroll, els.gallery.scrollLeft + timelineEdgeScroll.velocity));
  els.gallery.scrollLeft = nextScrollLeft;

  if ((nextScrollLeft === 0 && timelineEdgeScroll.velocity < 0) || (nextScrollLeft === maxScroll && timelineEdgeScroll.velocity > 0)) {
    timelineEdgeScroll.velocity = 0;
    els.gallery.classList.remove("timeline-edge-left-active", "timeline-edge-right-active");
  }

  timelineEdgeScroll.frameId = timelineEdgeScroll.velocity === 0 ? null : requestAnimationFrame(stepTimelineEdgeScroll);
}

function stopTimelineEdgeScroll() {
  timelineEdgeScroll.velocity = 0;
  if (timelineEdgeScroll.frameId !== null) {
    cancelAnimationFrame(timelineEdgeScroll.frameId);
    timelineEdgeScroll.frameId = null;
  }
  els.gallery.classList.remove("timeline-edge-left-active", "timeline-edge-right-active");
}

function selectObject(objectId) {
  state.selectedObjectId = objectId;
  state.selectedImageId = null;
  state.reviewSaveMessage = "";
  preserveGalleryScroll(() => render());
}

function selectedObject() {
  return state.objects.find((object) => object.id === state.selectedObjectId) ?? null;
}

function selectedImage(object) {
  if (!object) return null;
  if (state.selectedImageId && object.imageIds.includes(state.selectedImageId)) {
    return state.imageById.get(state.selectedImageId);
  }
  const image = firstNormalImage(object);
  state.selectedImageId = image?.id ?? null;
  return image;
}

function renderDetail() {
  const object = selectedObject();
  const image = selectedImage(object);
  if (!object || !image) {
    els.mainImage.removeAttribute("src");
    els.mainImage.alt = "";
    els.detailHeader.innerHTML = `<div class="empty">请选择一件器物</div>`;
    els.detailContent.innerHTML = `<div class="empty">请选择一件器物</div>`;
    els.imageStrip.replaceChildren();
    return;
  }
  els.mainImage.src = imageUrl(image.id);
  els.mainImage.alt = object.title;
  els.detailHeader.innerHTML = `
    <strong>${escapeHtml(object.id)}</strong>
    <h1>${escapeHtml(object.title)}</h1>
    <span>${escapeHtml(object.phaseLabel)} · ${escapeHtml(object.era)} · ${escapeHtml(object.kilnOrCulture)}</span>
  `;
  els.detailContent.innerHTML = `
    <form id="reviewForm" class="review-form">
      <label>
        <span>审阅状态</span>
        <select id="reviewStatusSelect">
          ${reviewStatusOptions(object.reviewStatus)}
        </select>
      </label>
      <label>
        <span>备注</span>
        <textarea id="notesField" rows="4" placeholder="例如：可入第二章、需补来源、待确认是否同器物">${escapeHtml(object.notes)}</textarea>
      </label>
      <div class="review-actions">
        <button id="saveReview" type="submit">保存审阅</button>
        <button id="clearNotes" class="secondary" type="button">清空备注</button>
        <span id="reviewSaveState" aria-live="polite">${escapeHtml(state.reviewSaveMessage)}</span>
      </div>
    </form>
    <dl class="meta-grid">
      <dt>论文分期</dt><dd>${escapeHtml(object.phaseLabel)}</dd>
      <dt>时代</dt><dd>${escapeHtml(object.era)}</dd>
      <dt>器类</dt><dd>${escapeHtml(object.vesselType)}</dd>
      <dt>窑口/文化</dt><dd>${escapeHtml(object.kilnOrCulture)}</dd>
      <dt>流型</dt><dd>${escapeHtml(object.flowForm)}</dd>
      <dt>材质</dt><dd>${escapeHtml(object.material)}</dd>
      <dt>资料性质</dt><dd>${escapeHtml(object.dataNature)}</dd>
      <dt>壶流关系</dt><dd>${escapeHtml(object.spoutRelation)}</dd>
      <dt>来源</dt><dd>${escapeHtml(object.sourceOrCollection)}</dd>
      <dt>审阅状态</dt><dd>${escapeHtml(object.reviewStatus)}</dd>
      <dt>当前图片</dt><dd>${escapeHtml(image.role)} · ${escapeHtml(image.fileName)}</dd>
    </dl>
    <div class="path-line">${escapeHtml(image.path)}</div>
  `;
  bindReviewForm(object);
  renderImageStrip(object, image.id);
}

function reviewStatusOptions(currentStatus) {
  return ["待审阅", "已审阅", "待确认", "需补来源", "已入论文"]
    .map((status) => `<option value="${escapeHtml(status)}" ${status === currentStatus ? "selected" : ""}>${escapeHtml(status)}</option>`)
    .join("");
}

function bindReviewForm(object) {
  const form = document.querySelector("#reviewForm");
  const saveState = document.querySelector("#reviewSaveState");
  const clearNotes = document.querySelector("#clearNotes");
  clearNotes?.addEventListener("click", () => {
    const notesField = document.querySelector("#notesField");
    if (notesField) {
      notesField.value = "";
      notesField.focus();
    }
    state.reviewSaveMessage = "";
    showReviewSaveMessage();
  });
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const reviewStatusSelect = document.querySelector("#reviewStatusSelect");
    const notesField = document.querySelector("#notesField");
    const saveReview = document.querySelector("#saveReview");
    saveReview.disabled = true;
    saveState.textContent = "保存中";
    try {
      const updated = await saveObjectReview(object.id, {
        reviewStatus: reviewStatusSelect.value,
        notes: notesField.value,
      });
      const mergedObject = mergeUpdatedObject(updated);
      state.reviewSaveMessage = "已保存";
      preserveGalleryScroll(() => applyFilters());
      syncReviewFields(mergedObject);
      showReviewSaveMessage();
    } catch (error) {
      state.reviewSaveMessage = `保存失败：${error.message}`;
      showReviewSaveMessage();
    } finally {
      const currentSaveReview = document.querySelector("#saveReview");
      if (currentSaveReview) {
        currentSaveReview.disabled = false;
      }
    }
  });
}

function mergeUpdatedObject(updated) {
  const index = state.objects.findIndex((object) => object.id === updated.id);
  if (index === -1) return updated;
  const merged = { ...state.objects[index], ...updated };
  state.objects[index] = merged;
  const catalogIndex = state.catalog?.objects?.findIndex((object) => object.id === updated.id) ?? -1;
  if (catalogIndex !== -1) {
    state.catalog.objects[catalogIndex] = merged;
  }
  return merged;
}

function syncReviewFields(object) {
  if (selectedObject()?.id !== object.id) return;
  const reviewStatusSelect = document.querySelector("#reviewStatusSelect");
  const notesField = document.querySelector("#notesField");
  if (reviewStatusSelect) {
    reviewStatusSelect.value = object.reviewStatus ?? "";
  }
  if (notesField) {
    notesField.value = object.notes ?? "";
  }
}

function showReviewSaveMessage() {
  const saveState = document.querySelector("#reviewSaveState");
  if (saveState) {
    saveState.textContent = state.reviewSaveMessage;
  }
}

async function saveObjectReview(objectId, payload) {
  const response = await fetch(`/api/object/${encodeURIComponent(objectId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data.object;
}

function renderImageStrip(object, activeImageId) {
  const thumbs = object.imageIds
    .map((id) => state.imageById.get(id))
    .filter(Boolean)
    .map((image) => {
      const img = document.createElement("img");
      img.className = `strip-thumb ${image.id === activeImageId ? "active" : ""}`;
      img.src = imageUrl(image.id);
      img.alt = image.fileName;
      img.title = image.fileName;
      img.addEventListener("click", () => {
        state.selectedImageId = image.id;
        renderDetail();
      });
      return img;
    });
  els.imageStrip.replaceChildren(...thumbs);
}

function currentSelectionPool() {
  return state.viewMode === "timeline" ? timelineObjects() : state.filteredObjects;
}

function moveSelection(offset) {
  const pool = currentSelectionPool();
  if (!pool.length) return;
  const currentIndex = Math.max(
    0,
    pool.findIndex((object) => object.id === state.selectedObjectId),
  );
  const nextIndex = (currentIndex + offset + pool.length) % pool.length;
  state.selectedObjectId = pool[nextIndex].id;
  state.selectedImageId = null;
  state.reviewSaveMessage = "";
  preserveGalleryScroll(() => render());
}

function render() {
  renderPhases();
  renderStats();
  renderMergeSummary();
  renderViewHeader();
  renderGallery();
  renderDetail();
}

function preserveGalleryScroll(action) {
  const scrollTop = els.gallery?.scrollTop ?? 0;
  const scrollLeft = els.gallery?.scrollLeft ?? 0;
  action();
  if (els.gallery) {
    els.gallery.scrollTop = scrollTop;
    els.gallery.scrollLeft = scrollLeft;
    requestAnimationFrame(() => {
      els.gallery.scrollTop = scrollTop;
      els.gallery.scrollLeft = scrollLeft;
    });
  }
}

function shortPhaseLabel(label) {
  const text = String(label ?? "");
  const prefix = text.split("：")[0];
  const match = text.match(/[（(](.*?)[）)]/);
  return match ? `${prefix}：${match[1]}` : text;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function bindEvents() {
  setupTimelineEdgeScroll();
  els.searchInput.addEventListener("input", (event) => {
    state.query = event.target.value.trim();
    applyFilters();
  });
  els.natureFilter.addEventListener("change", (event) => {
    state.nature = event.target.value;
    applyFilters();
  });
  els.statusFilter.addEventListener("change", (event) => {
    state.status = event.target.value;
    applyFilters();
  });
  els.gridViewMode.addEventListener("click", () => {
    state.viewMode = "grid";
    applyFilters();
  });
  els.timelineViewMode.addEventListener("click", () => {
    state.viewMode = "timeline";
    applyFilters();
  });
  els.timelineKilnSelect.addEventListener("change", (event) => {
    state.timelineKiln = event.target.value;
    state.selectedImageId = null;
    applyFilters();
  });
  els.clearFilters.addEventListener("click", () => {
    state.selectedPhase = "all";
    state.timelineKiln = TIMELINE_ALL_KILNS;
    state.query = "";
    state.nature = "all";
    state.status = "all";
    els.searchInput.value = "";
    els.natureFilter.value = "all";
    els.statusFilter.value = "all";
    applyFilters();
  });
  els.prevObject.addEventListener("click", () => moveSelection(-1));
  els.nextObject.addEventListener("click", () => moveSelection(1));
  document.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    if (event.key === "ArrowLeft") moveSelection(-1);
    if (event.key === "ArrowRight") moveSelection(1);
  });
}

async function init() {
  bindEvents();
  try {
    state.catalog = await loadCatalog();
    state.objects = state.catalog.objects;
    state.filteredObjects = state.objects;
    state.imageById = new Map(state.catalog.images.map((image) => [image.id, image]));
    state.timelineKiln = TIMELINE_ALL_KILNS;
    state.selectedObjectId = state.objects[0]?.id ?? null;
    render();
  } catch (error) {
    els.stats.textContent = "载入失败";
    els.gallery.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

init();
