(() => {
"use strict";
// This function is self-contained so the same inference pipeline can run in a
// Blob worker on file:// as well as on a normal web server.
async function portraitRuntime() {
  const root = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
  const { FilesetResolver, FaceLandmarker } = await import(root);
  const vision = await FilesetResolver.forVisionTasks(`${root}/wasm`);
  const faceTask = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task", delegate: "CPU" },
    runningMode: "IMAGE", numFaces: 3, minFaceDetectionConfidence: .5,
    minFacePresenceConfidence: .5, outputFaceBlendshapes: false,
  });
  return {
    analyze(image) {
      const result = faceTask.detect(image);
      const faces = (result.faceLandmarks || []).map(points => {
        const xs = points.map(p => p.x), ys = points.map(p => p.y);
        const x = Math.min(...xs), y = Math.min(...ys);
        return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y,
          eyes: (points[33].y + points[263].y) / 2, nose: points[1].y,
          mouth: (points[13].y + points[14].y) / 2, chin: points[152].y };
      });
      return { faces };
    },
    close() { faceTask.close(); },
  };
}

function timeout(promise, ms) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("얼굴 분석 연결 시간이 초과되었습니다.")), ms);
  })]).finally(() => clearTimeout(timer));
}

let enginePromise, worker, workerURL, mainEngine;
let requestId = 0, queue = Promise.resolve();
const pending = new Map();
function disposeWorker() {
  worker?.terminate(); worker = null;
  if (workerURL) URL.revokeObjectURL(workerURL);
  workerURL = null;
  for (const item of pending.values()) item.reject(new Error("얼굴 분석이 중지되었습니다."));
  pending.clear();
}
async function engine() {
  if (enginePromise) return enginePromise;
  enginePromise = (async () => {
    if (typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined" && typeof createImageBitmap !== "undefined") {
      try {
        const code = `const runtime = (${portraitRuntime.toString()})();
          runtime.then(() => postMessage({ready:true}), error => postMessage({error:String(error)}));
          onmessage = async ({data}) => {
            try { const result = (await runtime).analyze(data.image);
              postMessage({id:data.id,result});
            } catch(error) { postMessage({id:data.id,error:String(error)}); }
            finally { data.image.close(); }
          };`;
        workerURL = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
        worker = new Worker(workerURL, { type: "module" });
        await timeout(new Promise((resolve, reject) => {
          worker.onerror = () => reject(new Error("Worker를 시작하지 못했습니다."));
          worker.onmessage = ({ data }) => {
            if (data.ready) { resolve(); return; }
            if (!data.id) { reject(new Error(data.error)); return; }
            const item = pending.get(data.id); pending.delete(data.id);
            if (item) data.error ? item.reject(new Error(data.error)) : item.resolve(data.result);
          };
        }), 30000);
        worker.onerror = () => { disposeWorker(); enginePromise = null; };
        return "worker";
      } catch (error) { disposeWorker(); }
    }
    // Some Safari versions restrict worker graphics. Keep a bounded-resolution
    // fallback with serialized, throttled inference instead of breaking capture.
    const loading = portraitRuntime();
    let expired = false;
    loading.then(value => { if (expired) value.close(); }, () => {});
    try { mainEngine = await timeout(loading, 30000); }
    catch (error) { expired = true; throw error; }
    return "main";
  })().catch(error => { enginePromise = null; throw error; });
  return enginePromise;
}

function analyzePortrait(source) {
  const image = document.createElement("canvas");
  const scale = Math.min(1, 384 / Math.max(source.width, source.height));
  image.width = Math.max(1, Math.round(source.width * scale));
  image.height = Math.max(1, Math.round(source.height * scale));
  image.getContext("2d").drawImage(source, 0, 0, image.width, image.height);
  const run = async () => {
    if (await engine() === "main") {
      await new Promise(resolve => setTimeout(resolve, 0));
      return mainEngine.analyze(image);
    }
    const bitmap = await createImageBitmap(image);
    const id = ++requestId;
    try {
      return await timeout(new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, image: bitmap }, [bitmap]);
      }), 5000);
    } catch (error) {
      disposeWorker(); enginePromise = null; throw error;
    } finally { pending.delete(id); bitmap.close(); }
  };
  const result = queue.then(run).finally(() => { image.width = image.height = 1; });
  queue = result.catch(() => {});
  return result;
}

function chooseFace(faces, previous) {
  if (!faces.length) return null;
  if (!previous) return faces.reduce((a, b) => a.width * a.height > b.width * b.height ? a : b);
  const distance = face => Math.hypot(face.x + face.width / 2 - previous.x - previous.width / 2,
    face.y + face.height / 2 - previous.y - previous.height / 2);
  const nearest = faces.reduce((a, b) => distance(a) < distance(b) ? a : b);
  return distance(nearest) < Math.max(previous.width, previous.height) * 1.2 ? nearest : null;
}
async function portraitForPhoto(source) {
  const result = await analyzePortrait(source);
  const face = chooseFace(result.faces);
  return face ? { face, strength: 1 } : null;
}

function createPortraitTracker() {
  let portrait = null, lastSeen = 0, lastRequest = -Infinity, busy = false, generation = 0;
  let message = "얼굴 분석을 준비하고 있습니다…", retryAt = 0;
  return {
    reset() { generation++; portrait = null; lastSeen = 0; lastRequest = -Infinity; busy = false; retryAt = 0; message = "얼굴 분석을 준비하고 있습니다…"; },
    update(source, now) {
      if (busy || now - lastRequest < 150 || now < retryAt) return;
      busy = true; lastRequest = now;
      const current = generation;
      analyzePortrait(source).then(result => {
        if (current !== generation) return;
        const previous = now - lastSeen < 850 ? portrait?.face : null;
        const face = chooseFace(result.faces, previous);
        if (face) {
          if (previous) for (const key of Object.keys(face)) face[key] = previous[key] * .25 + face[key] * .75;
          portrait = { face, strength: 1 }; lastSeen = performance.now();
          message = "얼굴을 따라 글리치가 적용됩니다.";
        } else message = "얼굴이 카메라에 보이도록 해주세요.";
      }).catch(() => {
        if (current !== generation) return;
        retryAt = performance.now() + 5000;
        message = "얼굴 분석을 불러오지 못했습니다. 연결을 확인해 주세요.";
      }).finally(() => { if (current === generation) busy = false; });
    },
    get(now = performance.now()) {
      if (!portrait) return null;
      const strength = Math.max(0, Math.min(1, 1 - (now - lastSeen - 250) / 600));
      return strength ? { ...portrait, strength } : null;
    },
    get message() { return message; },
  };
}

window.addEventListener("pagehide", () => {
  disposeWorker(); mainEngine?.close(); mainEngine = null; enginePromise = null;
});
Object.assign(window.PicSnapGuestbook ??= {}, { analyzePortrait, portraitForPhoto, createPortraitTracker });
})();
