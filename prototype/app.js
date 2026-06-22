const ERA_ORDER = [
  "河姆渡文化",
  "大汶口文化",
  "良渚文化",
  "龙山文化",
  "二里头文化",
  "商",
  "商早期",
  "商周",
  "西周",
  "战国",
  "汉",
  "东晋",
  "魏晋南北朝",
  "南朝",
  "唐",
  "北宋",
  "南宋",
  "宋元",
  "明洪武",
  "明永乐",
  "明宣德",
  "明嘉靖",
  "明隆庆",
  "明万历",
  "明",
  "明晚期",
  "清康熙",
  "清乾隆",
  "晚清",
  "待判断",
];

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
  timelineKiln: "",
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

let imageHoverPreview = null;

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

function matchesTimelineFilters(object) {
  if (state.timelineKiln && object.kilnOrCulture !== state.timelineKiln) return false;
  if (state.nature === "core" && !object.isCeramicSpoutCore) return false;
  if (state.nature === "predecessor" && object.isCeramicSpoutCore) return false;
  if (state.status !== "all" && object.reviewStatus !== state.status) return false;
  if (state.query && !objectSearchText(object).includes(state.query.toLowerCase())) return false;
  return true;
}

function applyFilters() {
  state.filteredObjects = state.objects.filter(matchesFilters);
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
  const kilnMap = new Map();
  for (const object of state.objects) {
    const kiln = object.kilnOrCulture || "待判断";
    if (!kilnMap.has(kiln)) {
      kilnMap.set(kiln, { label: kiln, count: 0, eras: new Set() });
    }
    const item = kilnMap.get(kiln);
    item.count += 1;
    item.eras.add(object.era || "待判断");
  }
  return [...kilnMap.values()]
    .map((item) => ({ label: item.label, count: item.count, eraCount: item.eras.size }))
    .sort((a, b) => {
      if (a.label === "待判断") return 1;
      if (b.label === "待判断") return -1;
      return b.eraCount - a.eraCount || b.count - a.count || a.label.localeCompare(b.label, "zh-Hans-CN");
    });
}

function timelineObjects() {
  return state.objects.filter(matchesTimelineFilters);
}

function buildTimelineGroups(objects) {
  const groups = new Map();
  for (const object of objects) {
    const era = object.era || "待判断";
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
  button.addEventListener("click", () => {
    state.selectedPhase = phase.id;
    applyFilters();
  });
  return button;
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
    const objects = timelineObjects();
    const groups = buildTimelineGroups(objects);
    els.viewTitle.textContent = `${state.timelineKiln || "未选择窑口"}时间轴`;
    els.viewSubtitle.textContent = `${groups.length} 个时代 · ${objects.length} 件器物，按窑口/文化观察形制变化`;
    return;
  }
  const phase = state.selectedPhase === "all" ? null : state.catalog.phases.find((item) => item.id === state.selectedPhase);
  els.viewTitle.textContent = phase ? phase.label : "全部条目";
  els.viewSubtitle.textContent = `${state.filteredObjects.length} 件符合当前筛选`;
}

