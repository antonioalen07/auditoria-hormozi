#!/usr/bin/env node
// Busca y descarga los logos de los conectores a app/public/logos/.
//
//   node scripts/logos.mjs                    descarga los que falten de scripts/conectores.json
//   node scripts/logos.mjs <slug> <dominio>   uno suelto (ej: node scripts/logos.mjs fathom fathom.video)
//
// Primero prueba Simple Icons (SVG con el color de la marca); si no está, el ícono oficial
// del sitio de la marca (favicon en alta). Nunca pisa un logo que ya esté en la carpeta.
import fs from "node:fs";
import path from "node:path";
import { RAIZ } from "./lib.mjs";

const DIR = path.join(RAIZ, "app", "public", "logos");
const EXT = [".svg", ".png", ".webp"];
const tiene = (slug) => EXT.some((e) => fs.existsSync(path.join(DIR, slug + e)));

async function bajar(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: "follow" });
  if (!r.ok) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  return buf.length > 200 ? { buf, tipo: r.headers.get("content-type") || "" } : null; // los favicons vacíos pesan menos
}

// Devuelve "simpleicons" | "favicon" | "ya estaba" | null
export async function logoDe({ slug, icono, dominio }) {
  if (!slug || tiene(slug)) return slug ? "ya estaba" : null;
  fs.mkdirSync(DIR, { recursive: true });
  try {
    if (icono) {
      const r = await bajar(`https://cdn.simpleicons.org/${encodeURIComponent(icono)}`);
      if (r && r.tipo.includes("svg")) { fs.writeFileSync(path.join(DIR, `${slug}.svg`), r.buf); return "simpleicons"; }
    }
    if (dominio) {
      const r = await bajar(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(dominio)}&sz=128`);
      if (r && r.tipo.includes("png")) { fs.writeFileSync(path.join(DIR, `${slug}.png`), r.buf); return "favicon"; }
    }
  } catch {}
  return null;
}

export async function asegurarLogos(lista) {
  const out = {};
  await Promise.all(lista.map(async (c) => { out[c.slug] = await logoDe(c); }));
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [slug, dominio] = process.argv.slice(2);
  const lista = slug
    ? [{ slug, dominio, icono: slug.replace(/-/g, "") }]
    : JSON.parse(fs.readFileSync(path.join(RAIZ, "scripts", "conectores.json"), "utf8")).conocidos;
  const res = await asegurarLogos(lista);
  for (const [s, r] of Object.entries(res)) console.log(`${r ? "✔" : "✘"} ${s}${r ? ` (${r})` : ": no encontré logo, la sala muestra las iniciales"}`);
}
