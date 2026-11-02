#!/usr/bin/env node
// Registra lo que pasa en la auditoría para que la sala lo muestre en vivo.
//
//   node scripts/evento.mjs --nueva "Título de la auditoría"   crea una sesión y la deja activa
//   node scripts/evento.mjs '{"t":"say","topic":"...","text":"..."}'   agrega un evento
//   node scripts/evento.mjs --archivo ruta/a/eventos.json       agrega varios (un array JSON)
//   node scripts/evento.mjs --cerrar                             termina la sesión activa
import fs from "node:fs";
import path from "node:path";
import { SESIONES, PUNTERO, sesionActual, agregarEvento, conectorDe } from "./lib.mjs";
import { logoDe } from "./logos.mjs";

const TIPOS = {
  session: ["title"],
  connectors: ["items"],
  found: ["source", "text"],
  thinking: ["text"],
  say: ["text"],
  rules: ["rules"],
  verdict: ["label", "headline"],
  question: ["text"],
  reading: ["source"],
  read: ["source"],
  done: [],
};

function validar(ev) {
  if (!ev || typeof ev !== "object") throw new Error("El evento tiene que ser un objeto JSON.");
  const req = TIPOS[ev.t];
  if (!req) throw new Error(`Tipo de evento desconocido: "${ev.t}". Usá uno de: ${Object.keys(TIPOS).join(", ")}.`);
  for (const k of req) if (ev[k] === undefined || ev[k] === "") throw new Error(`Al evento "${ev.t}" le falta "${k}".`);
  if (ev.t === "connectors") {
    ev.items = ev.items.map((c) => {
      const base = c.slug ? {} : conectorDe(c.server || c.name) || {};
      return { name: c.name || base.name, slug: c.slug || base.slug, category: c.category || base.category || "Otra herramienta", tools: c.tools || [], dominio: c.dominio };
    });
  }
  if (ev.t === "rules" && (!Array.isArray(ev.rules) || ev.rules.length !== 8)) throw new Error('"rules" tiene que traer exactamente 8 reglas.');
  return ev;
}

const slug = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "auditoria";
const args = process.argv.slice(2);

try {
  if (args[0] === "--nueva") {
    const titulo = args[1] || "Auditoría";
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const id = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}-${slug(titulo)}`;
    fs.mkdirSync(path.join(SESIONES, id), { recursive: true });
    fs.writeFileSync(PUNTERO, id);
    agregarEvento(id, { t: "session", title: titulo });
    console.log(`Sesión activa: sessions/${id}`);
  } else if (args[0] === "--cerrar") {
    const id = sesionActual(48);
    if (id) agregarEvento(id, { t: "done" });
    try { fs.unlinkSync(PUNTERO); } catch {}
    console.log(id ? `Sesión cerrada: sessions/${id}` : "No había sesión activa.");
  } else {
    const id = sesionActual(48);
    if (!id) throw new Error('No hay sesión activa. Creala con: node scripts/evento.mjs --nueva "Título"');
    const lista = args[0] === "--archivo" ? JSON.parse(fs.readFileSync(args[1], "utf8")) : [JSON.parse(args.join(" "))];
    for (const ev of (Array.isArray(lista) ? lista : [lista])) {
      validar(ev);
      // Conector sin logo: si Claude pasó su dominio, se busca y se descarga antes de mostrarlo.
      if (ev.t === "connectors") await Promise.all(ev.items.map((c) => c.dominio && logoDe({ slug: c.slug, dominio: c.dominio, icono: c.slug.replace(/-/g, "") })));
      agregarEvento(id, ev);
    }
    console.log(`OK: ${Array.isArray(lista) ? lista.length : 1} evento(s) en sessions/${id}`);
  }
} catch (e) {
  console.error("Error:", e.message);
  process.exit(1);
}
