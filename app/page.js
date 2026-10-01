"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { analyzeVideo } from "../lib/videoAnalysis";
import { ShotTimeline, ShotDetail, PromptsList, promptsToMarkdown } from "./ShotStudio";
import PrintView from "./PrintView";
import { saveAnalysis, listAnalyses, getAnalysis, deleteAnalysis, toProjectFile, fromProjectFile } from "../lib/storage";

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
  const [selectedShot, setSelectedShot] = useState(null);
  const [shotPrompts, setShotPrompts] = useState({});
  const [shotStatus, setShotStatus] = useState({});
  const [shotErrors, setShotErrors] = useState({});
  const [bible, setBible] = useState(null);
  const [bibleError, setBibleError] = useState("");
  const promptBase = useRef(null);
  const inputRef = useRef(null);
  const projectRef = useRef(null);
  const [currentId, setCurrentId] = useState(null);
  const [createdAt, setCreatedAt] = useState(null);
  const [history, setHistory] = useState([]);
  const [savedAt, setSavedAt] = useState(null);
  const [storageError, setStorageError] = useState("");

  async function refreshHistory() {
    try {
      setHistory(await listAnalyses());
    } catch {
      setStorageError("Tu navegador no permite guardar el historial (¿modo incógnito?). Usa \"Guardar proyecto\".");
    }
  }

  useEffect(() => {
    refreshHistory();
  }, []);

  function buildRecord() {
    return {
      id: currentId,
      createdAt,
      context: { platform, goal, transcript, notes },
      effort,
      data,
      report,
      bible,
      shotPrompts,
    };
  }

  // Guardado automático en el historial (con pausa para no escribir en cada fragmento)
  useEffect(() => {
    if (!currentId || !data) return;
    const t = setTimeout(async () => {
      try {
        await saveAnalysis(buildRecord());
        setSavedAt(new Date());
        refreshHistory();
      } catch {
        setStorageError("No se pudo guardar en el historial del navegador. Usa \"Guardar proyecto\".");
      }
    }, 2000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, data, report, bible, shotPrompts]);

  function loadRecord(rec) {
    setFile(null);
    setVideoUrl("");
    setError("");
    setProgress({ label: "", pct: 0 });
    setPlatform(rec.context?.platform || "");
    setGoal(rec.context?.goal || "");
    setTranscript(rec.context?.transcript || "");
    setNotes(rec.context?.notes || "");
    if (rec.effort) setEffort(rec.effort);
    setData(rec.data);
    setReport(rec.report || "");
    setBible(rec.bible || null);
    setBibleError(rec.bible ? "" : "No disponible en este análisis.");
    const prompts = rec.shotPrompts || {};
    setShotPrompts(prompts);
    setShotStatus(Object.fromEntries(rec.data.scenes.map((s) => [s.index, prompts[s.index] ? "ready" : "error"])));
    setShotErrors(Object.fromEntries(rec.data.scenes.filter((s) => !prompts[s.index]).map((s) => [s.index, "No se generaron en este análisis."])));
    setSelectedShot(rec.data.scenes[0]?.index ?? null);
    promptBase.current = {
      base: { meta: rec.data.meta, colorGrade: rec.data.colorGrade, palette: rec.data.palette, context: rec.context, effort: rec.effort },
      shotFrames: rec.data.shotFrames,
      bible: rec.bible || null,
    };
    setCurrentId(rec.id);
    setCreatedAt(rec.createdAt);
    setSavedAt(rec.updatedAt ? new Date(rec.updatedAt) : null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function openHistory(id) {
    const rec = await getAnalysis(id);
    if (rec) loadRecord(rec);
  }

  async function removeHistory(id, name) {
    if (!window.confirm(`¿Eliminar "${name}" del historial? Esta acción no se puede deshacer.`)) return;
    await deleteAnalysis(id);
    if (id === currentId) setCurrentId(null);
    refreshHistory();
  }

  function baseName() {
    return (data?.meta?.fileName || file?.name || "video").replace(/\.[^.]+$/, "");
  }

  function saveProject() {
    const blob = new Blob([toProjectFile(buildRecord())], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `proyecto-${baseName()}-${new Date().toISOString().slice(0, 10)}.iiv.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function openProject(f) {
    if (!f) return;
    try {
      const rec = fromProjectFile(await f.text());
      if (!rec.id) rec.id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      if (!rec.createdAt) rec.createdAt = Date.now();
      loadRecord(rec);
      try {
        await saveAnalysis(rec);
        refreshHistory();
      } catch {}
    } catch (e) {
      setError(e instanceof SyntaxError ? "El archivo está dañado o no es un proyecto válido." : e.message);
    } finally {
      if (projectRef.current) projectRef.current.value = "";
    }
  }

  function exportPdf() {
    const prev = document.title;
    document.title = `Ingeniería inversa - ${baseName()}`;
    window.print();
    document.title = prev;
  }

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
    setCurrentId(null);
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
      setCurrentId(`${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
      setCreatedAt(Date.now());
      setSavedAt(null);
      setSelectedShot(result.scenes[0]?.index ?? null);

      setProgress({ label: "La IA está estudiando el video y generando los prompts de cada toma (puede tardar 1–4 minutos)…", pct: 100 });
      const context = { platform, goal, transcript, notes };
      const [reportResult] = await Promise.allSettled([streamReport(result, context), generateShotPrompts(result, context)]);
      if (reportResult.status === "rejected") throw reportResult.reason;
      setProgress({ label: "Análisis completo ✔", pct: 100 });
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
      setStreaming(false);
    }
  }

  async function postJson(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-app-password": password },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || `Error ${res.status}`);
    return j;
  }

  async function runShotChunk(shots) {
    const { base, shotFrames, bible: b } = promptBase.current;
    setShotStatus((st) => ({ ...st, ...Object.fromEntries(shots.map((s) => [s.index, "loading"])) }));
    try {
      const r = await postJson("/api/shot-prompts", {
        ...base,
        mode: "shots",
        bible: b,
        shots: shots.map((s) => ({ ...s, frames: shotFrames[s.index] })),
      });
      const got = Object.fromEntries((r.shots || []).map((p) => [p.shot, p]));
      setShotPrompts((pr) => ({ ...pr, ...got }));
      setShotStatus((st) => ({ ...st, ...Object.fromEntries(shots.map((s) => [s.index, got[s.index] ? "ready" : "error"])) }));
    } catch (e) {
      setShotStatus((st) => ({ ...st, ...Object.fromEntries(shots.map((s) => [s.index, "error"])) }));
      setShotErrors((er) => ({ ...er, ...Object.fromEntries(shots.map((s) => [s.index, e.message])) }));
    }
  }

  async function generateShotPrompts(result, context) {
    setShotPrompts({});
    setShotErrors({});
    setBible(null);
    setBibleError("");
    setShotStatus(Object.fromEntries(result.scenes.map((s) => [s.index, "loading"])));
    const base = { meta: result.meta, colorGrade: result.colorGrade, palette: result.palette, context, effort };
    promptBase.current = { base, shotFrames: result.shotFrames, bible: null };

    const every = Math.max(1, Math.ceil(result.frames.length / 10));
    const refFrames = result.frames.filter((_, i) => i % every === 0).slice(0, 10);
    try {
      const b = await postJson("/api/shot-prompts", { ...base, mode: "bible", refFrames });
      promptBase.current.bible = b;
      setBible(b);
    } catch (e) {
      setBibleError(e.message);
    }

    const chunks = [];
    for (let i = 0; i < result.scenes.length; i += 3) chunks.push(result.scenes.slice(i, i + 3));
    let next = 0;
    const worker = async () => {
      while (next < chunks.length) await runShotChunk(chunks[next++]);
    };
    await Promise.all([worker(), worker(), worker()]);
  }

  async function streamReport(result, context) {
    setStreaming(true);
    try {
      const { shotFrames, ...forReport } = result;
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-app-password": password },
        body: JSON.stringify({ ...forReport, effort, context }),
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
    } finally {
      setStreaming(false);
    }
  }

  function selectShot(index) {
    setSelectedShot(index);
    document.getElementById("shot-detail")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function download() {
    const name = baseName();
    const appendix = data ? `\n\n---\n\n${promptsToMarkdown({ bible, scenes: data.scenes, prompts: shotPrompts })}` : "";
    const blob = new Blob([report + appendix], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ingenieria-inversa-${name}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
    <main className="wrap screen-only">
      <header className="hero">
        <h1>
          Ingeniería inversa de <span>video</span>
        </h1>
        <p>
          Sube cualquier video y obtén un análisis profundo: gancho, estructura, guion de tomas, cámara, luz, color, tipografía, ritmo de
          edición, audio, psicología y un plan paso a paso (con prompts de IA) para replicarlo al máximo.
        </p>
      </header>

      <section className="card history">
        <div className="history-head">
          <h2>Mis análisis {history.length > 0 && <span className="muted">({history.length})</span>}</h2>
          <button className="ghost small" onClick={() => projectRef.current?.click()}>
            📂 Abrir proyecto
          </button>
          <input ref={projectRef} type="file" accept=".json,application/json" hidden onChange={(e) => openProject(e.target.files?.[0])} />
        </div>
        {storageError && <p className="error">{storageError}</p>}
        {history.length === 0 ? (
          <p className="muted">Aún no hay análisis guardados. Cada análisis se guarda solo en este navegador al terminar.</p>
        ) : (
          <div className="history-list">
            {history.map((h) => (
              <div key={h.id} className={`history-item ${h.id === currentId ? "active" : ""}`}>
                <button className="history-open" onClick={() => openHistory(h.id)} title="Abrir este análisis">
                  {h.thumb ? <img src={h.thumb} alt="" /> : <span className="history-ph" />}
                  <span>
                    <b>{h.fileName}</b>
                    <small className="muted">
                      {new Date(h.createdAt).toLocaleString("es", { dateStyle: "medium", timeStyle: "short" })} · {h.duration}s · {h.shots} tomas ·{" "}
                      {h.promptsReady}/{h.shots} prompts{h.hasReport ? "" : " · sin informe"}
                    </small>
                  </span>
                </button>
                <button className="ghost small" onClick={() => removeHistory(h.id, h.fileName)} aria-label={`Eliminar ${h.fileName}`}>
                  Eliminar
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

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
        <section className="card section toolbar">
          <div>
            <b>{data.meta.fileName}</b>
            <span className="muted">
              {savedAt ? ` · 💾 Guardado en tu historial a las ${savedAt.toLocaleTimeString("es", { timeStyle: "short" })}` : " · Guardando en tu historial…"}
              {!videoUrl && " · Video original no cargado (los fotogramas sí están guardados)"}
            </span>
          </div>
          <div className="actions" style={{ marginTop: 0 }}>
            <button className="ghost small" onClick={saveProject} disabled={busy}>
              💾 Guardar proyecto
            </button>
            <button className="ghost small" onClick={exportPdf} disabled={busy}>
              📄 Exportar PDF
            </button>
            <button className="ghost small" onClick={download} disabled={busy}>
              ⬇️ Descargar .md
            </button>
          </div>
        </section>
      )}

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
            {data.colorGrade && (
              <>
                <div className="stat"><b>{data.colorGrade.contrastStdPct}%</b><span>Contraste (desv. luminancia)</span></div>
                <div className="stat"><b>{data.colorGrade.warmth > 4 ? "Cálido" : data.colorGrade.warmth < -4 ? "Frío" : "Neutro"}</b><span>Temperatura (R−B {data.colorGrade.warmth})</span></div>
                <div className="stat"><b>{data.colorGrade.blackPointPct}%</b><span>Punto de negro{data.colorGrade.blackPointPct > 6 ? " · look mate" : ""}</span></div>
              </>
            )}
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

      {data && (
        <section className="card section">
          <h2>Línea de tiempo de tomas ({data.scenes.length})</h2>
          <ShotTimeline
            scenes={data.scenes}
            duration={data.meta.duration}
            shotFrames={data.shotFrames}
            status={shotStatus}
            selected={selectedShot}
            onSelect={selectShot}
          />
          <ShotDetail
            scene={data.scenes.find((s) => s.index === selectedShot)}
            frames={data.shotFrames?.[selectedShot]}
            prompt={shotPrompts[selectedShot]}
            status={shotStatus[selectedShot]}
            error={shotErrors[selectedShot]}
            videoUrl={videoUrl}
            onRetry={(index) => runShotChunk(data.scenes.filter((s) => s.index === index))}
          />
          <PromptsList
            bible={bible}
            bibleError={bibleError}
            scenes={data.scenes}
            shotFrames={data.shotFrames}
            prompts={shotPrompts}
            status={shotStatus}
            onSelect={selectShot}
          />
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
    <PrintView data={data} reportHtml={html} bible={bible} prompts={shotPrompts} context={{ platform, goal }} createdAt={createdAt} />
    </>
  );
}
