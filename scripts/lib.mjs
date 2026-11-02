// Funciones compartidas por los scripts y el servidor.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SESIONES = path.join(RAIZ, "sessions");
export const PUNTERO = path.join(SESIONES, ".actual");
const MAPA = JSON.parse(fs.readFileSync(path.join(RAIZ, "scripts", "conectores.json"), "utf8"));

const limpio = (s) => String(s || "").toLowerCase().replace(/^claude_ai_/, "").replace(/[_\-.]+/g, " ").trim();

// "mcp__claude_ai_Notion__notion-search" -> { server: "claude ai notion"…, tool: "notion-search" }
export function partirHerramienta(toolName) {
  const m = /^mcp__(.+?)__(.+)$/.exec(String(toolName || ""));
  if (!m) return null;
  return { serverRaw: m[1], server: limpio(m[1]), tool: m[2] };
}

// Devuelve { name, slug, category } o null si el conector se ignora.
export function conectorDe(serverRaw) {
  const s = limpio(serverRaw);
  if (MAPA.ignorar.some((x) => s.includes(limpio(x)))) return null;
  for (const c of MAPA.conocidos) if (c.match.some((k) => s.includes(limpio(k)))) return { name: c.name, slug: c.slug, category: c.category };
  const name = s.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") || "Herramienta";
  return { name, slug: s.replace(/\s+/g, "-"), category: "Otra herramienta" };
}

export function sesionActual(maxHoras = 4) {
  try {
    const st = fs.statSync(PUNTERO);
    if (Date.now() - st.mtimeMs > maxHoras * 3600e3) return null;
    const id = fs.readFileSync(PUNTERO, "utf8").trim();
    return id && fs.existsSync(path.join(SESIONES, id)) ? id : null;
  } catch { return null; }
}

export function agregarEvento(id, ev) {
  const archivo = path.join(SESIONES, id, "events.jsonl");
  const linea = JSON.stringify({ ...ev, at: Date.now() });
  fs.appendFileSync(archivo, linea + "\n");
  try { fs.utimesSync(PUNTERO, new Date(), new Date()); } catch {}
}

export function leerEventos(id) {
  const archivo = path.join(SESIONES, id, "events.jsonl");
  if (!fs.existsSync(archivo)) return [];
  return fs.readFileSync(archivo, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}
