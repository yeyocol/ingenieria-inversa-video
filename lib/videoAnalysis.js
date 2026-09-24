// Análisis técnico del video 100% en el navegador: el archivo nunca se sube completo.
// Extrae metadatos, cortes de escena, ritmo de edición, color, movimiento, audio y fotogramas clave.

const MAX_SCAN_SAMPLES = 400;
const MAX_KEY_FRAMES = 30;
const FRAME_MAX_SIDE = 512;
const MAX_PAYLOAD_CHARS = 3_600_000; // margen bajo el límite de 4.5 MB de Vercel

function once(target, event) {
  return new Promise((resolve, reject) => {
    const ok = () => {
      cleanup();
      resolve();
    };
    const fail = () => {
      cleanup();
      reject(new Error("No se pudo leer el video. Prueba con MP4 (H.264) o WebM."));
    };
    const cleanup = () => {
      target.removeEventListener(event, ok);
      target.removeEventListener("error", fail);
    };
    target.addEventListener(event, ok);
    target.addEventListener("error", fail);
  });
}

async function seek(video, t) {
  const target = Math.min(Math.max(t, 0.01), Math.max(video.duration - 0.05, 0.01));
  if (Math.abs(video.currentTime - target) < 0.001) return;
  const done = once(video, "seeked");
  video.currentTime = target;
  await done;
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

const toHex = (r, g, b) => "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

// Firma compacta de un fotograma: histograma de color + píxeles RGB en baja resolución.
function frameSignature(data) {
  const bins = 8;
  const hist = new Float32Array(bins * 3);
  const n = data.length / 4;
  const rgb = new Uint8Array(n * 3);
  let lum = 0;
  let sat = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    hist[r >> 5]++;
    hist[bins + (g >> 5)]++;
    hist[bins * 2 + (b >> 5)]++;
    rgb[p * 3] = r;
    rgb[p * 3 + 1] = g;
    rgb[p * 3 + 2] = b;
    lum += 0.299 * r + 0.587 * g + 0.114 * b;
    sat += rgbToHsl(r, g, b)[1];
  }
  for (let i = 0; i < hist.length; i++) hist[i] /= n;
  return { hist, rgb, brightness: lum / n / 255, saturation: sat / n };
}

function histDiff(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
  return d / 6; // normalizado a 0..1 (3 canales x 2)
}

function pixelDiff(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
  return d / a.length / 255;
}

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}

function extractPalette(pixelBlocks, count = 8) {
  const buckets = new Map();
  for (const data of pixelBlocks) {
    for (let i = 0; i < data.length; i += 4) {
      const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
      const e = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
      e.n++;
      e.r += data[i];
      e.g += data[i + 1];
      e.b += data[i + 2];
      buckets.set(key, e);
    }
  }
  const total = [...buckets.values()].reduce((s, e) => s + e.n, 0) || 1;
  const sorted = [...buckets.values()].sort((a, b) => b.n - a.n);
  const palette = [];
  for (const e of sorted) {
    const c = [e.r / e.n, e.g / e.n, e.b / e.n];
    const tooClose = palette.some((p) => Math.hypot(p.rgb[0] - c[0], p.rgb[1] - c[1], p.rgb[2] - c[2]) < 48);
    if (tooClose) continue;
    palette.push({ rgb: c, hex: toHex(...c), share: round((e.n / total) * 100, 1) });
    if (palette.length >= count) break;
  }
  return palette.map(({ hex, share }) => ({ hex, share }));
}

