// La sala: sirve la página y le pasa los eventos de sessions/. Sin dependencias.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { RAIZ, SESIONES, sesionActual, leerEventos } from "../scripts/lib.mjs";
import { preguntar, estadoClaude } from "./claude.mjs";
import { asegurarLogos } from "../scripts/logos.mjs";

// .env mínimo
try {
  for (const l of fs.readFileSync(path.join(RAIZ, ".env"), "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(l);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}
const PORT = Number(process.env.PORT || 4740);
const EL_KEY = process.env.ELEVENLABS_API_KEY || "";
const EL_VOZ_GRATIS = "TX3LPaxmHKxFdv7VOQHJ"; // Liam: predeterminada, anda en el plan gratis
let EL_VOICE = process.env.ELEVENLABS_VOICE_ID || EL_VOZ_GRATIS;
const EL_MODEL = process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2";
const PUBLIC = path.join(RAIZ, "app", "public");
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".md": "text/plain; charset=utf-8" };

const enviar = (res, code, body) => { res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(body)); };

function listarSesiones() {
  if (!fs.existsSync(SESIONES)) return [];
  return fs.readdirSync(SESIONES, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => {
    const ev = leerEventos(d.name);
    const s = [...ev].reverse().find((e) => e.t === "session") || {};
    return { id: d.name, title: s.title || d.name, events: ev.length, done: ev.some((e) => e.t === "done"), ejemplo: d.name.startsWith("ejemplo") };
  }).sort((a, b) => (a.ejemplo - b.ejemplo) || (a.id < b.id ? 1 : -1));
}

const pendientes = new Map();
async function tts(texto, sesion) {
  const hash = crypto.createHash("sha1").update(`${EL_VOICE}|${EL_MODEL}|${texto}`).digest("hex").slice(0, 16);
  const dir = path.join(SESIONES, sesion && fs.existsSync(path.join(SESIONES, sesion)) ? sesion : ".cache", "audio");
  const archivo = path.join(dir, `${hash}.json`);
  if (fs.existsSync(archivo)) return JSON.parse(fs.readFileSync(archivo, "utf8"));
  if (pendientes.has(archivo)) return pendientes.get(archivo);
  const p = (async () => {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${EL_VOICE}/with-timestamps?output_format=mp3_44100_64`, {
      method: "POST",
      headers: { "xi-api-key": EL_KEY, "content-type": "application/json" },
      body: JSON.stringify({ text: texto, model_id: EL_MODEL, voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true } }),
    });
    if (!r.ok) {
      const detalle = (await r.text()).slice(0, 200);
      // Voz de la biblioteca con plan gratis: seguimos con la predeterminada en vez de quedarnos mudos.
      if (r.status === 402 && EL_VOICE !== EL_VOZ_GRATIS) {
        console.error(`La voz ${EL_VOICE} necesita un plan pago de ElevenLabs. Sigo con la voz predeterminada (Liam).`);
        EL_VOICE = EL_VOZ_GRATIS;
        pendientes.delete(archivo);
        return tts(texto, sesion);
      }
      throw new Error(`ElevenLabs ${r.status}: ${detalle}`);
    }
    const j = await r.json();
    const out = { audio: j.audio_base64, align: { characters: j.alignment.characters, starts: j.alignment.character_start_times_seconds } };
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(archivo, JSON.stringify(out));
    return out;
  })();
  pendientes.set(archivo, p);
  try { return await p; } finally { pendientes.delete(archivo); }
}

let avisoTts = false;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const p = url.pathname;
  try {
    if (p === "/api/estado") {
      const logos = fs.readdirSync(path.join(PUBLIC, "logos")).filter((f) => /\.(svg|png|webp)$/i.test(f));
      return enviar(res, 200, { actual: sesionActual(), sesiones: listarSesiones(), voz: EL_KEY ? "elevenlabs" : "navegador", logos, claude: estadoClaude() });
    }
    if (p === "/api/eventos") {
      const id = url.searchParams.get("s") || "";
      if (!/^[\w.-]+$/.test(id) || !fs.existsSync(path.join(SESIONES, id))) return enviar(res, 404, { error: "No existe esa sesión." });
      const desde = Number(url.searchParams.get("desde") || 0);
      const ev = leerEventos(id);
      return enviar(res, 200, { eventos: ev.slice(desde), total: ev.length });
    }
    if (p === "/api/preguntar" && req.method === "POST") {
      let raw = ""; for await (const c of req) { raw += c; if (raw.length > 8000) throw new Error("Mensaje demasiado largo."); }
      const { texto = "", nueva = false } = JSON.parse(raw || "{}");
      if (!nueva && !String(texto).trim()) return enviar(res, 400, { error: "Escribí una pregunta." });
      const r = preguntar({ texto: String(texto).trim().slice(0, 2000), nueva: Boolean(nueva) });
      return enviar(res, r.ok ? 200 : 409, r);
    }
    if (p === "/api/voz" && req.method === "POST") {
      if (!EL_KEY) return enviar(res, 204, {});
      let raw = ""; for await (const c of req) { raw += c; if (raw.length > 20000) throw new Error("Texto demasiado largo."); }
      const { texto, sesion } = JSON.parse(raw || "{}");
      if (!texto) return enviar(res, 400, { error: "Falta el texto." });
      try { return enviar(res, 200, await tts(String(texto).slice(0, 2500), sesion)); }
      catch (e) {
        if (!avisoTts) { console.error("No se pudo usar ElevenLabs, sigo con la voz del navegador:", e.message); avisoTts = true; }
        return enviar(res, 204, {});
      }
    }
    // archivos estáticos
    const archivo = path.normalize(path.join(PUBLIC, p === "/" ? "index.html" : decodeURIComponent(p)));
    if (!archivo.startsWith(PUBLIC) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) { res.writeHead(404); return res.end("No encontrado"); }
    res.writeHead(200, { "content-type": TIPOS[path.extname(archivo)] || "application/octet-stream", "cache-control": "no-store" });
    fs.createReadStream(archivo).pipe(res);
  } catch (e) {
    enviar(res, 500, { error: String(e.message || e) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Sala de auditoría en http://localhost:${PORT}  (voz: ${EL_KEY ? "ElevenLabs" : "del navegador"})`);
  // Logos que falten: se buscan en segundo plano, la sala no espera.
  try { asegurarLogos(JSON.parse(fs.readFileSync(path.join(RAIZ, "scripts", "conectores.json"), "utf8")).conocidos).catch(() => {}); } catch {}
});
