// Le pasa a Claude Code lo que el dueño escribe o dice en la sala.
// Corre `claude -p` (modo automático) en la carpeta del proyecto, con la misma cuenta,
// los mismos conectores y la skill. Retoma la conversación de cada auditoría.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { RAIZ, SESIONES, sesionActual, agregarEvento } from "../scripts/lib.mjs";

const BIN = process.env.CLAUDE_BIN || "claude";
const LIMITE_MS = Number(process.env.CLAUDE_TIMEOUT_MS || 10 * 60 * 1000);
const PERMITIDAS = [
  "Bash(node scripts/evento.mjs:*)",
  "Bash(node scripts/calcular.mjs:*)",
  "Bash(python3 scripts/verificar_citas.py:*)",
  "Bash(python scripts/verificar_citas.py:*)",
  "Read", "Grep", "Glob",
];

let disponible = null;
export function claudeDisponible() {
  if (disponible === null) {
    try { disponible = spawnSync(BIN, ["--version"], { timeout: 15000, shell: process.platform === "win32" }).status === 0; }
    catch { disponible = false; }
  }
  return disponible;
}

let ocupado = null; // { desde, texto }
export const estadoClaude = () => ({ disponible: claudeDisponible(), ocupado: Boolean(ocupado), desde: ocupado?.desde || null });

const archivoConversacion = (id) => path.join(SESIONES, id, "claude.json");
function conversacionDe(id) {
  try { return JSON.parse(fs.readFileSync(archivoConversacion(id), "utf8")).session_id || null; } catch { return null; }
}

function instrucciones({ nueva, texto, id }) {
  const base = [
    "MODO SALA. El dueño te habla desde la sala del navegador, no desde esta terminal: nadie lee tu texto final.",
    "Todo lo que le quieras decir va como eventos `say` (node scripts/evento.mjs), en voz de Hormozi, como indica la skill auditoria-hormozi.",
    "Si necesitás preguntarle algo, hacelo con un `say` de topic \"Pregunta\" y terminá tu turno: su respuesta te llega en el próximo mensaje.",
    "No arranques la sala (ya está corriendo). Con los conectores, solo lectura.",
    process.env.NOMBRE_DUENO ? `El dueño se llama ${process.env.NOMBRE_DUENO}: llamalo por su nombre como indica la skill.` : "",
  ].filter(Boolean);
  if (nueva) {
    return [...base,
      "El dueño arrancó una auditoría desde la sala contando qué quiere saber. Seguí la skill auditoria-hormozi desde el Paso 1.",
      "Su mensaje es el brief (Paso 3): no le hagas el cuestionario. Solo si falta algo imprescindible para contestarle, hacé una única pregunta.",
      "Elegí qué leer según su pregunta (tabla \"Según la pregunta\" del Paso 4) y que la auditoría termine contestándola con sus números.",
      texto ? `Lo que quiere saber, con sus palabras: ${texto}` : "",
    ].filter(Boolean).join("\n");
  }
  return [...base,
    `La pregunta del dueño ya quedó registrada en la sala (evento question). No la registres de nuevo.`,
    id ? `Contexto de la auditoría: sessions/${id}/events.jsonl (hallazgos, números y lo que ya dijiste). Leelo si no lo tenés presente.` : "",
    "Respondé siguiendo el Paso 8 de la skill: leé lo que haga falta de sus herramientas y contestá con 1 a 3 eventos `say` cortos, con `metric` si aparece un número nuevo.",
    "",
    `Pregunta del dueño: ${texto}`,
  ].filter(Boolean).join("\n");
}

// Devuelve enseguida; el trabajo sigue en segundo plano y la sala lo ve por los eventos.
export function preguntar({ texto = "", nueva = false }) {
  if (!claudeDisponible()) return { ok: false, error: "No encontré Claude Code en esta computadora. Instalalo o escribí tu pregunta directamente en Claude Code." };
  if (ocupado) return { ok: false, error: "El asesor todavía está respondiendo. Esperá un momento." };
  const id = nueva ? null : sesionActual(48);
  if (!nueva && !id) return { ok: false, error: "No hay una auditoría activa. Contale en la barra qué querés saber para empezar." };

  if (id) {
    agregarEvento(id, { t: "question", text: texto });
    agregarEvento(id, { t: "thinking", text: "Pensando la respuesta" });
  }
  const args = ["-p", instrucciones({ nueva, texto, id }), "--output-format", "json", "--allowedTools", ...PERMITIDAS];
  const previa = id && conversacionDe(id);
  if (previa) args.push("--resume", previa);

  ocupado = { desde: Date.now(), texto };
  const proc = spawn(BIN, args, { cwd: RAIZ, env: { ...process.env, AUDITORIA_SALA: "1" }, shell: process.platform === "win32" });
  let salida = "", errores = "";
  proc.stdout.on("data", (c) => (salida += c));
  proc.stderr.on("data", (c) => (errores += c));
  const corte = setTimeout(() => proc.kill("SIGTERM"), LIMITE_MS);
  proc.on("error", (e) => { errores += String(e.message || e); });
  proc.on("close", (code) => {
    clearTimeout(corte);
    ocupado = null;
    const sesion = sesionActual(48) || id;
    try {
      const j = JSON.parse(salida.trim().split("\n").filter(Boolean).at(-1) || "{}");
      if (sesion && j.session_id) fs.writeFileSync(archivoConversacion(sesion), JSON.stringify({ session_id: j.session_id, actualizado: Date.now() }));
      if (j.is_error && sesion) agregarEvento(sesion, { t: "thinking", text: "No pude terminar la respuesta. Probá de nuevo o preguntá en Claude Code" });
    } catch {
      if (sesion) agregarEvento(sesion, { t: "thinking", text: "No pude terminar la respuesta. Probá de nuevo o preguntá en Claude Code" });
    }
    if (code !== 0) console.error(`Claude Code terminó con código ${code}. ${errores.slice(0, 400)}`);
  });
  return { ok: true, sesion: id };
}
