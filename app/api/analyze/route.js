import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT, buildUserPrompt } from "../../../lib/prompt";

export const runtime = "nodejs";
export const maxDuration = 300;

const EFFORTS = new Set(["medium", "high"]);

function jsonError(message, status) {
  return Response.json({ error: message }, { status });
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
  const { frames, meta, stats, scenes, palette, audio, context = {}, effort } = body || {};
  if (!Array.isArray(frames) || !frames.length || !meta || !stats || !Array.isArray(scenes)) {
    return jsonError("Faltan datos del análisis del video.", 400);
  }

  const content = [];
  for (const [i, f] of frames.entries()) {
    const data = String(f.dataUrl || "").replace(/^data:image\/jpeg;base64,/, "");
    if (!data) continue;
    content.push({ type: "text", text: `Fotograma ${i + 1} · t=${f.t}s · toma #${f.scene}` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } });
  }
  content.push({ type: "text", text: buildUserPrompt({ meta, stats, scenes, palette: palette || [], audio: audio || { available: false, reason: "sin datos" }, context }) });

  const client = new Anthropic();
  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      const send = (text) => controller.enqueue(encoder.encode(text));
      try {
        const stream = client.beta.messages.stream({
          model: "claude-opus-5",
          max_tokens: 64000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          thinking: { type: "adaptive" },
          output_config: { effort: EFFORTS.has(effort) ? effort : "high" },
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content }],
        });

        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            send(event.delta.text);
          }
        }

        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") {
          send("\n\n> ⚠️ El modelo no pudo completar el análisis de este video.");
        } else if (final.stop_reason === "max_tokens") {
          send("\n\n> ⚠️ El análisis se cortó por longitud. Prueba con un video más corto.");
        }
      } catch (error) {
        let msg = "Error inesperado al analizar.";
        if (error instanceof Anthropic.AuthenticationError) msg = "La ANTHROPIC_API_KEY no es válida.";
        else if (error instanceof Anthropic.RateLimitError) msg = "Límite de uso alcanzado. Espera un momento y vuelve a intentar.";
        else if (error instanceof Anthropic.BadRequestError) msg = `Solicitud rechazada por la API: ${error.message}`;
        else if (error instanceof Anthropic.APIError) msg = `Error de la API (${error.status}): ${error.message}`;
        console.error(error);
        send(`\n\n> ❌ ${msg}`);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache, no-transform" },
  });
}
