"use client";

import { fmtPrecise } from "./ShotStudio";

function mid(frames) {
  return frames?.find((f) => f.role === "medio") || frames?.[0];
}

// Versión para imprimir / "Guardar como PDF": solo se ve al imprimir.
export default function PrintView({ data, reportHtml, bible, prompts, context, createdAt }) {
  if (!data) return null;
  const { meta, stats, colorGrade, palette, audio, scenes, shotFrames } = data;
  const date = new Date(createdAt || Date.now()).toLocaleString("es");

  return (
    <div id="print-view">
      <header className="pv-cover">
        <p className="pv-kicker">Ingeniería inversa de video</p>
        <h1>{meta.fileName}</h1>
        <p>
          {date} · {meta.duration}s · {meta.width}×{meta.height} ({meta.aspectRatio}) · {stats.totalShots} tomas
        </p>
        {(context?.platform || context?.goal) && (
          <p>
            {context.platform && <>Plataforma: {context.platform}. </>}
            {context.goal && <>Objetivo: {context.goal}.</>}
          </p>
        )}
      </header>

      <h2>Métricas medidas</h2>
      <table className="pv-table">
        <tbody>
          <tr>
            <th>Tomas</th>
            <td>{stats.totalShots}</td>
            <th>Cortes por minuto</th>
            <td>{stats.cutsPerMinute}</td>
          </tr>
          <tr>
            <th>Duración media de toma</th>
            <td>{stats.avgShotLength}s</td>
            <th>Cortes en los primeros 3 s</th>
            <td>{stats.cutsInFirst3s}</td>
          </tr>
          <tr>
            <th>Brillo / saturación medios</th>
            <td>
              {stats.avgBrightness}% / {stats.avgSaturation}%
            </td>
            <th>BPM estimado / silencio</th>
            <td>{audio?.available ? `${audio.bpmEstimate ?? "n/d"} / ${audio.silenceRatio}%` : "—"}</td>
          </tr>
          {colorGrade && (
            <tr>
              <th>Contraste / punto de negro</th>
              <td>
                {colorGrade.contrastStdPct}% / {colorGrade.blackPointPct}%
              </td>
              <th>Calidez (R−B) / matiz</th>
              <td>
                {colorGrade.warmth} / {colorGrade.tint}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h2>Paleta dominante</h2>
      <div className="pv-palette">
        {palette.map((p) => (
          <div key={p.hex}>
            <span style={{ background: p.hex }} />
            {p.hex}
          </div>
        ))}
      </div>

      <h2>Línea de tiempo de tomas</h2>
      <table className="pv-table pv-shots">
        <thead>
          <tr>
            <th>Toma</th>
            <th>Fotograma</th>
            <th>Tiempo</th>
            <th>Duración</th>
            <th>Entra con</th>
            <th>Descripción</th>
          </tr>
        </thead>
        <tbody>
          {scenes.map((s) => (
            <tr key={s.index}>
              <td>#{s.index}</td>
              <td>{mid(shotFrames?.[s.index]) && <img src={mid(shotFrames[s.index]).dataUrl} alt="" />}</td>
              <td>
                {fmtPrecise(s.start)} → {fmtPrecise(s.end)}
              </td>
              <td>{s.duration.toFixed(2)}s</td>
              <td>{s.transitionIn}</td>
              <td>{prompts[s.index]?.title_es || ""}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {reportHtml && (
        <section className="pv-break">
          <h2>Informe</h2>
          <div className="md" dangerouslySetInnerHTML={{ __html: reportHtml }} />
        </section>
      )}

      <section className="pv-break">
        <h2>Prompts para recrearlo con IA</h2>
        {bible && (
          <div className="pv-bible">
            <h3>Biblia de consistencia</h3>
            {[...(bible.characters || []), ...(bible.products || []), ...(bible.locations || [])].map((x) => (
              <p key={x.id}>
                <b>
                  [{x.id}] {x.name_es}:
                </b>{" "}
                {x.description_en}
              </p>
            ))}
            <p>
              <b>Estilo global:</b> {bible.global_style_en}
            </p>
            <p>
              <b>Look de cámara:</b> {bible.camera_look_en}
            </p>
            <p>
              <b>Look de color:</b> {bible.color_look_en}
            </p>
            <p>
              <b>Flujo recomendado:</b> {bible.recommended_workflow_es}
            </p>
          </div>
        )}
        {scenes.map((s) => {
          const p = prompts[s.index];
          const f = mid(shotFrames?.[s.index]);
          return (
            <div key={s.index} className="pv-shot">
              <h3>
                Toma #{s.index} · {fmtPrecise(s.start)} → {fmtPrecise(s.end)} ({s.duration.toFixed(2)}s){p ? ` — ${p.title_es}` : ""}
              </h3>
              <div className="pv-shot-body">
                {f && <img src={f.dataUrl} alt="" />}
                <div>
                  {p ? (
                    <>
                      <p>{p.what_happens_es}</p>
                      <h4>Prompt de imagen</h4>
                      <pre>{p.image.full_prompt_en}</pre>
                      <p className="pv-neg">Negative: {p.image.negative_prompt_en}</p>
                      <h4>Prompt de video ({p.video.duration_seconds}s)</h4>
                      <pre>{p.video.full_prompt_en}</pre>
                      <p className="pv-neg">Negative: {p.video.negative_prompt_en}</p>
                      <p>
                        <b>Veo / Flow:</b> {p.video.settings.veo_flow} · <b>Kling:</b> {p.video.settings.kling} · <b>Seedance:</b>{" "}
                        {p.video.settings.seedance} · <b>Runway:</b> {p.video.settings.runway}
                      </p>
                      {p.post.on_screen_text && (
                        <p>
                          <b>Texto en pantalla:</b> {p.post.on_screen_text}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="pv-neg">Prompts no disponibles para esta toma.</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
