#!/usr/bin/env python3
"""Verifica que cada cita textual de una sesión exista palabra por palabra en el cerebro de Hormozi.

Uso: python3 scripts/verificar_citas.py            (sesión activa o la más reciente)
     python3 scripts/verificar_citas.py sessions/<id>
"""
import json, re, sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
CEREBRO = RAIZ / ".claude/skills/auditoria-hormozi/brain"
SESIONES = RAIZ / "sessions"

def norm(s):
    s = s.replace("’", "'").replace("“", '"').replace("”", '"')
    return re.sub(r"\s+", " ", s).strip().lower()

def sesion():
    if len(sys.argv) > 1:
        return Path(sys.argv[1])
    p = SESIONES / ".actual"
    if p.exists() and (SESIONES / p.read_text().strip()).exists():
        return SESIONES / p.read_text().strip()
    dirs = sorted([d for d in SESIONES.iterdir() if d.is_dir()], key=lambda d: d.stat().st_mtime)
    return dirs[-1] if dirs else None

d = sesion()
if not d or not (d / "events.jsonl").exists():
    sys.exit("No encontré una sesión con events.jsonl.")
texto = {f.name: norm(f.read_text(encoding="utf-8")) for f in CEREBRO.glob("*.md")}
fuentes = texto.get("sources.md", "")
ok, malas = 0, []
for linea in (d / "events.jsonl").read_text(encoding="utf-8").splitlines():
    try:
        ev = json.loads(linea)
    except json.JSONDecodeError:
        continue
    q = ev.get("quote")
    if not q:
        continue
    t, sid = norm(q.get("text", "")), q.get("id", "")
    en_cerebro = any(t in v for k, v in texto.items() if k != "sources.md")
    id_valido = bool(re.fullmatch(r"S\d{3}", sid)) and f"| {sid.lower()} |" in fuentes
    if en_cerebro and id_valido:
        ok += 1
    else:
        malas.append((sid, q.get("text", "")[:90], "texto no encontrado" if not en_cerebro else "id de fuente inválido"))
print(f"Citas verificadas: {ok}. Con problemas: {len(malas)}.")
for sid, t, why in malas:
    print(f"  - [{sid}] {t}  ->  {why}")
sys.exit(1 if malas else 0)