function renderGallery() {
  renderViewControls();
  if (state.viewMode === "timeline") {
    renderTimeline();
    return;
  }
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

  const kilnOptions = availableTimelineKilns();
  if (!state.timelineKiln && kilnOptions.length) {
    state.timelineKiln = kilnOptions[0].label;
  }
  const optionNodes = kilnOptions.map((item) => {
    const option = document.createElement("option");
    option.value = item.label;
    option.textContent = `${item.label}（${item.eraCount} 期 · ${item.count} 件）`;
    option.selected = item.label === state.timelineKiln;
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
    empty.textContent = "这个窑口在当前筛选下没有条目";
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
  column.innerHTML = `
    <div class="timeline-marker" aria-hidden="true"><span></span></div>
    <header class="timeline-era-head">
      <h2>${escapeHtml(group.era)}</h2>
      <p>${group.objects.length} 件</p>
    </header>
  `;
  if (representative) {
    column.append(timelineFeaturedCard(representative));
  }
  const stack = document.createElement("div");
  stack.className = "timeline-stack";
  const smallObjects = representative ? group.objects.filter((object) => object.id !== representative.id) : group.objects;
  const cards = smallObjects.map((object) => timelineObjectCard(object));
  stack.replaceChildren(...cards);
  column.append(stack);
  return column;
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
  bindTimelineCard(card, object, image);
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
  bindTimelineCard(card, object, image);
  return card;
}

function bindTimelineCard(card, object, image) {
  card.addEventListener("click", () => selectObject(object.id));
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectObject(object.id);
    }
  });
  if (!image) return;
  card.addEventListener("pointerenter", (event) => showImageHoverPreview(image, object.title, event));
  card.addEventListener("pointermove", positionImageHoverPreview);
  card.addEventListener("pointerleave", hideImageHoverPreview);
  card.addEventListener("mouseenter", (event) => showImageHoverPreview(image, object.title, event));
  card.addEventListener("mousemove", positionImageHoverPreview);
  card.addEventListener("mouseleave", hideImageHoverPreview);
  card.addEventListener("focus", (event) => showImageHoverPreview(image, object.title, event));
  card.addEventListener("blur", hideImageHoverPreview);
}

function ensureImageHoverPreview() {
  if (imageHoverPreview) return imageHoverPreview;
  imageHoverPreview = document.createElement("div");
  imageHoverPreview.id = "imageHoverPreview";
  imageHoverPreview.className = "image-hover-preview";
  imageHoverPreview.innerHTML = `<img alt=""><span></span>`;
  document.body.append(imageHoverPreview);
  return imageHoverPreview;
}

function showImageHoverPreview(image, title, event) {
  const preview = ensureImageHoverPreview();
  const img = preview.querySelector("img");
  const caption = preview.querySelector("span");
  img.src = imageUrl(image.id);
  img.alt = title;
  caption.textContent = title;
  preview.classList.add("visible");
  positionImageHoverPreview(event);
}

function positionImageHoverPreview(event) {
  if (!imageHoverPreview) return;
  const point = event.touches?.[0] ?? event;
  const margin = 18;
  const previewWidth = imageHoverPreview.offsetWidth || 280;
  const previewHeight = imageHoverPreview.offsetHeight || 330;
  let left = point.clientX + margin;
  let top = point.clientY + margin;
  if (left + previewWidth > window.innerWidth - margin) {
    left = point.clientX - previewWidth - margin;
  }
  if (top + previewHeight > window.innerHeight - margin) {
    top = window.innerHeight - previewHeight - margin;
  }
  imageHoverPreview.style.transform = `translate3d(${Math.max(margin, left)}px, ${Math.max(margin, top)}px, 0) scale(1)`;
}

function hideImageHoverPreview() {
  if (!imageHoverPreview) return;
  imageHoverPreview.classList.remove("visible");
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

function moveSelection(offset) {
  if (!state.filteredObjects.length) return;
  const currentIndex = Math.max(
    0,
    state.filteredObjects.findIndex((object) => object.id === state.selectedObjectId),
  );
  const nextIndex = (currentIndex + offset + state.filteredObjects.length) % state.filteredObjects.length;
  state.selectedObjectId = state.filteredObjects[nextIndex].id;
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
    state.selectedPhase = "all";
    applyFilters();
  });
  els.timelineKilnSelect.addEventListener("change", (event) => {
    state.timelineKiln = event.target.value;
    state.selectedImageId = null;
    applyFilters();
  });
  els.clearFilters.addEventListener("click", () => {
    state.selectedPhase = "all";
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
    state.timelineKiln = availableTimelineKilns()[0]?.label ?? "";
    state.selectedObjectId = state.objects[0]?.id ?? null;
    render();
  } catch (error) {
    els.stats.textContent = "载入失败";
    els.gallery.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

init();
