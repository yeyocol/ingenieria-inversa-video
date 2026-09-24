# Ingeniería Inversa de Video

App web para hacer ingeniería inversa de cualquier video: sube el archivo y obtén un análisis profundo para **replicarlo al máximo**.

## Qué hace

1. **Análisis técnico en tu navegador** (el video no se sube completo):
   - Metadatos: duración, resolución, relación de aspecto, orientación.
   - Detección de cortes y tomas, cortes por minuto, duración de cada toma.
   - Brillo, saturación y nivel de movimiento por toma.
   - Paleta de color dominante (HEX).
   - Audio: energía por segundo, % de silencio, BPM estimado, picos.
   - Hasta 30 fotogramas clave (gancho + uno por toma + cobertura).
2. **Análisis con IA (Claude)** que cruza fotogramas y métricas y entrega:
   radiografía, ficha técnica, gancho (0–3 s), estructura narrativa, shot list,
   dirección de arte, tipografía, edición y ritmo, audio, psicología,
   guion reconstruido, plan de réplica paso a paso, prompts de IA por toma
   (Veo, Kling, Seedance, Runway, Sora), checklist de fidelidad y mejoras.
3. Exporta el informe en Markdown.

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
