(() => {
"use strict";
const { createStore, createCamera, applyImageFilter, normalizeFilter, newFilterSeed, canvasBlob, portraitForPhoto, formatTime, fillPhotoDetail } = window.PicSnapGuestbook;

const $ = (id) => document.getElementById(id);
let store, draft = null, previewURL = null, saving = false, starting = false;
let originalPhoto = null, selectedFilter = "none", rendering = false, preparingPhoto = false, renderVersion = 0;
let debugMode = false, debugKeyPresses = 0;
let portraitPromise = null;
let listVersion = 0, offset = 0, total = 0;
let filters = { name: "", date: "" };
let cardURLs = [];
let pendingDeletion = null, deleting = false;
const limit = 24;

function expandCamera() {
  $("camera-dialog-stage").append($("camera-stage"));
  $("camera-dialog").showModal();
  document.body.classList.add("camera-expanded");
}
function restoreCamera() {
  $("camera-dialog").close();
  $("camera-stage-slot").append($("camera-stage"));
  document.body.classList.remove("camera-expanded");
}
function cancelCapture(message = "촬영을 중지했습니다. 카메라를 다시 시작할 수 있습니다.") {
  camera.stop();
  starting = false;
  restoreCamera();
  $("camera-placeholder").hidden = false;
  $("camera-canvas").hidden = true;
  feedback("camera-status", message);
  updateControls();
  $("start-camera").focus({ preventScroll: true });
}
function feedback(id, message, error = false) {
  $(id).textContent = message;
  $(id).classList.toggle("is-error", error);
}
function updateControls() {
  const debugDraft = Boolean(draft && !originalPhoto);
  $("guest-name").disabled = !draft || saving;
  $("guest-comment").disabled = !draft || saving;
  $("guest-email").disabled = !draft || saving || !store?.shared;
  $("email-note").textContent = !store?.shared
    ? "이메일 전송은 공유 서버에서 이용할 수 있습니다."
    : store.emailConfigured
      ? "입력한 이메일로 방명록 PNG를 보내드립니다."
      : "이메일 발송 준비 중입니다. 연결 완료 후 입력한 주소로 보내드립니다.";
  $("save-entry").disabled = !draft || !store || saving || rendering || preparingPhoto;
  $("retake").hidden = debugMode;
  $("retake").disabled = !draft || saving;
  $("start-camera").disabled = starting || saving || preparingPhoto;
  $("upload-photo").disabled = starting || saving || preparingPhoto;
  $("entry-photo-filters").hidden = debugDraft;
  $("entry-photo-note").hidden = debugDraft;
  document.querySelectorAll("[data-photo-filter]").forEach((button) => { button.disabled = saving || preparingPhoto || debugDraft; });
  $("close-entry").disabled = saving;
  $("resume-entry").hidden = !draft;
  $("resume-entry").textContent = debugDraft ? "디버그 방명록 이어쓰기" : "촬영한 사진 확인 · 글 남기기";
  $("resume-entry").disabled = saving;
  $("discard-draft").hidden = !draft;
  $("discard-draft").textContent = debugDraft ? "디버그 작성 취소" : "촬영 취소 · 사진 삭제";
  $("discard-draft").disabled = saving || preparingPhoto;
}
function clearDraft() {
  $("guest-email").value = "";
  $("entry-dialog").close();
  draft = null;
  originalPhoto = null;
  portraitPromise = null;
  renderVersion++;
  rendering = false;
  feedback("filter-status", "");
  if (previewURL) URL.revokeObjectURL(previewURL);
  previewURL = null;
  $("capture-preview").removeAttribute("src");
  $("capture-preview").hidden = true;
  $("entry-preview").removeAttribute("src");
  $("capture-time").removeAttribute("datetime");
  $("capture-time").textContent = "촬영하면 자동으로 기록됩니다.";
  updateControls();
}
function showEntryDialog() {
  if (!draft || $("entry-dialog").open) return;
  $("entry-title").textContent = originalPhoto ? "이 사진의 주인공은?" : "디버그 방명록";
  $("entry-description").textContent = originalPhoto
    ? "사진과 필터를 확인하고 이름과 코멘트를 남겨주세요."
    : "디버그 이미지와 함께 이름과 코멘트를 저장합니다.";
  $("dialog-storage-note").textContent = $("storage-note").textContent;
  $("entry-dialog").showModal();
  document.body.classList.add("entry-dialog-open");
  $("guest-name").focus({ preventScroll: true });
}
const camera = createCamera({
  video: $("webcam"), canvas: $("camera-canvas"), countdown: $("countdown"),
  status: (message) => feedback("camera-status", message),
  onError(message) {
    starting = false;
    restoreCamera();
    $("camera-placeholder").hidden = false;
    $("camera-canvas").hidden = true;
    feedback("camera-status", message, true);
    updateControls();
  },
  onCapture: showCaptureDraft,
});
async function showCaptureDraft(capture) {
  starting = false;
  restoreCamera();
  originalPhoto = capture.original;
  portraitPromise = capture.filter === "glitch" ? Promise.resolve(capture.portrait) : null;
  selectedFilter = capture.filter;
  syncFilterButtons();
  draft = { photo: capture.photo, capturedAt: capture.capturedAt, filter: capture.filter, seed: capture.seed, id: crypto.randomUUID() };
  previewURL = URL.createObjectURL(capture.photo);
  $("capture-preview").src = $("entry-preview").src = previewURL;
  $("capture-preview").hidden = false;
  $("camera-placeholder").hidden = true;
  $("camera-canvas").hidden = true;
  $("capture-time").dateTime = capture.capturedAt;
  $("capture-time-label").textContent = originalPhoto ? "촬영 날짜와 시간" : "작성 날짜와 시간";
  $("capture-time").textContent = formatTime(capture.capturedAt);
  feedback("camera-status", originalPhoto
    ? "촬영이 완료되었습니다. 이름과 코멘트를 입력해 방명록에 남겨주세요."
    : "디버그 모드가 활성화되었습니다.");
  updateControls();
  feedback("filter-status", capture.filter === "glitch" && !capture.portrait ? "얼굴을 찾지 못해 원본으로 표시합니다. 얼굴이 잘 보이는 사진을 선택해 주세요." : "");
  const capturedDraft = draft;
  await $("entry-preview").decode().catch(() => {});
  if (draft === capturedDraft) showEntryDialog();
}
document.querySelectorAll("[data-photo-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    selectedFilter = normalizeFilter(button.dataset.photoFilter);
    camera.setFilter(selectedFilter);
    syncFilterButtons();
    if (draft && originalPhoto) renderDraft();
  });
});
function syncFilterButtons() {
  document.querySelectorAll("[data-photo-filter]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.photoFilter === selectedFilter));
  });
}
async function renderDraft() {
  const currentDraft = draft, source = originalPhoto, filter = selectedFilter;
  const version = ++renderVersion;
  rendering = true; updateControls();
  feedback("filter-status", "필터를 적용하고 있습니다…");
  try {
    // Yield to paint the selected button before pixel processing. Keep the old
    // photo visible until a complete replacement has decoded.
    await new Promise(requestAnimationFrame);
    if (version !== renderVersion || draft !== currentDraft) return;
    let portrait = null;
    if (filter === "glitch") {
      feedback("filter-status", "얼굴 위치를 분석하고 있습니다…");
      if (!portraitPromise) {
        const analysis = portraitForPhoto(source);
        portraitPromise = analysis;
        analysis.catch(() => { if (portraitPromise === analysis) portraitPromise = null; });
      }
      portrait = await portraitPromise;
      if (version !== renderVersion || draft !== currentDraft) return;
    }
    const output = document.createElement("canvas");
    output.width = source.width; output.height = source.height;
    const context = output.getContext("2d", { willReadFrequently: true });
    context.drawImage(source, 0, 0);
    applyImageFilter(context, filter, currentDraft.seed, portrait);
    const photo = await canvasBlob(output);
    const url = URL.createObjectURL(photo);
    const decoded = new Image(); decoded.src = url;
    try { await decoded.decode(); }
    catch (error) { URL.revokeObjectURL(url); throw error; }
    if (version !== renderVersion || draft !== currentDraft) { URL.revokeObjectURL(url); return; }
    const previousURL = previewURL;
    previewURL = url;
    draft.photo = photo; draft.filter = filter;
    $("entry-preview").src = url;
    $("capture-preview").src = url;
    if (previousURL) URL.revokeObjectURL(previousURL);
    feedback("filter-status", filter === "glitch" && !portrait ? "얼굴을 찾지 못해 원본으로 표시합니다. 얼굴이 잘 보이는 사진을 선택해 주세요." : "");
  } catch (error) {
    if (version === renderVersion && draft === currentDraft) {
      selectedFilter = currentDraft.filter;
      camera.setFilter(selectedFilter); syncFilterButtons();
      feedback("filter-status", "필터를 적용하지 못했습니다. 다시 선택해 주세요.", true);
    }
  } finally {
    if (version === renderVersion) { rendering = false; updateControls(); }
  }
}
$("upload-photo").addEventListener("click", () => $("photo-file").click());
$("photo-file").addEventListener("change", async () => {
  const file = $("photo-file").files[0];
  $("photo-file").value = "";
  if (!file || saving || starting || preparingPhoto) return;
  if (!file.type.startsWith("image/") || file.size > 20 * 1024 * 1024) {
    feedback("capture-result", "20MB 이하의 이미지 파일을 선택해 주세요.", true); return;
  }
  preparingPhoto = true; updateControls();
  feedback("capture-result", "사진을 불러오고 있습니다…");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url;
    await image.decode();
    const source = document.createElement("canvas");
    // Match the camera export limit and keep decoded originals out of storage.
    const scale = Math.min(1, 1280 / Math.max(image.naturalWidth, image.naturalHeight));
    source.width = Math.max(1, Math.round(image.naturalWidth * scale));
    source.height = Math.max(1, Math.round(image.naturalHeight * scale));
    source.getContext("2d").drawImage(image, 0, 0, source.width, source.height);
    const photo = await canvasBlob(source);
    clearDraft();
    originalPhoto = source;
    draft = { id: crypto.randomUUID(), photo, capturedAt: new Date().toISOString(), seed: newFilterSeed(), filter: "none" };
    previewURL = URL.createObjectURL(photo);
    $("capture-preview").src = $("entry-preview").src = previewURL;
    $("capture-preview").hidden = false;
    $("camera-placeholder").hidden = true;
    $("camera-canvas").hidden = true;
    $("capture-time").dateTime = draft.capturedAt;
    $("capture-time-label").textContent = "사진을 불러온 날짜와 시간";
    $("capture-time").textContent = formatTime(draft.capturedAt);
    syncFilterButtons();
    await renderDraft();
    showEntryDialog();
    feedback("capture-result", "사진을 불러왔습니다. 필터를 선택하고 이름과 코멘트를 남겨주세요.");
  } catch (error) {
    feedback("capture-result", "사진을 불러오지 못했습니다. JPG, PNG 또는 WebP 파일로 다시 선택해 주세요.", true);
  } finally { URL.revokeObjectURL(url); preparingPhoto = false; updateControls(); }
});
async function startDebugEntry() {
  if (draft) {
    showEntryDialog();
    return;
  }
  if (starting) {
    cancelCapture("디버그 모드가 활성화되었습니다.");
  }
  preparingPhoto = true;
  feedback("save-status", "");
  feedback("capture-result", "");
  updateControls();
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const context = canvas.getContext("2d");
    context.fillStyle = "#100b17";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#d5baff";
    context.font = "bold 36px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("DEBUG MODE", canvas.width / 2, canvas.height / 2);
    const photo = await canvasBlob(canvas);
    await showCaptureDraft({ photo, original: null, filter: "none", seed: newFilterSeed(), capturedAt: new Date().toISOString() });
  } catch (error) {
    feedback("capture-result", "디버그 이미지를 만들지 못했습니다. 다시 시도해 주세요.", true);
  } finally {
    preparingPhoto = false;
    updateControls();
  }
}
window.addEventListener("keydown", (event) => {
  if (event.key !== "F8" || event.repeat || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || debugMode) return;
  if (saving || preparingPhoto || $("photo-dialog").open || $("delete-dialog").open) return;
  event.preventDefault();
  if (++debugKeyPresses < 5) return;
  debugMode = true;
  $("start-camera").textContent = "디버그 방명록 남기기";
  updateControls();
  startDebugEntry();
});
async function startCamera() {
  if (saving || starting || preparingPhoto) return;
  if (debugMode) {
    await startDebugEntry();
    return;
  }
  clearDraft();
  starting = true;
  $("camera-placeholder").hidden = true;
  $("camera-canvas").hidden = false;
  feedback("save-status", "");
  feedback("capture-result", "");
  updateControls();
  expandCamera();
  await camera.start();
}
$("start-camera").addEventListener("click", startCamera);
$("retake").addEventListener("click", startCamera);
$("close-camera").addEventListener("click", () => cancelCapture());
$("camera-dialog").addEventListener("cancel", (event) => {
  event.preventDefault();
  cancelCapture();
});
$("resume-entry").addEventListener("click", showEntryDialog);
$("discard-draft").addEventListener("click", () => {
  if (!draft || saving || preparingPhoto) return;
  const debugDraft = !originalPhoto;
  clearDraft();
  $("guest-name").value = "";
  $("guest-comment").value = "";
  updateCommentCount();
  $("camera-placeholder").hidden = false;
  $("camera-canvas").hidden = true;
  feedback("save-status", "");
  feedback("camera-status", debugMode ? "디버그 모드가 활성화되었습니다." : "카메라는 촬영을 시작할 때만 켜집니다.");
  feedback("capture-result", debugDraft ? "디버그 방명록 작성을 취소했습니다." : "촬영을 취소하고 사진을 삭제했습니다. 새로 촬영하거나 사진을 업로드해 주세요.");
  $("start-camera").focus({ preventScroll: true });
});
$("close-entry").addEventListener("click", () => $("entry-dialog").close());
$("entry-dialog").addEventListener("cancel", (event) => {
  if (saving) event.preventDefault();
});
$("entry-dialog").addEventListener("close", () => {
  document.body.classList.remove("entry-dialog-open");
});

