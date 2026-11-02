#!/usr/bin/env node
// Hook de Claude Code para las herramientas de conectores MCP (mcp__*).
//
// 1. Seguridad: la auditoría es de solo lectura.
//    - Herramientas de lectura (get, list, search, query...) se aprueban solas.
//    - Herramientas que escriben (create, update, delete, send...) se bloquean.
//    - SQL: solo SELECT / WITH / SHOW / EXPLAIN.
//    - Lo que no se puede clasificar queda a la decisión normal de Claude Code (te pregunta).
// 2. Sala: si hay una auditoría activa, avisa qué conector se está leyendo.
//
// Nunca rompe nada: ante cualquier error, sale sin decidir.
import { partirHerramienta, conectorDe, sesionActual, agregarEvento } from "./lib.mjs";

const ESCRIBE = new Set(["create", "update", "delete", "remove", "send", "post", "publish", "insert", "upsert", "patch", "put", "set", "add", "write", "edit", "move", "archive", "cancel", "pause", "resume", "enable", "disable", "duplicate", "upload", "import", "trigger", "charge", "refund", "transfer", "invite", "assign", "merge", "reply", "comment", "schedule", "book", "submit", "approve", "reject", "restore", "rename", "replace", "append", "clear", "reset", "sync", "push", "launch", "start", "stop", "deploy", "drop", "truncate", "alter", "grant", "revoke", "apply", "modify", "change", "mark", "tag", "untag", "subscribe", "unsubscribe", "trash", "empty", "batch", "mutate", "run", "execute", "exec", "call", "invoke"]);
const LEE = new Set(["get", "list", "search", "query", "find", "fetch", "read", "retrieve", "describe", "view", "lookup", "count", "show", "analyze", "analyse", "report", "reports", "insights", "insight", "stats", "statistics", "summarize", "summary", "download", "export", "browse", "inspect", "check", "status", "info", "details", "metrics", "explain", "preview", "select"]);
const SQL_LECTURA = /^\s*(select|with|show|explain|describe|desc)\b/i;
const SQL_ESCRITURA = /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|merge|upsert|copy|commit|rollback|begin|call|do|vacuum|reindex|cluster|lock|notify|listen|prepare|execute|refresh|comment|reassign|security|discard|checkpoint|savepoint|release|import|pg_terminate_backend|pg_cancel_backend|set_config|lo_import|lo_export|dblink\w*)\b/i;
// Una sola sentencia: "SELECT 1; COMMIT; DROP ..." se usa para saltar el modo solo lectura.
const VARIAS_SENTENCIAS = (sql) => /;\s*\S/.test(sql.replace(/'(?:[^']|'')*'/g, "''").replace(/"(?:[^"]|"")*"/g, '""').replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, ""));

const VERBOS = [
  [/search|query|find|lookup|buscar/i, "Buscando"],
  [/list|listar/i, "Listando"],
  [/insight|report|stats|analytics|metric/i, "Leyendo métricas de"],
  [/get|read|fetch|retrieve|download|view|leer|select|sql/i, "Leyendo"],
];
const CLAVES = ["query", "q", "search", "title", "name", "sheet", "range", "spreadsheet", "table", "sql", "date_preset", "time_range", "page", "database", "object", "pipeline", "campaign"];
const SECRETOS = /token|key|secret|password|auth|cookie/i;

const palabras = (tool) => tool.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

function sqlDe(input) {
  if (!input || typeof input !== "object") return null;
  for (const [k, v] of Object.entries(input)) if (/sql|query/i.test(k) && typeof v === "string" && /\b(select|insert|update|delete|with|create|drop|alter)\b/i.test(v)) return v;
  return null;
}

// "allow" | "deny" | null (sin decisión)
function decidir(tool, input) {
  const sql = sqlDe(input);
  if (sql) return SQL_LECTURA.test(sql) && !SQL_ESCRITURA.test(sql) && !VARIAS_SENTENCIAS(sql) ? "allow" : "deny";
  const ps = palabras(tool);
  if (ps.some((p) => ESCRIBE.has(p))) return "deny";
  if (ps.some((p) => LEE.has(p))) return "allow";
  return null;
}

function resumen(input) {
  if (!input || typeof input !== "object") return "";
  const partes = [];
  for (const [k, v] of Object.entries(input)) {
    if (SECRETOS.test(k)) continue;
    if (!CLAVES.some((c) => k.toLowerCase().includes(c))) continue;
    const val = typeof v === "string" ? v : JSON.stringify(v);
    if (val) partes.push(`${k}: ${val.length > 60 ? val.slice(0, 57) + "..." : val}`);
    if (partes.length === 2) break;
  }
  return partes.join(" · ");
}

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  try {
    const h = JSON.parse(raw || "{}");
    const p = partirHerramienta(h.tool_name);
    if (!p) return;
    const c = conectorDe(p.serverRaw);
    if (!c) return; // herramientas que no son del negocio: no se tocan
    const id = sesionActual();

    if (h.hook_event_name === "PostToolUse") {
      if (!id) return;
      const resp = h.tool_response;
      const size = typeof resp === "string" ? resp.length : JSON.stringify(resp ?? "").length;
      agregarEvento(id, { t: "read", source: c.name, slug: c.slug, tool: p.tool, size });
      return;
    }

    const decision = decidir(p.tool, h.tool_input);
    if (decision !== "deny" && id) {
      const verbo = (VERBOS.find(([re]) => re.test(p.tool)) || [null, "Leyendo"])[1];
      agregarEvento(id, { t: "reading", source: c.name, slug: c.slug, category: c.category, tool: p.tool, verb: verbo, what: resumen(h.tool_input) });
    }
    if (decision) {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: decision,
          permissionDecisionReason: decision === "allow"
            ? `Lectura de ${c.name} aprobada por la auditoría (solo lectura).`
            : `La auditoría es de solo lectura: "${p.tool}" de ${c.name} podría modificar datos, así que se bloqueó. Si el dueño quiere hacer este cambio, que lo haga fuera de la auditoría.`,
        },
      }));
    }
  } catch {
    // silencio: el hook nunca interrumpe a Claude
  }
});
