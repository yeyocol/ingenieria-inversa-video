import Anthropic from "@anthropic-ai/sdk";
import { BIBLE_SCHEMA, SHOTS_SCHEMA, PROMPT_SYSTEM, bibleToText, globalContext, shotLine } from "../../../lib/shotPrompts";

export const runtime = "nodejs";
export const maxDuration = 300;

function jsonError(message, status) {
  return Response.json({ error: message }, { status });
}

function imageBlocks(frames, label) {
  const out = [];
  for (const f of frames || []) {
    const data = String(f.dataUrl || "").replace(/^data:image\/jpeg;base64,/, "");
    if (!data) continue;
    out.push({ type: "text", text: label(f) });
    out.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } });
  }
  return out;
}

export async function POST(req) {
  const password = process.env.APP_PASSWORD;
  if (password && req.headers.get("x-app-password") !== password) {
    return jsonError("Clave de acceso incorrecta.", 401);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return jsonError("Falta configurar ANTHROPIC_API_KEY en el servidor.", 500);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonError("Solicitud inválida.", 400);
  }
  const { mode, meta, colorGrade, palette, context, refFrames, bible, shots } = body || {};
  if (!meta || (mode !== "bible" && mode !== "shots")) return jsonError("Solicitud inválida.", 400);

  const ctx = globalContext({ meta, colorGrade, palette, context });
  let content;
  let schema;
  if (mode === "bible") {
    content = [
      ...imageBlocks(refFrames, (f) => `Fotograma de referencia · t=${f.t}s · toma #${f.scene}`),
      {
        type: "text",
        text: `${ctx}

Crea la BIBLIA DE CONSISTENCIA del video para recrearlo con IA: cada personaje, producto y locación recurrente con una descripción visual en inglés ultra precisa y reutilizable (edad aparente, rasgos, piel, cabello, complexión, vestuario exacto con colores, accesorios; para productos: forma, material, colores, etiqueta, tamaño relativo; para locaciones: espacio, materiales, mobiliario, luz). Dales un id corto (P1, P2, PR1, L1…). Añade estilo global, look de cámara, look de color, estilo del texto en pantalla y el flujo de trabajo recomendado (en español) para recrear el video con IA manteniendo la consistencia.`,
      },
    ];
    schema = BIBLE_SCHEMA;
  } else {
    if (!Array.isArray(shots) || !shots.length) return jsonError("Faltan las tomas.", 400);
    // Primero el bloque fijo de todo el análisis (contexto + biblia) marcado para caché:
    // las siguientes llamadas de este mismo video lo leen al 10% del precio.
    content = [
      {
        type: "text",
        text: `${ctx}

BIBLIA DE CONSISTENCIA (usa estas descripciones palabra por palabra):
${bibleToText(bible)}`,
        cache_control: { type: "ephemeral" },
      },
    ];
    for (const s of shots) {
      content.push({ type: "text", text: shotLine(s) });
      content.push(...imageBlocks(s.frames, (f) => `Toma #${s.index} · fotograma de ${f.role} · t=${f.t}s`));
    }
    content.push({
      type: "text",
      text: `Genera los prompts súper detallados para recrear con máxima fidelidad CADA una de estas tomas: ${shots.map((s) => `#${s.index}`).join(", ")}. Devuelve una entrada por toma, en el mismo orden, con el número de toma en "shot".`,
    });
    schema = SHOTS_SCHEMA;
  }

  const client = new Anthropic();
  try {
    const stream = client.beta.messages.stream({
      model: "claude-opus-5",
      max_tokens: mode === "bible" ? 16000 : 48000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema },
      },
      system: PROMPT_SYSTEM,
      messages: [{ role: "user", content }],
    });
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") return jsonError("El modelo no pudo generar los prompts de estas tomas.", 422);
    if (final.stop_reason === "max_tokens") return jsonError("La respuesta se cortó por longitud.", 422);
    const text = final.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    return Response.json({ ...JSON.parse(text), _meta: { model: final.model, usage: final.usage } });
  } catch (error) {
    console.error(error);
    if (error instanceof SyntaxError) return jsonError("La respuesta del modelo no tuvo un formato válido.", 502);
    if (error instanceof Anthropic.AuthenticationError) return jsonError("La ANTHROPIC_API_KEY no es válida.", 401);
    if (error instanceof Anthropic.RateLimitError) return jsonError("Límite de uso alcanzado. Reintenta en un momento.", 429);
    if (error instanceof Anthropic.APIError) return jsonError(`Error de la API (${error.status}): ${error.message}`, 502);
    return jsonError("Error inesperado al generar los prompts.", 500);
  }
}
