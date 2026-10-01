// Historial de análisis en el navegador (IndexedDB). Nada sale del equipo del usuario.

import { usageSummary } from "./pricing";

const DB_NAME = "ingenieria-inversa-video";
const DB_VERSION = 1;
export const PROJECT_APP = "ingenieria-inversa-video";
export const PROJECT_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("analyses")) db.createObjectStore("analyses", { keyPath: "id" });
      if (!db.objectStoreNames.contains("summaries")) db.createObjectStore("summaries", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, stores, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    const result = fn(t);
    t.oncomplete = () => resolve(result?.result ?? result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export function summarize(record) {
  const d = record.data;
  const firstShot = d?.scenes?.[0]?.index;
  const frames = d?.shotFrames?.[firstShot] || [];
  const thumb = (frames.find((f) => f.role === "medio") || frames[0] || d?.frames?.[0])?.dataUrl || null;
  return {
    id: record.id,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    fileName: d?.meta?.fileName || "video",
    duration: d?.meta?.duration || 0,
    shots: d?.scenes?.length || 0,
    promptsReady: Object.keys(record.shotPrompts || {}).length,
    hasReport: Boolean(record.report),
    costUsd: usageSummary(record.usage).total,
    thumb,
  };
}

export async function saveAnalysis(record) {
  const db = await openDb();
  const rec = { ...record, updatedAt: Date.now() };
  await tx(db, ["analyses", "summaries"], "readwrite", (t) => {
    t.objectStore("analyses").put(rec);
    t.objectStore("summaries").put(summarize(rec));
  });
  db.close();
}

export async function listAnalyses() {
  const db = await openDb();
  const all = await tx(db, ["summaries"], "readonly", (t) => t.objectStore("summaries").getAll());
  db.close();
  return (all || []).sort((a, b) => b.createdAt - a.createdAt);
}

export async function getAnalysis(id) {
  const db = await openDb();
  const rec = await tx(db, ["analyses"], "readonly", (t) => t.objectStore("analyses").get(id));
  db.close();
  return rec;
}

export async function deleteAnalysis(id) {
  const db = await openDb();
  await tx(db, ["analyses", "summaries"], "readwrite", (t) => {
    t.objectStore("analyses").delete(id);
    t.objectStore("summaries").delete(id);
  });
  db.close();
}

export function toProjectFile(record) {
  return JSON.stringify({ app: PROJECT_APP, version: PROJECT_VERSION, ...record });
}

export function fromProjectFile(text) {
  const obj = JSON.parse(text);
  if (obj?.app !== PROJECT_APP || !obj.data?.meta || !Array.isArray(obj.data?.scenes)) {
    throw new Error("Este archivo no es un proyecto de Ingeniería Inversa de Video.");
  }
  const { app, version, ...record } = obj;
  return record;
}