async function initializeStore() {
  if (store) return;
  store = await createStore();
  $("storage-note").textContent = store.shared
    ? "공유 방명록 · 방문자에게 공개되며, 상세 화면 이미지는 운영자 폴더에도 보관됩니다."
    : "이 브라우저에 저장됩니다. 새로고침 후에도 볼 수 있지만 다른 기기와 공유되지 않으며, 사이트 데이터 삭제 시 사라집니다.";
  $("dialog-storage-note").textContent = $("storage-note").textContent;
  updateControls();
}

async function loadEntries(reset = true) {
  const version = ++listVersion;
  $("load-more").disabled = true;
  feedback("list-status", "방명록을 불러오고 있습니다…");
  try {
    await initializeStore();
    const nextOffset = reset ? 0 : offset;
    const result = await store.list({ ...filters, offset: nextOffset, limit });
    if (version !== listVersion) return;
    if (reset) {
      $("photo-dialog").close();
      $("entry-list").replaceChildren();
      cardURLs.forEach((url) => URL.revokeObjectURL(url));
      cardURLs = [];
    }
    for (const entry of result.items) {
      const url = entry.photoUrl || URL.createObjectURL(entry.photo);
      if (!entry.photoUrl) cardURLs.push(url);
      const card = document.createElement("article");
      card.className = "entry-card";
      card.dataset.entryId = entry.id;
      const open = document.createElement("button");
      open.type = "button"; open.className = "entry-open";
      open.setAttribute("aria-label", `${entry.name}, ${formatTime(entry.capturedAt)}, 사진 크게 보기`);
      const image = document.createElement("img");
      image.src = url; image.alt = `${entry.name}님의 방명록 사진`; image.loading = "lazy";
      const name = document.createElement("strong"); name.textContent = entry.name;
      const time = document.createElement("time"); time.dateTime = entry.capturedAt; time.textContent = formatTime(entry.capturedAt);
      open.append(image, name, time);
      const commentText = entry.comment || "";
      if (commentText) {
        const comment = document.createElement("p");
        comment.className = "entry-comment";
        comment.textContent = commentText;
        open.append(comment);
      }
      open.addEventListener("click", () => {
        const dialog = $("photo-dialog");
        fillPhotoDetail(dialog, entry, url, image.alt);
        dialog.showModal();
      });
      const remove = document.createElement("button");
      remove.type = "button"; remove.className = "button entry-delete";
      remove.textContent = "삭제";
      remove.setAttribute("aria-label", `${entry.name}님의 방명록 삭제`);
      remove.addEventListener("click", () => showDeleteDialog(entry, url));
      card.append(open, remove);
      $("entry-list").append(card);
    }
    offset = nextOffset + result.items.length;
    total = result.total;
    $("entry-count").textContent = total;
    $("load-more").hidden = offset >= total;
    feedback("list-status", total ? "" : (filters.name || filters.date ? "검색 결과가 없습니다." : "아직 남겨진 방명록이 없어요. 첫 번째 순간을 남겨주세요."));
  } catch (error) {
    if (version === listVersion) {
      feedback("list-status", error.message || "방명록을 불러오지 못했습니다. 다시 시도해 주세요.", true);
      if (!store) $("storage-note").textContent = "저장소 연결에 실패했습니다. 방명록 새로고침으로 다시 연결해 주세요.";
    }
  } finally { if (version === listVersion) $("load-more").disabled = false; }
}

