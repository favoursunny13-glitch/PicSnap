(() => {
"use strict";
const API = "./api/guestbook";
const koreaDate = (value) => new Date(new Date(value).getTime() + 9 * 3600000).toISOString().slice(0, 10);

async function request(path, options = {}) {
  const timeout = options.method === "POST" ? 45000 : 15000;
  const response = await fetch(`${API}${path}`, { ...options, signal: AbortSignal.timeout(timeout), cache: "no-store" });
  if (!response.ok) {
    const failure = await response.json().catch(() => null);
    if (failure?.error === "archive_unavailable") throw new Error("상세 화면 이미지를 보관하지 못했습니다. 잠시 후 저장을 다시 시도해 주세요.");
    if (failure?.error === "entry_deleted") throw new Error("이미 삭제된 방명록입니다. 다시 촬영하거나 사진을 업로드해 주세요.");
    throw new Error(`저장 서버에 연결하지 못했습니다 (${response.status}). 잠시 후 다시 시도해 주세요.`);
  }
  return response.json();
}

async function createStore() {
  // File URLs have no API server; go directly to browser storage.
  const response = location.protocol === "file:"
    ? { ok: false, status: 404 }
    : await fetch(`${API}/health`, { signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (response.ok && response.headers.get("content-type")?.includes("application/json")) {
    const health = await response.json();
    if (health.service !== "picsnap-guestbook") throw new Error("방명록 서버 설정을 확인해 주세요.");
    return {
      shared: true,
      emailConfigured: health.emailConfigured === true,
      async list({ name, date, offset, limit }) {
        return request(`?${new URLSearchParams({ name, date, offset, limit })}`);
      },
      async remove(id) {
        return request(`/${encodeURIComponent(id)}`, { method: "DELETE" });
      },
      async save(entry) {
        const image = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error("사진 파일을 읽지 못했습니다."));
          reader.readAsDataURL(entry.photo);
        });
        return request("", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: entry.id, name: entry.name, comment: entry.comment || "", email: entry.email || "", capturedAt: entry.capturedAt, image }) });
      },
    };
  }
  // Only a missing endpoint (or a static host's HTML fallback) enables local mode.
  if (![404, 405].includes(response.status) && !(response.ok && response.headers.get("content-type")?.includes("text/html"))) {
    throw new Error("방명록 저장 서버를 확인할 수 없습니다. 새로고침으로 다시 시도해 주세요.");
  }
  const db = await new Promise((resolve, reject) => {
    const open = indexedDB.open("picsnap-photo-guestbook", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("entries", { keyPath: "id" }).createIndex("capturedAt", "capturedAt");
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(new Error("사진 저장소를 열 수 없습니다. 브라우저의 저장 권한을 확인해 주세요."));
    open.onblocked = () => reject(new Error("다른 PicSnap 탭을 닫고 다시 시도해 주세요."));
  });
  return {
    shared: false,
    async list({ name, date, offset, limit }) {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction("entries", "readonly");
        const cursor = transaction.objectStore("entries").index("capturedAt").openCursor(null, "prev");
        const items = [];
        let total = 0;
        cursor.onsuccess = () => {
          const current = cursor.result;
          if (!current) return;
          const entry = current.value;
          if (entry.name.toLocaleLowerCase().includes(name.toLocaleLowerCase()) && (!date || koreaDate(entry.capturedAt) === date)) {
            if (total >= offset && items.length < limit) items.push(entry);
            total++;
          }
          current.continue();
        };
        transaction.oncomplete = () => resolve({ items, total });
        transaction.onerror = () => reject(new Error("방명록을 불러오지 못했습니다."));
      });
    },
    async save(entry) {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction("entries", "readwrite");
        transaction.objectStore("entries").put({ ...entry, createdAt: new Date().toISOString() });
        transaction.oncomplete = () => resolve({ id: entry.id });
        transaction.onabort = () => reject(new Error("사진을 저장하지 못했습니다. 브라우저 저장 공간과 권한을 확인한 뒤 다시 시도해 주세요."));
        transaction.onerror = () => {};
      });
    },
    async remove(id) {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction("entries", "readwrite");
        transaction.objectStore("entries").delete(id);
        transaction.oncomplete = () => resolve({ id });
        transaction.onabort = () => reject(new Error("방명록을 삭제하지 못했습니다. 다시 시도해 주세요."));
        transaction.onerror = () => {};
      });
    },
  };
}

Object.assign(window.PicSnapGuestbook ??= {}, { createStore });
})();
