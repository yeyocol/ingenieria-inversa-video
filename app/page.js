"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { analyzeVideo } from "../lib/videoAnalysis";

const PLATFORMS = ["", "TikTok", "Instagram Reels", "YouTube Shorts", "YouTube (largo)", "Facebook / Meta Ads", "LinkedIn", "Anuncio de TV / web", "Otro"];

function fmtTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function EnergyChart({ values }) {
  if (!values?.length) return null;
  const min = Math.max(Math.min(...values), -60);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values
    .map((v, i) => `${(i / Math.max(values.length - 1, 1)) * 100},${100 - ((Math.max(v, min) - min) / range) * 90}`)
    .join(" ");
  return (
    <svg className="energy" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Energía del audio por segundo">
      <polyline points={pts} fill="none" stroke="#22d3ee" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function Home() {
  const [file, setFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [over, setOver] = useState(false);
  const [platform, setPlatform] = useState("");
  const [goal, setGoal] = useState("");
  const [transcript, setTranscript] = useState("");
  const [notes, setNotes] = useState("");
  const [effort, setEffort] = useState("high");
  const [password, setPassword] = useState("");
  const [progress, setProgress] = useState({ label: "", pct: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [report, setReport] = useState("");
  const [streaming, setStreaming] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    try {
      setPassword(localStorage.getItem("iiv-pass") || "");
    } catch {}
  }, []);

  useEffect(() => () => videoUrl && URL.revokeObjectURL(videoUrl), [videoUrl]);

  const html = useMemo(() => (report ? DOMPurify.sanitize(marked.parse(report)) : ""), [report]);

  function pick(f) {
    if (!f) return;
    if (!f.type.startsWith("video/")) {
      setError("El archivo debe ser un video (MP4, MOV, WebM…).");
      return;
    }
    setError("");
    setData(null);
    setReport("");
    setFile(f);
    setVideoUrl(URL.createObjectURL(f));
  }

  async function run() {
    if (!file) return;
    setBusy(true);
    setError("");
    setReport("");
    setData(null);
    try {
      try {
        localStorage.setItem("iiv-pass", password);
      } catch {}
      const result = await analyzeVideo(file, (label, pct) => setProgress({ label, pct }));
      setData(result);

      setProgress({ label: "La IA está estudiando el video a fondo (puede tardar 1–4 minutos)…", pct: 100 });
      setStreaming(true);
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-app-password": password },
        body: JSON.stringify({ ...result, effort, context: { platform, goal, transcript, notes } }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Error ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setReport(acc);
      }
      setProgress({ label: "Análisis completo ✔", pct: 100 });
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
      setStreaming(false);
    }
  }

  function download() {
    const name = (file?.name || "video").replace(/\.[^.]+$/, "");
    const blob = new Blob([report], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ingenieria-inversa-${name}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const hues = ["#7c5cff", "#5b8cff", "#22d3ee", "#34d399", "#f59e0b", "#f472b6"];

  return (
    <main className="wrap">
      <header className="hero">
        <h1>
          Ingeniería inversa de <span>video</span>
        </h1>
        <p>
          Sube cualquier video y obtén un análisis profundo: gancho, estructura, guion de tomas, cámara, luz, color, tipografía, ritmo de
          edición, audio, psicología y un plan paso a paso (con prompts de IA) para replicarlo al máximo.
        </p>
      </header>

      <div className="grid">
        <section className="card">
          <h2>1. Tu video</h2>
          <div
            className={`drop ${over ? "over" : ""}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              pick(e.dataTransfer.files?.[0]);
            }}
          >
            <strong>{file ? file.name : "Arrastra tu video aquí o haz clic"}</strong>
            <small>MP4, MOV o WebM · se procesa en tu navegador; solo se envían fotogramas clave y métricas</small>
            <input ref={inputRef} type="file" accept="video/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
          </div>
          {videoUrl && <video className="preview" src={videoUrl} controls playsInline />}
        </section>

        <section className="card">
          <h2>2. Contexto (opcional, mejora el análisis)</h2>
          <div className="row">
            <div>
              <label htmlFor="platform">Plataforma</label>
              <select id="platform" value={platform} onChange={(e) => setPlatform(e.target.value)}>
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {p || "Selecciona…"}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="effort">Profundidad</label>
              <select id="effort" value={effort} onChange={(e) => setEffort(e.target.value)}>
                <option value="high">Máxima (más lento)</option>
                <option value="medium">Rápida</option>
              </select>
            </div>
          </div>
          <label htmlFor="goal">Objetivo del video</label>
          <input id="goal" placeholder="Ej.: anuncio para vender un curso, video viral de marca personal…" value={goal} onChange={(e) => setGoal(e.target.value)} />
          <label htmlFor="transcript">Transcripción o lo que se dice (recomendado)</label>
          <textarea id="transcript" placeholder="Pega aquí el texto hablado. Si no lo tienes, la IA lo reconstruye desde los textos en pantalla." value={transcript} onChange={(e) => setTranscript(e.target.value)} />
          <label htmlFor="notes">Notas</label>
          <input id="notes" placeholder="Ej.: quiero replicarlo para mi marca de café" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <label htmlFor="pass">Clave de acceso (si la app la pide)</label>
          <input id="pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <div className="actions">
            <button onClick={run} disabled={!file || busy}>
              {busy ? "Analizando…" : "Hacer ingeniería inversa"}
            </button>
          </div>
          {(busy || progress.pct > 0) && (
            <div className="progress">
              <div className="bar">
                <div style={{ width: `${progress.pct}%` }} />
              </div>
              <p>{progress.label}</p>
            </div>
          )}
          {error && <p className="error">{error}</p>}
        </section>
      </div>

      {data && (
        <section className="card section">
          <h2>Métricas técnicas medidas</h2>
          <div className="stats">
            <div className="stat"><b>{data.meta.duration}s</b><span>Duración</span></div>
            <div className="stat"><b>{data.meta.width}×{data.meta.height}</b><span>Resolución · {data.meta.aspectRatio}</span></div>
            <div className="stat"><b>{data.stats.totalShots}</b><span>Tomas detectadas</span></div>
            <div className="stat"><b>{data.stats.cutsPerMinute}</b><span>Cortes por minuto</span></div>
            <div className="stat"><b>{data.stats.avgShotLength}s</b><span>Duración media de toma</span></div>
            <div className="stat"><b>{data.stats.cutsInFirst3s}</b><span>Cortes en los primeros 3 s</span></div>
            <div className="stat"><b>{data.stats.avgBrightness}%</b><span>Brillo medio</span></div>
            <div className="stat"><b>{data.stats.avgSaturation}%</b><span>Saturación media</span></div>
            <div className="stat"><b>{data.audio.available ? data.audio.bpmEstimate ?? "n/d" : "—"}</b><span>BPM estimado</span></div>
            <div className="stat"><b>{data.audio.available ? `${data.audio.silenceRatio}%` : "—"}</b><span>Silencio</span></div>
          </div>

          <h2 style={{ marginTop: 20 }}>Línea de tiempo de tomas</h2>
          <div className="timeline">
            {data.scenes.map((s, i) => (
              <div
                key={s.index}
                className="seg"
                title={`Toma ${s.index}: ${s.start}s–${s.end}s · movimiento ${s.motion}`}
                style={{ width: `${(s.duration / data.meta.duration) * 100}%`, background: hues[i % hues.length], opacity: 0.45 + (s.brightness / 100) * 0.55 }}
              />
            ))}
          </div>
          <div className="tl-labels">
            <span>0:00</span>
            <span>{fmtTime(data.meta.duration)}</span>
          </div>

          <h2 style={{ marginTop: 20 }}>Paleta dominante</h2>
          <div className="palette">
            {data.palette.map((p) => (
              <div key={p.hex} className="swatch">
                <div style={{ background: p.hex }} />
                <span>{p.hex}</span>
              </div>
            ))}
          </div>

          {data.audio.available && (
            <>
              <h2 style={{ marginTop: 20 }}>Energía del audio</h2>
              <EnergyChart values={data.audio.energyPerSecondDb} />
            </>
          )}

          <h2 style={{ marginTop: 20 }}>Fotogramas clave enviados a la IA ({data.frames.length})</h2>
          <div className="frames">
            {data.frames.map((f) => (
              <figure key={f.t}>
                <img src={f.dataUrl} alt={`Fotograma en ${f.t}s`} />
                <figcaption>
                  {fmtTime(f.t)} · toma {f.scene}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {(report || streaming) && (
        <section className="card report">
          <h2>Informe de ingeniería inversa</h2>
          {streaming && !report && (
            <div className="thinking">
              <div className="dot" /> La IA está observando cada fotograma y cruzándolo con las métricas…
            </div>
          )}
          <div className="md" dangerouslySetInnerHTML={{ __html: html }} />
          {!streaming && report && (
            <div className="actions">
              <button className="ghost" onClick={() => navigator.clipboard.writeText(report)}>
                Copiar informe
              </button>
              <button className="ghost" onClick={download}>
                Descargar .md
              </button>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