function updateCommentCount() {
  $("comment-count").textContent = `${$("guest-comment").value.length} / 500`;
}
$("guest-comment").addEventListener("input", updateCommentCount);

$("guest-email").addEventListener("blur", () => { $("guest-email").value = $("guest-email").value.trim(); });
$("entry-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!draft || !store || saving || rendering || preparingPhoto) return;
  const name = $("guest-name").value.trim().replace(/\s+/g, " ");
  if (!name || name.length > 30) { feedback("save-status", "이름을 1~30자로 입력해 주세요.", true); $("guest-name").focus(); return; }
  const comment = $("guest-comment").value.trim();
  if (comment.length > 500) { feedback("save-status", "코멘트는 500자 이하로 입력해 주세요.", true); $("guest-comment").focus(); return; }
  saving = true; updateControls();
  feedback("save-status", "방명록을 저장하고 있습니다…");
  try {
    const result = await store.save({ ...draft, name, comment, email: store.shared ? $("guest-email").value.trim() : "" });
    clearDraft();
    $("guest-name").value = "";
    $("guest-comment").value = "";
    updateCommentCount();
    $("camera-placeholder").hidden = false;
    feedback("camera-status", debugMode ? "디버그 모드가 활성화되었습니다." : "다음 사진을 촬영할 수 있습니다.");
    feedback("save-status", "");
    const emailMessages = {
      pending: "방명록을 저장했습니다. 이메일 발송을 예약했습니다.",
      sending: "방명록을 저장했습니다. 이메일을 보내는 중입니다.",
      accepted: "방명록을 저장했습니다. 메일 서버에 전송을 완료했습니다.",
      failed: "방명록을 저장했습니다. 이메일 발송은 운영자 확인이 필요합니다.",
      unknown: "방명록을 저장했습니다. 이메일 전송 결과를 확인 중입니다.",
    };
    feedback("capture-result", emailMessages[result.emailStatus] || "방명록에 저장했습니다. 아래 목록에서 다시 볼 수 있어요.");
    filters = { name: "", date: "" };
    $("search-form").reset();
    await loadEntries();
  } catch (error) { feedback("save-status", error.message || "저장하지 못했습니다. 다시 시도해 주세요.", true); }
  finally { saving = false; updateControls(); }
});
function showDeleteDialog(entry, url) {
  if (deleting) return;
  pendingDeletion = entry;
  $("delete-preview").src = url;
  $("delete-preview").alt = `${entry.name}님의 삭제할 방명록 사진`;
  $("delete-name").textContent = entry.name;
  $("delete-time").dateTime = entry.capturedAt;
  $("delete-time").textContent = formatTime(entry.capturedAt);
  $("delete-scope").textContent = store.shared
    ? "공개 목록과 사진 주소에서 삭제됩니다. 운영자 폴더의 보관 이미지는 남습니다."
    : "이 브라우저에 저장된 방명록에서 삭제됩니다.";
  feedback("delete-status", "");
  $("delete-dialog").showModal();
  $("cancel-delete").focus();
}
$("cancel-delete").addEventListener("click", () => $("delete-dialog").close());
$("delete-dialog").addEventListener("cancel", (event) => { if (deleting) event.preventDefault(); });
$("confirm-delete").addEventListener("click", async () => {
  if (!pendingDeletion || !store || deleting) return;
  const entry = pendingDeletion;
  deleting = true;
  $("confirm-delete").disabled = true;
  $("cancel-delete").disabled = true;
  feedback("delete-status", "방명록을 삭제하고 있습니다…");
  try {
    await store.remove(entry.id);
    $("delete-dialog").close();
    pendingDeletion = null;
    feedback("archive-status", `${entry.name}님의 방명록을 삭제했습니다.`);
    await loadEntries();
    $("refresh-entries").focus({ preventScroll: true });
  } catch (error) {
    feedback("delete-status", error.message || "방명록을 삭제하지 못했습니다. 다시 시도해 주세요.", true);
  } finally {
    deleting = false;
    $("confirm-delete").disabled = false;
    $("cancel-delete").disabled = false;
  }
});
$("search-form").addEventListener("submit", (event) => {
  event.preventDefault(); filters = { name: $("search-name").value.trim(), date: $("search-date").value }; loadEntries();
});
$("reset-search").addEventListener("click", () => { $("search-form").reset(); filters = { name: "", date: "" }; loadEntries(); });
$("refresh-entries").addEventListener("click", () => loadEntries());
$("load-more").addEventListener("click", () => loadEntries(false));
$("close-photo").addEventListener("click", () => $("photo-dialog").close());
$("photo-dialog").addEventListener("click", (event) => { if (event.target === $("photo-dialog")) $("photo-dialog").close(); });
window.addEventListener("pagehide", () => {
  camera.stop();
  restoreCamera();
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted && starting) {
    restoreCamera();
    starting = false; $("camera-placeholder").hidden = false; $("camera-canvas").hidden = true;
    feedback("camera-status", "촬영하려면 카메라를 다시 시작해 주세요."); updateControls();
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && starting) {
    cancelCapture("촬영이 중지되었습니다. 카메라를 다시 시작해 주세요.");
  }
});
loadEntries();

})();
