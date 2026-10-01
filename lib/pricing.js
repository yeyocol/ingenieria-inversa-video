// Precios por millón de tokens (USD) para estimar el gasto con el consumo real que devuelve la API.
// Escritura en caché (5 min) = 1.25× la entrada; lectura de caché = 0.1× la entrada.
const PRICES = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-fable-5-1": { input: 10, output: 50 },
};

function priceFor(model) {
  if (!model) return PRICES["claude-opus-5"];
  const key = Object.keys(PRICES).find((k) => model === k || model.startsWith(`${k}-`));
  return PRICES[key] || PRICES["claude-opus-5"];
}

function costOf(model, u) {
  if (!u) return 0;
  const p = priceFor(model);
  return (
    ((u.input_tokens || 0) * p.input +
      (u.cache_creation_input_tokens || 0) * p.input * 1.25 +
      (u.cache_read_input_tokens || 0) * p.input * 0.1 +
      (u.output_tokens || 0) * p.output) /
    1e6
  );
}

// Costo de una llamada. Si hubo respaldo a otro modelo, cada tramo se cobra a su propio precio.
export function callCost(call) {
  if (!call?.usage) return 0;
  const its = call.usage.iterations;
  if (Array.isArray(its) && its.length && its.every((it) => it.model && typeof it.output_tokens === "number")) {
    return its.reduce((s, it) => s + costOf(it.model, it), 0);
  }
  return costOf(call.model, call.usage);
}

export function usageSummary(usage) {
  const report = callCost(usage?.report);
  const bible = callCost(usage?.bible);
  const shotCalls = usage?.shots || [];
  const shots = shotCalls.reduce((s, c) => s + callCost(c), 0);
  const shotCount = shotCalls.reduce((s, c) => s + (c.shots?.length || 0), 0);
  const cacheRead = shotCalls.reduce((s, c) => s + (c.usage?.cache_read_input_tokens || 0), 0);
  return { report, bible, shots, shotCount, cacheRead, total: report + bible + shots };
}

export function fmtUsd(n) {
  if (!n) return "$0.00";
  return n < 0.01 ? "<$0.01" : `$${n.toFixed(2)}`;
}
