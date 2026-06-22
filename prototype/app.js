const state = {
  catalog: null,
  imageById: new Map(),
  objects: [],
  filteredObjects: [],
  selectedPhase: "all",
  selectedObjectId: null,
  selectedImageId: null,
  query: "",
  nature: "all",
  status: "all",
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

function applyFilters() {
  state.filteredObjects = state.objects.filter(matchesFilters);
  if (!state.filteredObjects.some((object) => object.id === state.selectedObjectId)) {
    state.selectedObjectId = state.filteredObjects[0]?.id ?? null;
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
  const phase = state.selectedPhase === "all" ? null : state.catalog.phases.find((item) => item.id === state.selectedPhase);
  els.viewTitle.textContent = phase ? phase.label : "全部条目";
  els.viewSubtitle.textContent = `${state.filteredObjects.length} 件符合当前筛选`;
}

function renderGallery() {
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
  action();
  if (els.gallery) {
    els.gallery.scrollTop = scrollTop;
    requestAnimationFrame(() => {
      els.gallery.scrollTop = scrollTop;
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
    state.selectedObjectId = state.objects[0]?.id ?? null;
    render();
  } catch (error) {
    els.stats.textContent = "载入失败";
    els.gallery.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

init();