async function analyzeAudio(file) {
  if (file.size > 400 * 1024 * 1024) {
    return { available: false, reason: "Archivo muy grande para analizar el audio en el navegador." };
  }
  let ctx;
  try {
    const buf = await file.arrayBuffer();
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const audio = await ctx.decodeAudioData(buf);
    const sr = audio.sampleRate;
    const ch = audio.numberOfChannels;
    const len = audio.length;
    const mono = new Float32Array(len);
    for (let c = 0; c < ch; c++) {
      const d = audio.getChannelData(c);
      for (let i = 0; i < len; i++) mono[i] += d[i] / ch;
    }

    // Energía por segundo (dBFS)
    const perSecond = [];
    for (let s = 0; s * sr < len; s++) {
      let sum = 0;
      const start = s * sr;
      const end = Math.min(start + sr, len);
      for (let i = start; i < end; i++) sum += mono[i] * mono[i];
      const rms = Math.sqrt(sum / Math.max(end - start, 1));
      perSecond.push(round(20 * Math.log10(rms + 1e-9), 1));
    }

    // Ventanas cortas para silencio y ataques (onsets)
    const hop = 1024;
    const env = [];
    for (let i = 0; i + hop <= len; i += hop) {
      let sum = 0;
      for (let j = i; j < i + hop; j++) sum += mono[j] * mono[j];
      env.push(Math.sqrt(sum / hop));
    }
    const silent = env.filter((v) => 20 * Math.log10(v + 1e-9) < -45).length;
    const silenceRatio = env.length ? silent / env.length : 0;

    const onset = env.map((v, i) => (i ? Math.max(0, v - env[i - 1]) : 0));
    const fps = sr / hop;
    let bestLag = 0;
    let bestScore = 0;
    let totalScore = 0;
    const minLag = Math.floor((60 / 180) * fps);
    const maxLag = Math.ceil((60 / 60) * fps);
    for (let lag = minLag; lag <= maxLag; lag++) {
      let score = 0;
      for (let i = lag; i < onset.length; i++) score += onset[i] * onset[i - lag];
      totalScore += score;
      if (score > bestScore) {
        bestScore = score;
        bestLag = lag;
      }
    }
    const avgScore = totalScore / Math.max(maxLag - minLag + 1, 1);
    const onsetEnergy = onset.reduce((s, v) => s + v, 0) / Math.max(onset.length, 1);
    const bpm = bestLag && onsetEnergy > 1e-4 ? Math.min(180, round((60 * fps) / bestLag, 0)) : null;
    const bpmConfidence = avgScore ? round(bestScore / avgScore, 2) : 0;

    const loudest = [...perSecond.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t, db]) => ({ t, db }));
    const mean = perSecond.reduce((s, v) => s + v, 0) / Math.max(perSecond.length, 1);

    return {
      available: true,
      sampleRate: sr,
      channels: ch,
      meanDb: round(mean, 1),
      silenceRatio: round(silenceRatio * 100, 1),
      bpmEstimate: bpm,
      bpmConfidence,
      loudestMoments: loudest,
      energyPerSecondDb: perSecond,
    };
  } catch {
    return { available: false, reason: "El video no tiene pista de audio o el navegador no puede decodificarla." };
  } finally {
    if (ctx) ctx.close();
  }
}

