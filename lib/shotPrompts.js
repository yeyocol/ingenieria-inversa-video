// Esquemas y textos para generar prompts estructurados por toma (imagen + video).

const str = { type: "string" };
const obj = (properties) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export const BIBLE_SCHEMA = obj({
  characters: {
    type: "array",
    items: obj({ id: str, name_es: str, description_en: str }),
  },
  products: {
    type: "array",
    items: obj({ id: str, name_es: str, description_en: str }),
  },
  locations: {
    type: "array",
    items: obj({ id: str, name_es: str, description_en: str }),
  },
  global_style_en: str,
  camera_look_en: str,
  color_look_en: str,
  text_style_es: str,
  recommended_workflow_es: str,
});

export const SHOTS_SCHEMA = obj({
  shots: {
    type: "array",
    items: obj({
      shot: { type: "integer" },
      title_es: str,
      what_happens_es: str,
      image: obj({
        subject: str,
        wardrobe_styling: str,
        pose_expression: str,
        environment: str,
        composition: str,
        camera_lens: str,
        lighting: str,
        color_grade: str,
        texture_quality: str,
        aspect_ratio: str,
        full_prompt_en: str,
        negative_prompt_en: str,
        best_tools_es: str,
      }),
      video: obj({
        duration_seconds: { type: "number" },
        start_frame_es: str,
        camera_movement: str,
        subject_action: str,
        beats: { type: "array", items: obj({ time: str, action: str }) },
        environment_motion: str,
        pacing_speed: str,
        audio_sfx: str,
        transition_in: str,
        transition_out: str,
        full_prompt_en: str,
        negative_prompt_en: str,
        settings: obj({ veo_flow: str, kling: str, seedance: str, runway: str }),
      }),
      post: obj({ on_screen_text: str, edit_notes_es: str }),
      fidelity_checks_es: { type: "array", items: str },
    }),
  },
});

export const PROMPT_SYSTEM = `Eres un ingeniero de prompts de élite para generación de imagen y video con IA (Nano Banana / Gemini Image, Imagen, Midjourney, GPT Image, Flux, Veo/Flow, Kling, Seedance, Runway) y director de fotografía. Tu misión: que cada toma se pueda recrear con la MÁXIMA fidelidad al original.

Reglas:
- Observa cada fotograma con lupa: encuadre exacto, posición del sujeto en cuadro (tercios, centrado, porcentaje del cuadro que ocupa), altura y ángulo de cámara, lente aproximado (mm equivalentes), profundidad de campo, dirección/dureza/temperatura de la luz, color, textura (grano, nitidez, compresión de móvil), vestuario, peinado, maquillaje, props, fondo y profundidad.
- Compara inicio, medio y final de cada toma para deducir el movimiento real de cámara y del sujeto, y su velocidad.
- Los prompts finales (full_prompt_en, negative_prompt_en) van en INGLÉS, son autónomos (no dicen "same as before") y largos, densos y concretos. El resto de campos descriptivos pueden ir en inglés; los campos *_es van en español neutro.
- Arquitectura obligatoria del prompt de imagen: [Shot type & framing] → [Subject + exact appearance] → [Wardrobe & styling] → [Pose & expression] → [Environment & background] → [Composition & subject placement] → [Camera, lens, aperture, height, angle] → [Lighting setup] → [Color grade & palette with HEX] → [Texture & capture medium] → [Aspect ratio].
- Arquitectura obligatoria del prompt de video: [Start frame reference] → [Camera movement with direction, speed and distance] → [Subject action, beat by beat with timestamps] → [Environment motion] → [Pacing/speed (real-time, slow motion, speed ramp)] → [Lighting & color continuity] → [Duration] → [Aspect ratio] → [Audio/SFX cue].
- Usa EXACTAMENTE, palabra por palabra, las descripciones de personajes, productos y locaciones de la biblia de consistencia cuando aparezcan, para que el personaje sea idéntico en todas las tomas.
- NO pongas el texto en pantalla dentro de los prompts de imagen/video (la IA lo deforma): va en post.on_screen_text, literal, para añadirlo en edición. Si el texto es parte física de la escena (un cartel, una etiqueta), sí descríbelo.
- duration_seconds = duración medida de la toma. En settings indica la duración a generar en cada herramienta (la más cercana que admita) y cuánto recortar después, el modo recomendado (image-to-video desde el fotograma de inicio, text-to-video, first/last frame) y ajustes clave (motion, cfg, cámara).
- fidelity_checks_es: 3 a 5 puntos verificables para comparar la toma generada con la original.`;

export function bibleToText(bible) {
  if (!bible) return "No disponible.";
  const list = (arr) => (arr?.length ? arr.map((x) => `- [${x.id}] ${x.name_es}: ${x.description_en}`).join("\n") : "- (ninguno)");
  return `Personajes:\n${list(bible.characters)}\nProductos:\n${list(bible.products)}\nLocaciones:\n${list(bible.locations)}\nEstilo global: ${bible.global_style_en}\nLook de cámara: ${bible.camera_look_en}\nLook de color: ${bible.color_look_en}\nEstilo de texto en pantalla: ${bible.text_style_es}`;
}

export function globalContext({ meta, colorGrade, palette, context }) {
  const cg = colorGrade
    ? `Punto de negro ${colorGrade.blackPointPct}%, punto de blanco ${colorGrade.whitePointPct}%, contraste ${colorGrade.contrastStdPct}%, saturación ${colorGrade.avgSaturationPct}%, calidez R−B ${colorGrade.warmth}, matiz ${colorGrade.tint}, tono de sombras ${colorGrade.shadowTone ?? "n/d"}, tono de luces ${colorGrade.highlightTone ?? "n/d"}.`
    : "n/d";
  return `Video: ${meta.duration}s, ${meta.width}x${meta.height}, relación ${meta.aspectRatio} (${meta.orientation}).
Paleta medida: ${(palette || []).map((p) => p.hex).join(", ")}.
Etalonaje medido: ${cg}
Plataforma: ${context?.platform || "no indicada"} · Objetivo: ${context?.goal || "no indicado"} · Notas: ${context?.notes || "ninguna"}
${context?.transcript ? `Transcripción:\n"""\n${context.transcript}\n"""` : ""}`;
}

export function shotLine(s) {
  return `Toma #${s.index}: ${s.start.toFixed(2)}s → ${s.end.toFixed(2)}s (duración ${s.duration.toFixed(2)}s) · entra con: ${s.transitionIn} · sale con: ${s.transitionOut} · brillo ${s.brightness}% · saturación ${s.saturation}% · movimiento ${s.motion} (${s.motionScore})`;
}
