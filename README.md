# Ingeniería Inversa de Video

App web para hacer ingeniería inversa de cualquier video: sube el archivo y obtén un análisis profundo para **replicarlo al máximo**.

## Qué hace

1. **Análisis técnico en tu navegador** (el video no se sube completo):
   - Metadatos: duración, resolución, relación de aspecto, orientación.
   - Detección de tomas ajustada al cuadro exacto (búsqueda binaria), con tipo de transición:
     corte directo, disolvencia o fundido a negro; cortes por minuto y duración de cada toma.
   - Fotogramas de inicio, medio y final de cada toma.
   - Brillo, saturación y nivel de movimiento por toma.
   - Paleta de color dominante (HEX).
   - Etalonaje medido: puntos de negro y blanco, contraste, temperatura, matiz y tono de sombras y luces.
   - Audio: energía por segundo, % de silencio, BPM estimado, picos.
   - Hasta 30 fotogramas clave (gancho + uno por toma + cobertura).
2. **Análisis con IA (Claude)** que cruza fotogramas y métricas y entrega:
   radiografía, ficha técnica, gancho (0–3 s), estructura narrativa, shot list,
   dirección de arte, tipografía, edición y ritmo, audio, psicología,
   guion reconstruido, plan de réplica paso a paso, prompts de IA por toma
   (Veo, Kling, Seedance, Runway, Sora), checklist de fidelidad, mejoras y,
   al final, una tabla con los valores exactos para replicar el etalonaje en el
   panel Ajustar (Adjust) de CapCut: básico, HSL, curvas y ruedas de color.
3. **Línea de tiempo interactiva de tomas:** miniaturas, marcas de tiempo y, al hacer clic
   en una toma, su reproducción en bucle y sus prompts súper detallados con arquitectura
   estructurada:
   - Prompt de imagen del fotograma inicial (Nano Banana, Imagen, Midjourney, GPT Image, Flux).
   - Prompt de video con acciones por tiempo y ajustes para Veo/Flow, Kling, Seedance y Runway.
   - Negative prompts, texto en pantalla para postproducción y checklist de fidelidad.
   - Biblia de consistencia (personajes, productos, locaciones y look) usada en todas las tomas.
4. **Guardar y exportar:**
   - **Historial automático** ("Mis análisis"): cada análisis se guarda solo en el navegador
     (IndexedDB) y se puede reabrir o eliminar. Nada sale del equipo.
   - **Archivo de proyecto** (`.iiv.json`): guarda todo (informe, métricas, tomas, fotogramas y
     prompts) y se vuelve a abrir con la línea de tiempo interactiva desde "Abrir proyecto".
   - **Exportar PDF**: versión para imprimir en fondo claro; en el diálogo elige "Guardar como PDF".
   - Descarga del informe y los prompts en Markdown (y los prompts también en JSON).

## Ahorro de créditos

- **Prompts por toma bajo demanda:** se generan al hacer clic en una toma, o con "Generar todos"
  (pide confirmación si son más de 3). La biblia de consistencia se crea una sola vez, con los
  primeros prompts.
- **Esfuerzo medio** para la biblia y los prompts por toma. El informe usa la profundidad elegida.
- **Caché de instrucciones:** el bloque fijo de cada video (contexto + biblia) se reutiliza entre
  llamadas y se cobra al 10%.
- **Medidor de gasto:** cada análisis muestra su costo en USD a partir del consumo real que devuelve
  la API (informe, biblia, prompts y tokens leídos de caché). También queda en el historial.

## Variables de entorno

| Variable | Obligatoria | Uso |
|---|---|---|
| `ANTHROPIC_API_KEY` | Sí | Clave de la API de Anthropic |
| `APP_PASSWORD` | No | Si la defines, la app pide esta clave para analizar (protege tu saldo) |

## Desarrollo local

```bash
npm install
cp .env.example .env.local   # y completa las variables
npm run dev
```

## Despliegue en Vercel

Importa el repositorio en Vercel, agrega `ANTHROPIC_API_KEY` (y opcionalmente `APP_PASSWORD`) y despliega. La función de análisis usa hasta 300 s.
