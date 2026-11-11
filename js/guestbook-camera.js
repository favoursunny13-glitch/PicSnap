(() => {
"use strict";
// Hand-frame detection and mirrored crop follow Puzzle-main/app.js.
const VISION_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const WASM_URL = `${VISION_URL}/wasm`;
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const { applyImageFilter, normalizeFilter, newFilterSeed, canvasBlob, portraitForPhoto, createPortraitTracker, GRAYSCALE_CONTRAST } = window.PicSnapGuestbook;

function withTimeout(promise, milliseconds, message = "손 인식 모델을 불러오는 시간이 초과되었습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.") {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), milliseconds);
  })]).finally(() => clearTimeout(timer));
}

function createCamera({ video, canvas, countdown, status, onCapture, onError }) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  let generation = 0;
  let stream, detector, animation;
  let holdingSince = null, countdownAt = null, frozenBox = null, lastFrame = -1;
  let photoFilter = "none";
  let filterSeed = newFilterSeed(), lastRender = 0;
  const cropPreview = document.createElement("canvas");
  const cropCtx = cropPreview.getContext("2d", { willReadFrequently: true });
  const portraitTracker = createPortraitTracker();
  const filterStatus = document.getElementById("camera-filter-status");

  function setFilter(value) {
    photoFilter = normalizeFilter(value);
    video.style.filter = photoFilter === "grayscale" ? `grayscale(1) contrast(${GRAYSCALE_CONTRAST})` : "none";
    if (photoFilter !== "glitch") portraitTracker.reset();
    filterStatus.hidden = photoFilter !== "glitch";
  }

  function applyPhotoFilter(context, portrait = null) {
    applyImageFilter(context, photoFilter, filterSeed, portrait);
  }

  function drawPreview() {
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  function filterPreview(box) {
    if (photoFilter === "none") return;
    if (photoFilter === "glitch") {
      portraitTracker.update(canvas, performance.now());
      applyPhotoFilter(ctx, portraitTracker.get());
      filterStatus.textContent = portraitTracker.message;
      filterStatus.hidden = false;
      return;
    }
    if (!box) { applyPhotoFilter(ctx); return; }
    const width = Math.max(1, Math.round(box.width)), height = Math.max(1, Math.round(box.height));
    if (cropPreview.width !== width || cropPreview.height !== height) {
      cropPreview.width = width; cropPreview.height = height;
    }
    cropCtx.drawImage(canvas, box.x, box.y, box.width, box.height, 0, 0, width, height);
    applyPhotoFilter(cropCtx);
    ctx.drawImage(cropPreview, box.x, box.y, box.width, box.height);
  }

  function stop() {
    generation++;
    cancelAnimationFrame(animation);
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    video.pause();
    video.srcObject = null;
    video.removeAttribute("src");
    video.load();
    // Detaching a stream does not erase the canvas (or the video's last frame).
    // Clear both before another visitor can see the camera stage.
    ctx.save();
    ctx.resetTransform();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    detector?.close();
    detector = null;
    countdown.hidden = true;
    countdownAt = holdingSince = frozenBox = null;
    lastFrame = -1;
    cropPreview.width = cropPreview.height = 1;
    portraitTracker.reset();
    filterStatus.hidden = true;
  }

  async function start() {
    stop();
    filterSeed = newFilterSeed();
    const current = generation;
    const active = () => current === generation;
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error(location.protocol === "file:"
          ? "이 브라우저는 파일에서 카메라 사용을 지원하지 않습니다. http://localhost:8000/index.html로 접속해 주세요."
          : "카메라는 HTTPS 사이트 또는 localhost에서 사용할 수 있습니다.");
      }
      status("카메라 접근을 허용해 주세요.");
      const pendingStream = navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }, audio: false });
      // A permission prompt may never settle. Release any stream arriving after cancellation/timeout.
      pendingStream.then((result) => {
        if (!active()) result.getTracks().forEach((track) => track.stop());
      }, () => {});
      const nextStream = await withTimeout(pendingStream, 45000,
        "카메라 허용 응답이 없습니다. 브라우저의 카메라 권한 알림과 macOS 시스템 설정 → 개인정보 보호 및 보안 → 카메라를 확인한 뒤 다시 시작해 주세요.");
      if (!active()) { nextStream.getTracks().forEach((track) => track.stop()); return; }
      stream = nextStream;
      video.srcObject = stream;
      await withTimeout(video.play(), 15000, "카메라 영상 재생이 시작되지 않았습니다. 브라우저의 카메라 권한을 확인하고 다시 시작해 주세요.");
      if (!active()) return;
      const previewScale = Math.min(1, 960 / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.round(video.videoWidth * previewScale);
      canvas.height = Math.round(video.videoHeight * previewScale);
      drawPreview();
      filterPreview(null);
      status("카메라가 연결되었습니다. 손 인식 모델을 불러오고 있습니다…");
      animation = requestAnimationFrame(loop);
      const { FilesetResolver, HandLandmarker } = await withTimeout(import(VISION_URL), 25000);
      if (!active()) return;
      const vision = await withTimeout(FilesetResolver.forVisionTasks(WASM_URL), 25000);
      if (!active()) return;
      const makeDetector = async (delegate) => {
        const pending = HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate }, runningMode: "VIDEO", numHands: 2,
          minHandDetectionConfidence: .6, minHandPresenceConfidence: .6, minTrackingConfidence: .6,
        });
        let expired = false;
        pending.then((result) => { if (expired || !active()) result.close(); }, () => {});
        try { return await withTimeout(pending, 25000); }
        catch (error) { expired = true; throw error; }
      };
      let nextDetector;
      try { nextDetector = await makeDetector("GPU"); }
      catch (error) {
        if (!active()) return;
        status("손 인식을 다시 준비하고 있습니다…");
        nextDetector = await makeDetector("CPU");
      }
      if (!active()) return;
      detector = nextDetector;
      status("양손의 엄지와 검지를 집어 촬영 영역을 잡아주세요.");
    } catch (error) {
      if (!active()) return;
      stop();
      const messages = { NotAllowedError: "카메라 권한이 거부되었습니다. 브라우저 사이트 설정과 macOS 시스템 설정의 카메라 접근 권한을 허용한 뒤 다시 시작해 주세요.", NotFoundError: "연결된 카메라를 찾을 수 없습니다.", NotReadableError: "카메라를 사용할 수 없습니다. 다른 앱에서 사용 중인지 확인해 주세요." };
      onError(messages[error.name] || error.message || "카메라를 시작하지 못했습니다.");
    }
  }

  function frameBox(hands) {
    const a = hands[0][8], b = hands[1][8];
    const x = Math.max(0, Math.min(1 - a.x, 1 - b.x) * canvas.width - 28);
    const y = Math.max(0, Math.min(a.y, b.y) * canvas.height - 28);
    const right = Math.min(canvas.width, Math.max(1 - a.x, 1 - b.x) * canvas.width + 28);
    const bottom = Math.min(canvas.height, Math.max(a.y, b.y) * canvas.height + 28);
    return { x, y, width: right - x, height: bottom - y };
  }

  function drawFrameMask(box) {
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    // Four non-overlapping rectangles leave the photo area completely untouched.
    ctx.fillRect(0, 0, canvas.width, box.y);
    ctx.fillRect(0, box.y + box.height, canvas.width, canvas.height - box.y - box.height);
    ctx.fillRect(0, box.y, box.x, box.height);
    ctx.fillRect(box.x + box.width, box.y, canvas.width - box.x - box.width, box.height);
    ctx.restore();
  }

  function drawHands(hands) {
    ctx.save();
    ctx.strokeStyle = ctx.fillStyle = countdownAt !== null ? "#22c55e" : "#ffffff";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    for (const hand of hands) {
      const points = hand.map(({ x, y }) => ({ x: (1 - x) * canvas.width, y: y * canvas.height }));
      ctx.beginPath();
      for (const [a, b] of HAND_CONNECTIONS) {
        ctx.moveTo(points[a].x, points[a].y);
        ctx.lineTo(points[b].x, points[b].y);
      }
      ctx.stroke();
      for (const point of points) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  async function capture(box) {
    const current = generation;
    const capturedAt = new Date().toISOString();
    const photo = document.createElement("canvas");
    const sourceScale = video.videoWidth / canvas.width;
    const scale = Math.min(sourceScale, 1280 / Math.max(box.width, box.height));
    photo.width = Math.max(1, Math.round(box.width * scale));
    photo.height = Math.max(1, Math.round(box.height * scale));
    const photoCtx = photo.getContext("2d", { willReadFrequently: true });
    photoCtx.translate(photo.width, 0); photoCtx.scale(-1, 1);
    photoCtx.drawImage(video, (canvas.width - box.x - box.width) * sourceScale, box.y * sourceScale, box.width * sourceScale, box.height * sourceScale, 0, 0, photo.width, photo.height);
    const output = document.createElement("canvas");
    output.width = photo.width; output.height = photo.height;
    const outputCtx = output.getContext("2d", { willReadFrequently: true });
    outputCtx.drawImage(photo, 0, 0);
    const filter = photoFilter, seed = filterSeed;
    try {
      let portrait = null;
      if (filter === "glitch") {
        try { portrait = await portraitForPhoto(photo); }
        catch (error) {
          if (current !== generation) return;
          stop(); onError("얼굴 분석을 완료하지 못했습니다. 연결을 확인하고 다시 촬영해 주세요."); return;
        }
      }
      if (current !== generation) return;
      applyImageFilter(outputCtx, filter, seed, portrait);
      const blob = await canvasBlob(output);
      if (current !== generation) return;
      stop();
      onCapture({ photo: blob, original: photo, filter, seed, capturedAt, portrait });
    } catch (error) {
      if (current !== generation) return;
      stop(); onError(error.message);
    }
  }

  function loop(now) {
    try {
      if (!stream) return;
      if (photoFilter === "glitch" && now - lastRender < 40) { animation = requestAnimationFrame(loop); return; }
      if (video.readyState < 2 || video.currentTime === lastFrame) { animation = requestAnimationFrame(loop); return; }
      lastFrame = video.currentTime;
      lastRender = now;
      drawPreview();
      if (!detector) { filterPreview(null); animation = requestAnimationFrame(loop); return; }
      const result = detector.detectForVideo(video, now);
      const hands = result.landmarks || [];
      let box = frozenBox;
      if (countdownAt === null) {
        if (hands.length === 2) {
          box = frameBox(hands);
          const pinching = hands.every((hand) => distance(hand[4], hand[8]) < .055);
          if (pinching && box.width > 80 && box.height > 80) {
            holdingSince ??= now;
            status("좋아요. 손가락을 잠시 그대로 유지해 주세요.");
            if (now - holdingSince >= 250) { countdownAt = now; frozenBox = box; }
          } else { holdingSince = null; status("양손의 엄지와 검지를 집어 촬영 영역을 잡아주세요."); }
        } else { holdingSince = null; status("양손이 카메라에 보이도록 들어주세요."); }
      }
      filterPreview(box);
      if (box) {
        drawFrameMask(box);
        ctx.strokeStyle = "#c9a7ff"; ctx.lineWidth = 4; ctx.strokeRect(box.x, box.y, box.width, box.height);
      }
      if (countdownAt === null || now - countdownAt < 1000) drawHands(hands);
      if (countdownAt !== null) {
        const remaining = Math.ceil(3 - (now - countdownAt) / 1000);
        if (remaining <= 0) { status("사진을 준비하고 있습니다…"); capture(frozenBox); return; }
        countdown.hidden = false;
        countdown.textContent = remaining;
        status(`${remaining}초 후 촬영합니다. 포즈를 유지해 주세요.`);
      }
      animation = requestAnimationFrame(loop);
    } catch (error) {
      stop(); onError("손 인식 중 문제가 발생했습니다. 카메라를 다시 시작해 주세요.");
    }
  }
  return { start, stop, setFilter };
}

Object.assign(window.PicSnapGuestbook ??= {}, { createCamera });
})();
