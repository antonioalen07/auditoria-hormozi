# Auditoría con el método Hormozi

Este proyecto audita un negocio con el método de Alex Hormozi: lee las herramientas que el dueño tiene conectadas a Claude (Notion, Google Sheets, Meta Ads, GoHighLevel, ManyChat, Supabase y otras vía MCP), hace sus cuentas y da un veredicto con su voz. Una sala local en el navegador muestra todo en vivo: qué herramienta está leyendo, los números en un pizarrón y el veredicto final.

## Cuando el usuario pida instalarlo ("instalame este repo", "configurá esto")

1. Verificá Node 20 o más nuevo (`node -v`). Si no está, indicá cómo instalarlo desde https://nodejs.org y pará.
2. No hay dependencias que instalar. Arrancá la sala en segundo plano con `npm start` y decile que abra http://localhost:4740.
3. Mostrale en la sala el ejemplo ya incluido: botón "Ver ejemplo". Para auditar su negocio, que escriba o diga en la barra de la sala lo que quiere saber ("¿puedo subir los precios?") y el asesor arranca; después sigue charlando por texto o micrófono (la sala usa Claude Code en modo automático con `claude -p`).
4. Corré `node scripts/diagnostico.mjs`. Muestra qué conectores del negocio ve Claude Code **en esta carpeta** (que es lo que usa la sala), cuáles necesitan login y qué categorías faltan. Descarga solo los logos de los que encuentre. Decíselo al dueño en una lista corta.
5. Ayudalo a conectar lo que falte, de a uno, con la sección "Conectar herramientas" de abajo. Después de cada uno, volvé a correr el diagnóstico.
6. Voz: por defecto usa la del navegador. Si quiere la de ElevenLabs, que copie `.env.example` a `.env`, ponga su `ELEVENLABS_API_KEY` y reinicie la sala. Ojo: con el plan gratis, las voces de la biblioteca no andan por API; la sala detecta el error y sigue con la voz predeterminada (Liam).
7. Ofrecé arrancar: "¿Qué querés saber de tu negocio? Por ejemplo, si podés subir los precios o cuánto invertir en anuncios."

## Conectar herramientas

La auditoría vale lo que valen los datos que lee. Lo mínimo para un veredicto con números reales: **ingresos** (cobros, base de datos o planilla), **CRM** (leads y cierres) y, si invierte en publicidad, **anuncios**.

- **Conectores de Claude (Notion, Google Drive, Gmail, Google Calendar y los que ofrezca claude.ai):** en claude.ai → Configuración → Conectores. Aparecen solos en Claude Code si está logueado con la misma cuenta.
- **GoHighLevel (MCP oficial):** en GHL, Configuración → Integraciones privadas → crear una con permisos de **solo lectura** (contactos, conversaciones, oportunidades, calendarios, pagos). Con el token (`pit-…`) y el ID de la subcuenta, que el **dueño** corra en esta carpeta:
  `claude mcp add --transport http -s local gohighlevel https://services.leadconnectorhq.com/mcp/ --header "Authorization: Bearer <TOKEN>" --header "locationId: <ID_SUBCUENTA>"`
  `-s local` lo deja solo para este proyecto y fuera de los archivos del repo. No escribas el token vos: pedile que lo pegue él en su terminal.
- **Supabase u otra base del software del negocio:** `claude mcp add --transport http -s local supabase "https://mcp.supabase.com/mcp?project_ref=<REF>&read_only=true"` y después `/mcp` en Claude Code para loguearse. `read_only=true` es obligatorio. Si se conecta directo por Postgres (`npx -y @modelcontextprotocol/server-postgres <URL>`), que la URL use un usuario de **solo lectura** (`CREATE ROLE auditoria LOGIN PASSWORD '…'; GRANT pg_read_all_data TO auditoria;`), nunca `postgres`.
- **Resúmenes de llamadas:** si usa Fireflies, `claude mcp add --transport http -s local fireflies https://api.fireflies.ai/mcp` y `/mcp`. Si los resúmenes le llegan por mail o quedan en Drive (Fathom, Gemini, tl;dv), ya se leen por Gmail o Drive: anotá dónde están.
- **Cualquier otro MCP:** si no está en `scripts/conectores.json`, agregalo con `name`, `slug`, `category` y `dominio`, y corré `node scripts/logos.mjs <slug> <dominio>` para bajar su logo.

Para comprobar que un conector anda, hacé una lectura chica con él (por ejemplo, listar 5 contactos) antes de la auditoría.

## Cuando pida una auditoría o quiera charlar con el asesor

Usá la skill `auditoria-hormozi` (`.claude/skills/auditoria-hormozi/SKILL.md`) y seguila al pie de la letra. Las reglas clave:
- Con los conectores del negocio, solo lectura. Nunca escribir, enviar, borrar ni cambiar nada. El hook `scripts/hook-lectura.mjs` aprueba las lecturas y bloquea las escrituras.
- Si el mensaje empieza con "MODO SALA", seguí la sección "Modo sala" de la skill: todo lo que le digas al dueño va como eventos `say`.
- Ningún número inventado. Las cuentas, con `node scripts/calcular.mjs`.
- Citas de Hormozi solo textuales del cerebro, verificadas con `python3 scripts/verificar_citas.py`.
- El asesor es una IA construida con el contenido público de Hormozi, no él. Si alguien pregunta, se dice.

## Estructura

- `.claude/skills/auditoria-hormozi/`: la skill y el cerebro de Hormozi (`brain/`).
- `scripts/`: eventos para la sala, hook que detecta lecturas de conectores, calculadora, verificador de citas, mapa de conectores.
- `app/`: la sala (servidor Node sin dependencias + página). `app/claude.mjs` le pasa a Claude Code lo que el dueño pregunta desde la sala.
- `sessions/`: cada auditoría queda guardada acá. `sessions/ejemplo-nordica-home` es el ejemplo.