export async function analyzeVideo(file, onProgress = () => {}) {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;

  try {
    onProgress("Leyendo metadatos…", 2);
    await once(video, "loadedmetadata");
    if (video.readyState < 2) await once(video, "loadeddata");
    const duration = video.duration;
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!duration || !isFinite(duration) || !width) throw new Error("No se pudo leer la duración o resolución del video.");

    // 1) Escaneo rápido a baja resolución para detectar cortes y movimiento
    const scanW = 64;
    const scanH = Math.max(16, Math.round((64 * height) / width));
    const scan = document.createElement("canvas");
    scan.width = scanW;
    scan.height = scanH;
    const sctx = scan.getContext("2d", { willReadFrequently: true });

    const step = Math.max(0.2, duration / MAX_SCAN_SAMPLES);
    const samples = [];
    for (let t = 0; t < duration; t += step) {
      await seek(video, t);
      sctx.drawImage(video, 0, 0, scanW, scanH);
      const sig = frameSignature(sctx.getImageData(0, 0, scanW, scanH).data);
      samples.push({ t, ...sig });
      if (samples.length % 10 === 0) onProgress(`Detectando cortes y ritmo… ${Math.round((t / duration) * 100)}%`, 5 + (t / duration) * 55);
    }

    const diffs = samples.map((s, i) =>
      i ? { t: s.t, h: histDiff(s.hist, samples[i - 1].hist), p: pixelDiff(s.rgb, samples[i - 1].rgb) } : { t: 0, h: 0, p: 0 }
    );
    const med = median(diffs.slice(1).map((d) => d.h));
    const cuts = [];
    for (let i = 1; i < diffs.length; i++) {
      const d = diffs[i];
      const isCut = (d.h > 0.3 && d.p > 0.08) || (d.h > Math.max(0.15, med * 4) && d.p > 0.12);
      const lastCut = cuts.length ? cuts[cuts.length - 1] : -Infinity;
      if (isCut && d.t - lastCut > 0.35) cuts.push(round(d.t, 2));
    }

    // Escenas (tomas) entre cortes
    const bounds = [0, ...cuts, duration];
    const scenes = [];
    for (let i = 0; i < bounds.length - 1; i++) {
      const start = bounds[i];
      const end = bounds[i + 1];
      const inScene = samples.filter((s) => s.t >= start && s.t < end);
      const motionVals = diffs.filter((d) => d.t > start && d.t < end && !cuts.includes(round(d.t, 2))).map((d) => d.p);
      const avg = (arr, k) => (arr.length ? arr.reduce((s, v) => s + v[k], 0) / arr.length : 0);
      const motion = motionVals.length ? motionVals.reduce((s, v) => s + v, 0) / motionVals.length : 0;
      scenes.push({
        index: i + 1,
        start: round(start),
        end: round(end),
        duration: round(end - start),
        brightness: round(avg(inScene, "brightness") * 100, 0),
        saturation: round(avg(inScene, "saturation") * 100, 0),
        motion: motion > 0.06 ? "alto" : motion > 0.025 ? "medio" : "bajo",
        motionScore: round(motion * 100, 1),
      });
    }

    const shotLengths = scenes.map((s) => s.duration);
    const stats = {
      totalShots: scenes.length,
      cutsPerMinute: round((cuts.length / duration) * 60, 1),
      avgShotLength: round(duration / scenes.length),
      medianShotLength: round(median(shotLengths)),
      shortestShot: round(Math.min(...shotLengths)),
      longestShot: round(Math.max(...shotLengths)),
      cutsInFirst3s: cuts.filter((c) => c <= 3).length,
      avgBrightness: round((samples.reduce((s, v) => s + v.brightness, 0) / samples.length) * 100, 0),
      avgSaturation: round((samples.reduce((s, v) => s + v.saturation, 0) / samples.length) * 100, 0),
    };

    // 2) Selección de fotogramas clave: el gancho + uno por toma + cobertura uniforme
    const times = new Set([0.05, Math.min(1, duration / 3), Math.min(2, duration / 2)]);
    let sceneTimes = scenes.map((s) => s.start + s.duration / 2);
    const budget = MAX_KEY_FRAMES - times.size;
    if (sceneTimes.length > budget) {
      const every = sceneTimes.length / budget;
      sceneTimes = Array.from({ length: budget }, (_, i) => sceneTimes[Math.floor(i * every)]);
    }
    sceneTimes.forEach((t) => times.add(t));
    const uniformSlots = MAX_KEY_FRAMES - times.size;
    for (let i = 1; i <= uniformSlots; i++) {
      const t = (duration * i) / (uniformSlots + 1);
      const near = [...times].some((x) => Math.abs(x - t) < Math.max(0.5, duration / 60));
      if (!near) times.add(t);
    }
    const frameTimes = [...times].filter((t) => t < duration).sort((a, b) => a - b).slice(0, MAX_KEY_FRAMES);

    const scale = Math.min(1, FRAME_MAX_SIDE / Math.max(width, height));
    const fw = Math.round(width * scale);
    const fh = Math.round(height * scale);
    const fcanvas = document.createElement("canvas");
    fcanvas.width = fw;
    fcanvas.height = fh;
    const fctx = fcanvas.getContext("2d", { willReadFrequently: true });

    const palCanvas = document.createElement("canvas");
    palCanvas.width = 48;
    palCanvas.height = Math.max(12, Math.round((48 * fh) / fw));
    const pctx = palCanvas.getContext("2d", { willReadFrequently: true });

    const frames = [];
    const palBlocks = [];
    for (let i = 0; i < frameTimes.length; i++) {
      const t = frameTimes[i];
      await seek(video, t);
      fctx.drawImage(video, 0, 0, fw, fh);
      pctx.drawImage(video, 0, 0, palCanvas.width, palCanvas.height);
      palBlocks.push(pctx.getImageData(0, 0, palCanvas.width, palCanvas.height).data);
      const scene = scenes.find((s) => t >= s.start && t < s.end) || scenes[scenes.length - 1];
      frames.push({ t: round(t), scene: scene.index, dataUrl: fcanvas.toDataURL("image/jpeg", 0.72) });
      onProgress(`Capturando fotogramas clave… ${i + 1}/${frameTimes.length}`, 60 + ((i + 1) / frameTimes.length) * 25);
    }

    // Si el paquete es muy pesado, recomprimimos
    let size = frames.reduce((s, f) => s + f.dataUrl.length, 0);
    if (size > MAX_PAYLOAD_CHARS) {
      onProgress("Optimizando tamaño de los fotogramas…", 86);
      for (const f of frames) {
        const img = new Image();
        img.src = f.dataUrl;
        await img.decode();
        fctx.drawImage(img, 0, 0, fw, fh);
        f.dataUrl = fcanvas.toDataURL("image/jpeg", 0.5);
      }
      size = frames.reduce((s, f) => s + f.dataUrl.length, 0);
    }

    const palette = extractPalette(palBlocks);

    onProgress("Analizando audio (volumen, silencios, BPM)…", 90);
    const audio = await analyzeAudio(file);

    onProgress("Análisis técnico listo", 100);
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    const g = gcd(width, height);
    return {
      meta: {
        fileName: file.name,
        fileSizeMb: round(file.size / 1024 / 1024, 1),
        mimeType: file.type || "desconocido",
        duration: round(duration),
        width,
        height,
        aspectRatio: `${width / g}:${height / g}`,
        orientation: height > width ? "vertical" : height === width ? "cuadrado" : "horizontal",
      },
      stats,
      cuts,
      scenes,
      palette,
      audio,
      frames,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
