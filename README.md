# Auditoría con el método Hormozi

Conectá tus herramientas a Claude y dejá que una IA entrenada con 124 videos de Alex Hormozi audite tu negocio. Lee tus datos reales (Notion, Google Sheets, Meta Ads, GoHighLevel, ManyChat, Supabase, Shopify, Stripe y cualquier conector MCP), hace sus cuentas en vivo (LTV:CAC, caja a 30 días, recompra, descuentos) y te da un veredicto con su forma de hablar. Después le seguís preguntando.

Todo pasa en una sala en tu navegador: los logos de tus herramientas orbitan alrededor del asesor, y cuando lee una, esa se acerca, él la mira y el dato que encontró sale flotando hacia el pizarrón. Le hablás por micrófono o le escribís, y te contesta con voz. Al final aparecen sus 8 reglas con puntaje, el veredicto y el plan de acción.

## Instalación (2 minutos)

Necesitás [Claude Code](https://claude.com/claude-code) y [Node.js](https://nodejs.org) 20 o más nuevo. No hay nada más que instalar.

La forma fácil: abrí Claude Code en cualquier carpeta y escribí:

```
Instalame este repo: https://github.com/antonioalen07/auditoria-hormozi
```

O a mano:

```bash
git clone https://github.com/antonioalen07/auditoria-hormozi.git
cd auditoria-hormozi
npm start            # abre la sala en http://localhost:4740
```

Abrí http://localhost:4740 y tocá **Ver ejemplo** para ver una auditoría completa de una marca de ejemplo.

## Auditar tu negocio

1. Conectá tus herramientas a Claude: en Claude, **Configuración → Conectores**; en Claude Code, `claude mcp add`.
2. Contale qué querés saber, con tus palabras: en la barra de la sala (escribiendo o con el micrófono) o directo en Claude Code. Por ejemplo: "auditame porque quiero saber si puedo subir los precios" o "quiero empezar a invertir en anuncios, ¿cuánto capital me recomendás?". No hay cuestionario: arranca a leer tus herramientas para contestarte.
3. Si le falta un dato imprescindible, te hace una sola pregunta; contestale en la sala. Si te perdiste algo de lo que dijo, tocá **↺ Repetir** (otra vez para ir más atrás).
4. Cuando termine, seguí charlando: "¿y si subo el precio?", "¿qué hago con los anuncios?". Si necesita, vuelve a leer tus herramientas para contestar.

Cada respuesta tarda entre 10 y 30 segundos aproximadamente (más si tiene que leer herramientas). Mientras tanto vas a ver qué está revisando.

**Cómo funciona la charla desde la sala:** el servidor le pasa tu pregunta a Claude Code en modo automático (`claude -p`), en la carpeta del proyecto, con tu misma cuenta, tus conectores y la skill. Retoma la conversación de cada auditoría. El micrófono usa el reconocimiento de voz de Chrome o Edge.

## Solo lectura

El asesor **solo lee** tus herramientas. Además de la regla en la skill, el proyecto trae un hook (`scripts/hook-lectura.mjs`) que revisa cada herramienta de tus conectores antes de usarla:
- Las de lectura (get, list, search, query, insights...) se aprueban solas, para que la auditoría no te pida permiso a cada rato.
- Las que escriben (create, update, delete, send, publish...) se bloquean.
- En bases de datos, solo se permiten consultas SELECT.
- Las que no se pueden clasificar te piden permiso como siempre (y en modo automático, se rechazan).

Además, por las dudas:
- **Tokens de solo lectura.** En GoHighLevel, creá la integración privada solo con permisos de lectura. En tu base de datos, conectala con un usuario de solo lectura, no con `postgres`.
- **La sala solo se habla a sí misma.** Escucha únicamente en tu computadora y rechaza pedidos de otras páginas abiertas en tu navegador, así nadie puede usar tu Claude ni tus créditos de voz desde afuera.
- **Tus claves no se suben.** `.env`, `.mcp.json` y tus auditorías (`sessions/`) están en `.gitignore`. Conectá las herramientas con `claude mcp add -s local`, que guarda los tokens en tu configuración de Claude y no en el proyecto.

## Voz

- **Por defecto:** la voz del navegador (gratis). En la sala elegís entre las voces en español que tenga tu equipo.
- **ElevenLabs (opcional):** copiá `.env.example` a `.env`, poné tu `ELEVENLABS_API_KEY` y, si querés, tu `ELEVENLABS_VOICE_ID`. Reiniciá con `npm start`. El plan gratis de ElevenLabs solo deja usar sus voces predeterminadas por API; las de la biblioteca necesitan un plan pago.

## Qué tiene conectado tu Claude

```bash
node scripts/diagnostico.mjs
```

Te dice qué herramientas del negocio ve la auditoría, cuáles necesitan login y qué falta (CRM, base de datos, cobros, anuncios, llamadas). Cómo conectar cada una, GoHighLevel y Supabase incluidos, está en `CLAUDE.md` → "Conectar herramientas" (o pedile a Claude: "conectame GoHighLevel").

## Logos de tus herramientas

Se descargan solos: la sala busca al arrancar los que falten (Simple Icons o el ícono oficial del sitio de la marca). Para una herramienta nueva, agregala a `scripts/conectores.json` con su `dominio`, o corré `node scripts/logos.mjs <slug> <dominio>`. Si querés otro logo, pegalo en `app/public/logos/` con el mismo nombre y no se pisa.

## Cómo funciona

- **La skill** (`.claude/skills/auditoria-hormozi/SKILL.md`) le dice a Claude qué números buscar, en qué orden y cómo auditarlos.
- **El cerebro** (`brain/`) resume 124 videos de Alex Hormozi (2020 a 2026, unas 1,3 millones de palabras): sus 24 frameworks, sus 8 reglas para decidir, sus posturas y su forma de hablar. Cada cita tiene su fuente en `brain/sources.md`.
- **Un hook de Claude Code** (`scripts/hook-lectura.mjs`) detecta cada vez que Claude usa un conector, se lo avisa a la sala y bloquea todo lo que no sea lectura. Así ves exactamente qué está leyendo.
- **La charla** (`app/claude.mjs`) conecta la sala con Claude Code en modo automático.
- **Las cuentas** las hace `scripts/calcular.mjs`, no la IA de memoria. Las citas se verifican con `scripts/verificar_citas.py`.
- **La sala** (`app/`) es un servidor Node sin dependencias que reproduce lo que pasa en `sessions/`. Cada auditoría queda guardada ahí.

## Créditos y aviso

El asesor es una IA construida a partir del contenido público de Alex Hormozi. No es él, no habla por él y no está afiliado ni respaldado por él ni por Acquisition.com. Las citas textuales son fragmentos breves de sus videos, usados con fines educativos y de comentario, y pertenecen a su autor.

El cerebro y la caricatura original vienen de [Roast Room](https://github.com/nateherkai/roast-room), de AI Automation Society (licencia MIT para el código). El retrato fue modificado.

Código bajo licencia MIT (ver `LICENSE`).
