"use client";

import { useEffect, useRef, useState } from "react";

const HUES = ["#7c5cff", "#5b8cff", "#22d3ee", "#34d399", "#f59e0b", "#f472b6"];

export function fmtPrecise(s) {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(2).padStart(5, "0");
  return `${m}:${sec}`;
}

function fmtTick(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  const secTxt = Number.isInteger(sec) ? String(sec).padStart(2, "0") : sec.toFixed(1).padStart(4, "0");
  return `${m}:${secTxt}`;
}

function CopyButton({ text, label = "Copiar" }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="ghost small"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? "¡Copiado!" : label}
    </button>
  );
}

function midFrame(frames) {
  return frames?.find((f) => f.role === "medio") || frames?.[0];
}

export function ShotTimeline({ scenes, duration, shotFrames, status, selected, onSelect }) {
  const options = [0.5, 1, 2, 5, 10, 15, 30, 60, 120];
  const interval = options.find((o) => duration / o <= 12) || 300;
  const ticks = [];
  for (let t = 0; t <= duration + 1e-6; t += interval) ticks.push(t);

  return (
    <div className="stl">
      <div className="stl-track">
        {scenes.map((s, i) => {
          const w = (s.duration / duration) * 100;
          const thumb = midFrame(shotFrames?.[s.index]);
          const st = status[s.index];
          return (
            <button
              key={s.index}
              className={`stl-seg ${selected === s.index ? "sel" : ""}`}
              style={{ width: `${w}%`, "--hue": HUES[i % HUES.length] }}
              title={`Toma ${s.index} · ${fmtPrecise(s.start)} → ${fmtPrecise(s.end)} · ${s.duration.toFixed(2)} s · entra con ${s.transitionIn}`}
              onClick={() => onSelect(s.index)}
            >
              <span className="stl-thumb" style={thumb ? { backgroundImage: `url(${thumb.dataUrl})` } : undefined} />
              <span className="stl-bar">
                {w > 2.2 && <b>{s.index}</b>}
                {w > 5 && <small>{s.duration.toFixed(1)}s</small>}
                <i className={`stl-dot ${st || ""}`} />
              </span>
            </button>
          );
        })}
      </div>
      <div className="stl-ticks">
        {ticks.map((t) => (
          <span key={t} style={{ left: `${(t / duration) * 100}%` }}>
            {fmtTick(t)}
          </span>
        ))}
      </div>
      <p className="muted stl-hint">
        Haz clic en una toma para generar y ver su prompt exacto de imagen y de video. <span className="stl-dot" /> pendiente ·{" "}
        <span className="stl-dot ready" /> listo · <span className="stl-dot loading" /> generando · <span className="stl-dot error" /> error
      </p>
    </div>
  );
}

function ShotPlayer({ src, start, end }) {
  const ref = useRef(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.currentTime = start;
    v.play().catch(() => {});
  }, [src, start, end]);
  return (
    <video
      ref={ref}
      className="shot-player"
      src={src}
      muted
      playsInline
      controls
      onTimeUpdate={(e) => {
        if (e.currentTarget.currentTime >= end - 0.03 || e.currentTarget.currentTime < start - 0.2) e.currentTarget.currentTime = start;
      }}
    />
  );
}

function Fields({ rows }) {
  return (
    <table className="fields">
      <tbody>
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <tr key={k}>
              <th>{k}</th>
              <td>{v}</td>
            </tr>
          ))}
      </tbody>
    </table>
  );
}

