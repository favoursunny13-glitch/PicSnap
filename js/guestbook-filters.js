(() => {
"use strict";
const normalizeFilter = (value) => ["none", "grayscale", "glitch"].includes(value) ? value : "none";
const newFilterSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];
const plans = new Map();
const GRAYSCALE_CONTRAST = 1.5; // 1 = 100%, 1.5 = 150%
const GLITCH_THICKNESS_PX = 4; // 선 두께(px). 값을 올리면 더 두꺼워집니다.
const glitchContrast = Uint8ClampedArray.from({ length: 256 }, (_, value) =>
  (value - 128) * 1.35 + 128);

function randomSequence(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let t = Math.imul(state ^ state >>> 15, 1 | state);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function glitchPlan(seed) {
  if (plans.has(seed)) return plans.get(seed);
  const random = randomSequence(seed);
  // Anchor names refer to anatomy, never to a fixed screen row.
  const anchors = ["hair", "eyes", "nose", "mouth", "chin", "neck", "body"];
  const bands = Array.from({ length: 10000 }, (_, i) => ({
    position: (i + .5) / 10000, extend: i % 4 !== 0,
    anchor: anchors[i % anchors.length], jitter: (random() - .5) * .6,
    shift: (random() - .5) * .15, split: .036 + random() * .054,
  }));
  if (plans.size >= 12) plans.delete(plans.keys().next().value);
  plans.set(seed, bands);
  return bands;
}
function applyImageFilter(context, value, seed = 0, portrait = null) {
  const filter = normalizeFilter(value);
  if (filter === "none" || (filter === "glitch" && !portrait?.face)) return;
  const { width, height } = context.canvas;
  const image = context.getImageData(0, 0, width, height), pixels = image.data;
  if (filter === "grayscale") {
    for (let i = 0; i < pixels.length; i += 4) {
      const gray = Math.round(.2126 * pixels[i] + .7152 * pixels[i + 1] + .0722 * pixels[i + 2]);
      pixels[i] = pixels[i + 1] = pixels[i + 2] = (gray - 128) * GRAYSCALE_CONTRAST + 128;
    }
  } else {
    const source = new Uint8ClampedArray(pixels);
    const f = portrait.face, fw = f.width * width, fh = f.height * height;
    const strength = portrait.strength ?? 1;
    const anchors = { hair: f.y - f.height * .16, eyes: f.eyes, nose: f.nose,
      mouth: f.mouth, chin: f.chin, neck: f.chin + f.height * .35, body: f.chin + f.height * 1.05 };
    const extent = height + GLITCH_THICKNESS_PX;
    const bands = glitchPlan(seed).map(b => {
      // Keep facial accents, then extend the same seeded distortion across the
      // entire image. Face-relative phase moves it with the subject; wrapping
      // past both edges prevents an untreated strip above the head or below it.
      const extendedY = b.position * extent + (f.eyes - .5) * height + b.jitter * fh;
      const y = b.extend
        ? ((extendedY % extent) + extent) % extent - GLITCH_THICKNESS_PX
        : anchors[b.anchor] * height + b.jitter * fh;
      return { ...b, y };
    });
    // Resolve overlapping bands once instead of scanning 10,000 bands per row.
    const rowBands = new Int32Array(height).fill(-1);
    for (let index = 0; index < bands.length; index++) {
      const band = bands[index];
      const end = Math.min(height, Math.ceil(band.y + GLITCH_THICKNESS_PX));
      for (let y = Math.max(0, Math.ceil(band.y)); y < end; y++) rowBands[y] = index;
    }
    const scanGap = Math.max(2, fw * .014);
    for (let y = 0; y < height; y++) {
      const row = y * width;
      let shift = 0, split = .027, streak = false;
      const band = bands[rowBands[y]];
      if (band) {
        shift = band.shift * fw; split = band.split; streak = true;
      }
      // Use the same small channel offsets across the full row, including the
      // background. Increase channel contrast and blending for clearer fringes.
      const scan = ((y - f.y * height) % scanGap + scanGap) % scanGap < .65 ? .985 : 1;
      const offset = fw * split;
      const mix = (streak ? .60 : .36) * strength;
      for (let x = 0; x < width; x++) {
        const i = (row + x) * 4;
        for (let c = 0; c < 3; c++) {
          const sx = Math.max(0, Math.min(width - 1,
            Math.round(x - shift + (c === 0 ? offset * .3 : c === 1 ? offset : -offset))));
          const signal = glitchContrast[source[(row + sx) * 4 + c]];
          const blended = source[i + c] * (1 - mix) + signal * mix;
          pixels[i + c] = blended * (1 - (1 - scan) * strength);
        }
      }
    }
  }
  context.putImageData(image, 0, 0);
}

function canvasBlob(canvas, type = "image/jpeg") {
  return new Promise((resolve, reject) => canvas.toBlob((blob) =>
    blob ? resolve(blob) : reject(new Error("사진을 만들지 못했습니다. 다시 시도해 주세요.")), type, .92));
}

Object.assign(window.PicSnapGuestbook ??= {}, { applyImageFilter, normalizeFilter, newFilterSeed, canvasBlob, GRAYSCALE_CONTRAST });
})();
