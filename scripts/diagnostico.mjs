#!/usr/bin/env node
// Diagnóstico de conectores: qué herramientas del negocio ve Claude Code en esta carpeta
// (que es lo que usa la sala con `claude -p`) y cuáles faltan conectar.
//
//   node scripts/diagnostico.mjs
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { RAIZ, conectorDe } from "./lib.mjs";
import { asegurarLogos } from "./logos.mjs";

const BIN = process.env.CLAUDE_BIN || "claude";
const r = spawnSync(BIN, ["mcp", "list"], { cwd: RAIZ, encoding: "utf8", timeout: 180000, shell: process.platform === "win32" });
if (r.status !== 0 && !r.stdout) {
  console.error("No pude correr `claude mcp list`. ¿Está instalado Claude Code y logueado?");
  process.exit(1);
}

const MAPA = JSON.parse(fs.readFileSync(path.join(RAIZ, "scripts", "conectores.json"), "utf8"));
const conectados = [], sinAuth = [];
for (const linea of r.stdout.split("\n")) {
  const m = /^(.+?):\s.*-\s(✔|!|✘|-)\s*(.*)$/.exec(linea.trim());
  if (!m) continue;
  // Los plugins repiten conectores sin configurar; solo cuentan si están conectados.
  if (m[1].startsWith("plugin:") && m[2] !== "✔") continue;
  const c = conectorDe(m[1].replace(/^claude\.ai\s+/i, "").replace(/^plugin:[^:]+:/, ""));
  if (!c) continue;
  (m[2] === "✔" ? conectados : sinAuth).push({ ...c, servidor: m[1], estado: m[3] });
}

const cats = new Set(conectados.map((c) => c.category));
const CLAVE = [
  ["CRM", "leads, tasa de cierre, oportunidades (GoHighLevel, HubSpot…)"],
  ["Base de datos", "ventas y clientes del software operativo (Supabase, Postgres…)"],
  ["Cobros", "ingresos reales (Stripe, Mercado Pago…)"],
  ["Anuncios", "inversión y clientes nuevos (Meta Ads, Google Ads…)"],
  ["Llamadas", "resúmenes de llamadas (Fireflies, Fathom, tl;dv…)"],
];

console.log("\nConectores del negocio que ve la auditoría:");
for (const c of conectados) console.log(`  ✔ ${c.name.padEnd(18)} ${c.category}   (${c.servidor})`);
if (!conectados.length) console.log("  (ninguno)");
if (sinAuth.length) {
  console.log("\nAgregados pero sin autenticar (correr /mcp en Claude Code y loguearse):");
  for (const c of sinAuth) console.log(`  ! ${c.name.padEnd(18)} ${c.estado}`);
}
const faltan = CLAVE.filter(([cat]) => !cats.has(cat));
if (faltan.length) {
  console.log("\nLe falta para una auditoría completa:");
  for (const [cat, para] of faltan) console.log(`  - ${cat}: ${para}`);
}
await asegurarLogos(conectados);
console.log("");
