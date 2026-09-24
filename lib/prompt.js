export const SYSTEM_PROMPT = `Eres un equipo completo de ingeniería inversa audiovisual en una sola mente: director creativo, director de fotografía, editor senior, diseñador de sonido, estratega de contenido y especialista en generación de video con IA.

Tu trabajo: recibir los fotogramas clave de un video (con su marca de tiempo y número de toma) más las métricas técnicas medidas en el navegador (cortes reales, duración de cada toma, brillo, saturación, movimiento, paleta, energía del audio y BPM estimado) y devolver un análisis profundo que permita REPLICAR el video lo más fielmente posible.

Reglas:
- Escribe en español neutro, claro y directo.
- Basa cada afirmación en la evidencia: fotogramas o métricas. Cuando infieras algo que no se ve (por ejemplo, la música o la voz), márcalo como "(inferido)".
- Usa las métricas medidas como fuente de verdad para el ritmo (cortes, duración de tomas, BPM). No inventes números distintos.
- Transcribe TODO el texto que aparece en pantalla, tal cual, con su tiempo aproximado.
- Sé concreto y accionable: tipos de plano, lentes aproximados, altura y movimiento de cámara, luz (dirección, dureza, temperatura), estilo de edición, transiciones, tipografías (estilo, peso, posición), animaciones de texto, efectos.
- Nada de relleno. Ve directo al punto.`;

const fmt = (n) => `${Number(n).toFixed(1)}s`;