export function ShotDetail({ scene, frames, prompt, status, error, videoUrl, onGenerate }) {
  if (!scene) return null;
  return (
    <div className="shot-detail" id="shot-detail">
      <div className="sd-head">
        <h3>
          Toma #{scene.index}
          {prompt?.title_es ? ` — ${prompt.title_es}` : ""}
        </h3>
        <span className="muted">
          {fmtPrecise(scene.start)} → {fmtPrecise(scene.end)} · {scene.duration.toFixed(2)} s · entra con {scene.transitionIn} · sale con{" "}
          {scene.transitionOut}
        </span>
      </div>

      <div className="sd-media">
        {videoUrl && <ShotPlayer src={videoUrl} start={scene.start} end={scene.end} />}
        <div className="sd-frames">
          {(frames || []).map((f) => (
            <figure key={f.role}>
              <img src={f.dataUrl} alt={`Fotograma de ${f.role}`} />
              <figcaption>
                {f.role} · {fmtPrecise(f.t)}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>

      <div className="chips">
        <span>Brillo {scene.brightness}%</span>
        <span>Saturación {scene.saturation}%</span>
        <span>Movimiento {scene.motion}</span>
      </div>

      {status === "pending" && (
        <div className="pending-box">
          <span className="muted">Los prompts de esta toma se generan solo cuando los pides, para no gastar créditos de más.</span>
          <button className="small" onClick={() => onGenerate(scene.index)}>
            ✨ Generar prompts de esta toma
          </button>
        </div>
      )}
      {status === "loading" && (
        <div className="thinking">
          <div className="dot" /> Generando los prompts de esta toma…
        </div>
      )}
      {status === "error" && (
        <p className="error">
          {error || "No se pudieron generar los prompts de esta toma."}{" "}
          <button className="ghost small" onClick={() => onGenerate(scene.index)}>
            Reintentar
          </button>
        </p>
      )}

      {prompt && (
        <>
          <p>{prompt.what_happens_es}</p>
          <div className="prompt-grid">
            <div className="prompt-card">
              <div className="pc-head">
                <h4>🖼️ Prompt de imagen (fotograma inicial)</h4>
                <CopyButton text={prompt.image.full_prompt_en} />
              </div>
              <pre>{prompt.image.full_prompt_en}</pre>
              <div className="pc-head">
                <h5>Negative prompt</h5>
                <CopyButton text={prompt.image.negative_prompt_en} />
              </div>
              <pre className="neg">{prompt.image.negative_prompt_en}</pre>
              <details>
                <summary>Arquitectura del prompt</summary>
                <Fields
                  rows={[
                    ["Sujeto", prompt.image.subject],
                    ["Vestuario y estilismo", prompt.image.wardrobe_styling],
                    ["Pose y expresión", prompt.image.pose_expression],
                    ["Entorno", prompt.image.environment],
                    ["Composición", prompt.image.composition],
                    ["Cámara y lente", prompt.image.camera_lens],
                    ["Iluminación", prompt.image.lighting],
                    ["Color", prompt.image.color_grade],
                    ["Textura", prompt.image.texture_quality],
                    ["Relación de aspecto", prompt.image.aspect_ratio],
                    ["Mejores herramientas", prompt.image.best_tools_es],
                  ]}
                />
              </details>
            </div>

            <div className="prompt-card">
              <div className="pc-head">
                <h4>🎬 Prompt de video ({prompt.video.duration_seconds}s)</h4>
                <CopyButton text={prompt.video.full_prompt_en} />
              </div>
              <pre>{prompt.video.full_prompt_en}</pre>
              <div className="pc-head">
                <h5>Negative prompt</h5>
                <CopyButton text={prompt.video.negative_prompt_en} />
              </div>
              <pre className="neg">{prompt.video.negative_prompt_en}</pre>
              {prompt.video.beats?.length > 0 && (
                <table className="fields beats">
                  <thead>
                    <tr>
                      <th>Tiempo</th>
                      <th>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prompt.video.beats.map((b, i) => (
                      <tr key={i}>
                        <td>{b.time}</td>
                        <td>{b.action}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <details>
                <summary>Arquitectura del prompt y ajustes por herramienta</summary>
                <Fields
                  rows={[
                    ["Fotograma de inicio", prompt.video.start_frame_es],
                    ["Movimiento de cámara", prompt.video.camera_movement],
                    ["Acción del sujeto", prompt.video.subject_action],
                    ["Movimiento del entorno", prompt.video.environment_motion],
                    ["Ritmo y velocidad", prompt.video.pacing_speed],
                    ["Audio / SFX", prompt.video.audio_sfx],
                    ["Transición de entrada", prompt.video.transition_in],
                    ["Transición de salida", prompt.video.transition_out],
                    ["Veo / Flow", prompt.video.settings.veo_flow],
                    ["Kling", prompt.video.settings.kling],
                    ["Seedance", prompt.video.settings.seedance],
                    ["Runway", prompt.video.settings.runway],
                  ]}
                />
              </details>
            </div>
          </div>

          <div className="prompt-grid">
            <div className="prompt-card">
              <h4>✏️ Postproducción</h4>
              <Fields
                rows={[
                  ["Texto en pantalla (literal)", prompt.post.on_screen_text || "—"],
                  ["Notas de edición", prompt.post.edit_notes_es],
                ]}
              />
            </div>
            <div className="prompt-card">
              <h4>✅ Checklist de fidelidad</h4>
              <ul>
                {prompt.fidelity_checks_es.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function promptsToMarkdown({ bible, scenes, prompts }) {
  const out = ["# Prompts para recrearlo con IA", ""];
  if (bible) {
    out.push("## Biblia de consistencia", "");
    for (const [label, arr] of [
      ["Personajes", bible.characters],
      ["Productos", bible.products],
      ["Locaciones", bible.locations],
    ]) {
      if (arr?.length) {
        out.push(`**${label}**`, "");
        arr.forEach((x) => out.push(`- **[${x.id}] ${x.name_es}:** ${x.description_en}`));
        out.push("");
      }
    }
    out.push(`- **Estilo global:** ${bible.global_style_en}`, `- **Look de cámara:** ${bible.camera_look_en}`, `- **Look de color:** ${bible.color_look_en}`);
    out.push(`- **Texto en pantalla:** ${bible.text_style_es}`, `- **Flujo recomendado:** ${bible.recommended_workflow_es}`, "");
  }
  for (const s of scenes) {
    const p = prompts[s.index];
    out.push(`## Toma #${s.index} · ${fmtPrecise(s.start)} → ${fmtPrecise(s.end)} (${s.duration.toFixed(2)} s)${p ? ` — ${p.title_es}` : ""}`, "");
    if (!p) {
      out.push("_Prompts no disponibles._", "");
      continue;
    }
    out.push(p.what_happens_es, "", "### Prompt de imagen", "", "```", p.image.full_prompt_en, "```", "", `**Negative:** ${p.image.negative_prompt_en}`, "");
    out.push(`### Prompt de video (${p.video.duration_seconds}s)`, "", "```", p.video.full_prompt_en, "```", "", `**Negative:** ${p.video.negative_prompt_en}`, "");
    if (p.video.beats?.length) out.push(...p.video.beats.map((b) => `- **${b.time}:** ${b.action}`), "");
    out.push(
      `- **Veo / Flow:** ${p.video.settings.veo_flow}`,
      `- **Kling:** ${p.video.settings.kling}`,
      `- **Seedance:** ${p.video.settings.seedance}`,
      `- **Runway:** ${p.video.settings.runway}`,
      `- **Texto en pantalla:** ${p.post.on_screen_text || "—"}`,
      `- **Edición:** ${p.post.edit_notes_es}`,
      ""
    );
  }
  return out.join("\n");
}

export function PromptsList({ bible, bibleError, scenes, shotFrames, prompts, status, onSelect, onGenerateAll }) {
  const md = promptsToMarkdown({ bible, scenes, prompts });
  const readyCount = scenes.filter((s) => prompts[s.index]).length;
  const missing = scenes.filter((s) => !prompts[s.index] && status[s.index] !== "loading").length;
  const anyLoading = scenes.some((s) => status[s.index] === "loading");

  function download(ext) {
    const content = ext === "json" ? JSON.stringify({ bible, shots: scenes.map((s) => ({ ...s, prompts: prompts[s.index] || null })) }, null, 2) : md;
    const blob = new Blob([content], { type: ext === "json" ? "application/json" : "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `prompts-por-toma.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="prompts-list">
      <div className="pl-head">
        <h2>Prompts para recrearlo con IA</h2>
        <span className="muted">
          {readyCount}/{scenes.length} tomas listas
        </span>
        <div className="actions" style={{ marginTop: 0 }}>
          {missing > 0 && (
            <button
              className="small"
              onClick={() => {
                if (missing <= 3 || window.confirm(`Se generarán los prompts de ${missing} tomas. Esto consume créditos de la API. ¿Continuar?`)) onGenerateAll();
              }}
            >
              ✨ Generar {readyCount ? "los que faltan" : "todos"} ({missing})
            </button>
          )}
          <CopyButton text={md} label="Copiar todos" />
          <button className="ghost small" onClick={() => download("md")}>
            Descargar .md
          </button>
          <button className="ghost small" onClick={() => download("json")}>
            Descargar .json
          </button>
        </div>
      </div>

      {bible ? (
        <details className="bible" open>
          <summary>📘 Biblia de consistencia (personajes, producto, locaciones y look)</summary>
          <div className="bible-grid">
            {[
              ["Personajes", bible.characters],
              ["Productos", bible.products],
              ["Locaciones", bible.locations],
            ].map(([label, arr]) =>
              arr?.length ? (
                <div key={label}>
                  <h5>{label}</h5>
                  {arr.map((x) => (
                    <div key={x.id} className="bible-item">
                      <div className="pc-head">
                        <b>
                          [{x.id}] {x.name_es}
                        </b>
                        <CopyButton text={x.description_en} />
                      </div>
                      <p>{x.description_en}</p>
                    </div>
                  ))}
                </div>
              ) : null
            )}
          </div>
          <Fields
            rows={[
              ["Estilo global", bible.global_style_en],
              ["Look de cámara", bible.camera_look_en],
              ["Look de color", bible.color_look_en],
              ["Texto en pantalla", bible.text_style_es],
              ["Flujo recomendado", bible.recommended_workflow_es],
            ]}
          />
        </details>
      ) : bibleError ? (
        <p className="error">Biblia de consistencia: {bibleError}</p>
      ) : anyLoading ? (
        <div className="thinking">
          <div className="dot" /> Creando la biblia de consistencia (personajes, producto y look)…
        </div>
      ) : (
        <p className="muted">La biblia de consistencia se crea junto con los primeros prompts que generes.</p>
      )}

      {scenes.map((s) => {
        const p = prompts[s.index];
        const thumb = midFrame(shotFrames?.[s.index]);
        return (
          <div key={s.index} className="pl-item">
            <button className="pl-title" onClick={() => onSelect(s.index)}>
              {thumb && <img src={thumb.dataUrl} alt="" />}
              <span>
                <b>
                  Toma #{s.index}
                  {p ? ` — ${p.title_es}` : ""}
                </b>
                <small className="muted">
                  {fmtPrecise(s.start)} → {fmtPrecise(s.end)} · {s.duration.toFixed(2)} s
                </small>
              </span>
              <i className={`stl-dot ${status[s.index] || ""}`} />
            </button>
            {p ? (
              <div className="prompt-grid">
                <div className="prompt-card">
                  <div className="pc-head">
                    <h5>🖼️ Imagen</h5>
                    <CopyButton text={p.image.full_prompt_en} />
                  </div>
                  <pre>{p.image.full_prompt_en}</pre>
                </div>
                <div className="prompt-card">
                  <div className="pc-head">
                    <h5>🎬 Video ({p.video.duration_seconds}s)</h5>
                    <CopyButton text={p.video.full_prompt_en} />
                  </div>
                  <pre>{p.video.full_prompt_en}</pre>
                </div>
              </div>
            ) : (
              <p className="muted">
                {status[s.index] === "error"
                  ? "Error al generar. Ábrela para reintentar."
                  : status[s.index] === "loading"
                    ? "Generando…"
                    : "Pendiente: haz clic en la toma para generar sus prompts."}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