export function buildUserPrompt({ meta, stats, scenes, palette, audio, context }) {
  const scenesTable = scenes
    .map((s) => `| ${s.index} | ${fmt(s.start)}–${fmt(s.end)} | ${fmt(s.duration)} | ${s.brightness}% | ${s.saturation}% | ${s.motion} (${s.motionScore}) |`)
    .join("\n");

  const audioBlock = audio.available
    ? `- Volumen medio: ${audio.meanDb} dBFS
- Porcentaje de silencio: ${audio.silenceRatio}%
- BPM estimado: ${audio.bpmEstimate ?? "n/d"} (confianza ${audio.bpmConfidence}; >1.5 es fiable, <1.2 es débil)
- Momentos de mayor energía (segundo: dB): ${audio.loudestMoments.map((m) => `${m.t}s: ${m.db}`).join(", ")}
- Energía por segundo (dBFS): ${audio.energyPerSecondDb.join(", ")}`
    : `- Audio no disponible: ${audio.reason}`;

  return `## Datos técnicos medidos del video

**Archivo:** ${meta.fileName} · ${meta.fileSizeMb} MB · ${meta.mimeType}
**Duración:** ${meta.duration}s · **Resolución:** ${meta.width}x${meta.height} · **Relación de aspecto:** ${meta.aspectRatio} (${meta.orientation})

**Ritmo de edición**
- Tomas detectadas: ${stats.totalShots}
- Cortes por minuto: ${stats.cutsPerMinute}
- Duración media de toma: ${stats.avgShotLength}s (mediana ${stats.medianShotLength}s, mínima ${stats.shortestShot}s, máxima ${stats.longestShot}s)
- Cortes en los primeros 3 segundos: ${stats.cutsInFirst3s}
- Brillo medio: ${stats.avgBrightness}% · Saturación media: ${stats.avgSaturation}%

**Tomas (escenas entre cortes)**
| # | Tiempo | Duración | Brillo | Saturación | Movimiento |
|---|---|---|---|---|---|
${scenesTable}

**Paleta dominante (HEX · % de píxeles):** ${palette.map((p) => `${p.hex} (${p.share}%)`).join(", ")}

**Audio**
${audioBlock}

## Contexto del usuario
- Plataforma de destino: ${context.platform || "no indicada"}
- Objetivo del video: ${context.goal || "no indicado"}
- Transcripción / lo que se dice: ${context.transcript ? `\n"""\n${context.transcript}\n"""` : "no proporcionada (infiere lo posible de subtítulos y textos en pantalla)"}
- Notas adicionales: ${context.notes || "ninguna"}

## Lo que necesito

Haz la ingeniería inversa completa del video con esta estructura exacta (usa encabezados Markdown y tablas):

# 1. Radiografía en 30 segundos
Qué es el video, formato, para quién está hecho, qué busca provocar y por qué funciona (o no). Máximo 6 viñetas.

# 2. Ficha técnica
Tabla: formato, duración, relación de aspecto, tipo de producción (UGC, estudio, stock, IA, animación, screen recording…), equipo probable (móvil/cámara, lente aproximado, estabilizador, micrófono), fps probable, estilo de color/LUT.

# 3. El gancho (0–3 s)
Análisis cuadro a cuadro del inicio: qué se ve, qué se lee, qué se oye (inferido), patrón de interrupción usado, y por qué detiene el scroll. Califica el gancho de 1 a 10 y explica.

# 4. Estructura narrativa
Divide el video en bloques (gancho, problema, desarrollo, prueba, giro, CTA… lo que aplique) con tiempos. Nombra el framework que sigue (AIDA, PAS, antes/después, lista, storytelling, tutorial, etc.).

# 5. Guion de tomas (shot list)
Tabla con UNA fila por toma medida: # | Tiempo | Tipo de plano | Ángulo y movimiento de cámara | Qué pasa / sujeto | Texto en pantalla (literal) | Transición de salida | Notas de edición.

# 6. Dirección de arte y fotografía
Paleta (usa los HEX medidos y di para qué se usa cada color), iluminación (esquema, dirección, dureza, temperatura), locación y escenografía, vestuario y props, composición recurrente.

# 7. Tipografía y gráficos en pantalla
Estilo de fuentes (sugiere fuentes gratuitas equivalentes de Google Fonts), tamaños relativos, posición, color, fondo/caja, animación de entrada, subtítulos (estilo tipo CapCut, karaoke, palabra a palabra…), emojis, stickers, flechas, zooms.

# 8. Edición y ritmo
Interpreta las métricas: ritmo, curva de energía, patrón de cortes (¿cortes al beat?), jump cuts, speed ramps, zooms digitales, efectos, transiciones. Explica cómo el ritmo sostiene la retención.

# 9. Audio y sonido
Voz (tipo, tono, velocidad, energía — inferido si no hay transcripción), música (género, BPM medido, mood), efectos de sonido (whoosh, pop, riser…), mezcla, momentos de silencio. Relaciona los picos de energía con lo que pasa en pantalla.

# 10. Psicología y persuasión
Disparadores usados (curiosidad, prueba social, autoridad, urgencia, identificación…), emociones buscadas, objeciones que desactiva, llamado a la acción.

# 11. Guion reconstruido
El guion completo listo para grabar, en formato tabla: Tiempo | Visual | Audio/voz | Texto en pantalla. Si no hay transcripción, reconstruye una versión plausible basada en los textos visibles y márcalo como (reconstruido).

# 12. Plan de réplica paso a paso
- Preproducción: lista de equipo (versión económica con móvil y versión pro), locación, props, casting.
- Producción: setup de luz y cámara por toma, ajustes (resolución, fps, obturación, balance de blancos), orden de grabación recomendado.
- Postproducción: flujo en CapCut y en Premiere/DaVinci (pasos concretos), preset de color, estilo de subtítulos, música sugerida (tipo y BPM), efectos de sonido.
- Tiempo y costo estimado.

# 13. Prompts para recrearlo con IA
Para cada toma (o grupo de tomas similares), un prompt en INGLÉS listo para generadores de video (Veo, Kling, Seedance, Runway, Sora): sujeto, acción, plano, movimiento de cámara, luz, estilo, relación de aspecto y duración. Añade un prompt de imagen base para mantener consistencia del personaje/producto.

# 14. Checklist de fidelidad
Lista de verificación de 10–15 puntos para comparar tu réplica contra el original.

# 15. Cómo mejorarlo
3 a 5 mejoras concretas para superar al original (gancho, retención, CTA), sin perder lo que lo hace funcionar.`;
}
