// La sala reproduce, en orden, los eventos de una sesión (sessions/<id>/events.jsonl).
// En vivo los va pidiendo al servidor; en una sesión guardada los reproduce de corrido.
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tone = (s) => (s <= 3 ? "var(--bad)" : s <= 6 ? "var(--warn)" : "var(--good)");

const st = {
  modoVoz: "navegador", sesion: null, vivo: false, desde: 0, cola: [], corriendo: false,
  run: 0, pausa: false, saltar: false, mudo: false, fuentes: new Map(), vistas: new Set(), logos: new Set(), dichas: [], actualSay: -1, esRepeticion: false, nueva: false,
};

// ---------- logos: logos/<slug>.svg, después .png, si no hay, iniciales
function iniciales(nombre) { return String(nombre || "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase(); }
function logo(slug, nombre, chico = false) {
  const el = document.createElement("span");
  el.className = "logo" + (chico ? " sm" : "");
  const archivo = [`${slug}.svg`, `${slug}.png`, `${slug}.webp`].find((f) => st.logos.has(f));
  if (!archivo) { el.textContent = iniciales(nombre); el.classList.add("ini"); return el; }
  const img = new Image();
  img.alt = "";
  img.onerror = () => { el.textContent = iniciales(nombre); el.classList.add("ini"); img.remove(); };
  img.src = `logos/${archivo}`;
  el.append(img);
  return el;
}

// ---------- herramientas
function fuente(nombre, slug, categoria) {
  const key = (slug || nombre || "").toLowerCase();
  if (st.fuentes.has(key)) return st.fuentes.get(key);
  $("#fuentes .empty")?.remove();
  const li = document.createElement("li");
  li.className = "src";
  li.append(logo(slug || key, nombre));
  li.insertAdjacentHTML("beforeend", `<span class="meta"><b>${esc(nombre)}</b><small>${esc(categoria || "")}</small></span><span class="count">0</span>`);
  $("#fuentes").append(li);
  const f = { li, n: 0, nombre, slug: slug || key };
  const b = document.createElement("span");
  b.className = "burbuja";
  const lg = logo(slug || key, nombre);
  if (lg.classList.contains("ini")) b.classList.add("ini");
  b.append(lg);
  b.title = nombre;
  $("#orbita").append(b);
  f.burbuja = { el: b, x: null, y: null, s: 0.4 };
  st.fuentes.set(key, f);
  return f;
}
function buscarFuente(nombre) {
  const k = String(nombre || "").toLowerCase();
  for (const f of st.fuentes.values()) if (f.nombre.toLowerCase() === k || f.slug === k) return f;
  return null;
}
function marcarLeyendo(f) {
  document.querySelectorAll("#fuentes li.src").forEach((li) => li.classList.toggle("leyendo", li === f?.li));
  st.activa = f || null;
  for (const x of st.fuentes.values()) x.burbuja.el.classList.toggle("activa", x === f);
  $("#giro").style.setProperty("--giro", f ? "3.5deg" : "0deg");   // mira hacia la herramienta
  $("#haz").classList.toggle("on", Boolean(f));
}

// ---------- órbita: las herramientas giran alrededor del asesor; la que lee se acerca a su cara
function orbitar(t) {
  const desk = $("#desk"), w = desk.clientWidth, h = desk.clientHeight;
  const lista = [...st.fuentes.values()];
  const n = lista.length || 1;
  const quieto = matchMedia("(prefers-reduced-motion: reduce)").matches;
  lista.forEach((f, i) => {
    const b = f.burbuja;
    let tx, ty, ts;
    if (f === st.activa) { tx = w * 1.04; ty = h * 0.24; ts = 1.6; }
    else {
      const a = (i / n) * Math.PI * 2 + (quieto ? 0 : t * 0.00011);
      tx = w * 0.5 + Math.cos(a) * w * 0.55;
      ty = h * 0.5 + Math.sin(a) * h * 0.47;
      ts = 0.82 + 0.18 * ((Math.sin(a) + 1) / 2);
    }
    if (b.x === null) { b.x = w * 0.5; b.y = h * 0.5; }
    const k = quieto ? 1 : 0.09;
    b.x += (tx - b.x) * k; b.y += (ty - b.y) * k; b.s += (ts - b.s) * k;
    b.el.style.transform = `translate(${b.x}px, ${b.y}px) scale(${b.s})`;
  });
  const linea = $("#hazLinea");
  if (st.activa) {
    const b = st.activa.burbuja;
    linea.setAttribute("x1", b.x); linea.setAttribute("y1", b.y);
    linea.setAttribute("x2", w * 0.6); linea.setAttribute("y2", h * 0.36);
  }
  requestAnimationFrame(orbitar);
}
requestAnimationFrame(orbitar);

// un dato encontrado sale flotando de su herramienta
function datoFlotante(f, texto) {
  const b = f?.burbuja;
  if (!b || b.x === null) return;
  const d = document.createElement("span");
  d.className = "dato";
  d.textContent = texto.length > 42 ? texto.slice(0, 40) + "…" : texto;
  d.style.left = `${b.x}px`; d.style.top = `${b.y + 34}px`;
  $("#desk").append(d);
  setTimeout(() => d.remove(), 2300);
}

// ---------- boca y parpadeo
const bust = $("#bust");
let hablando = false, bocaTimer = null;
const forma = (s) => (bust.dataset.shape = s);
function empezarBoca(ciclo) {
  hablando = true; $("#stage").classList.add("speaking");
  clearInterval(bocaTimer);
  if (ciclo) { const seq = ["open", "mid", "open", "base", "mid", "open", "mid", "base"]; let i = 0; bocaTimer = setInterval(() => forma(seq[i++ % seq.length]), 115); }
}
function pararBoca() { hablando = false; clearInterval(bocaTimer); $("#stage").classList.remove("speaking"); forma("base"); }
setInterval(() => { if (hablando) return; forma("blink"); setTimeout(() => { if (!hablando) forma("base"); }, 140); }, 3800);

// ---------- subtítulos
function pintarSubtitulo(texto) {
  const partes = texto.split(/(\s+)/);
  let pos = 0;
  $("#subtitulo").innerHTML = partes.map((p) => { const s = pos; pos += p.length; return /^\s+$/.test(p) ? p : `<span class="w" data-s="${s}" data-e="${pos}">${esc(p)}</span>`; }).join("");
}
function marcar(ci) {
  document.querySelectorAll("#subtitulo .w").forEach((w) => {
    const s = +w.dataset.s, e = +w.dataset.e;
    w.classList.toggle("done", e <= ci); w.classList.toggle("now", s <= ci && ci < e);
  });
}
async function esperarPausa(id) { while (st.pausa && id === st.run) await sleep(150); }

// ---------- voz: ElevenLabs (vía servidor) o navegador
let ctx = null, ganancia = null, analizador = null, fuenteAudio = null;
const nivel = new Uint8Array(256);
const cacheVoz = new Map();
function pedirVoz(texto) {
  if (st.modoVoz !== "elevenlabs") return Promise.resolve(null);
  if (!cacheVoz.has(texto)) {
    cacheVoz.set(texto, fetch("/api/voz", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ texto, sesion: st.sesion }) })
      .then((r) => (r.status === 200 ? r.json() : null)).catch(() => null));
  }
  return cacheVoz.get(texto);
}
function asegurarAudio() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  ganancia = ctx.createGain(); ganancia.gain.value = st.mudo ? 0 : 1;
  analizador = ctx.createAnalyser(); analizador.fftSize = 512;
  analizador.connect(ganancia); ganancia.connect(ctx.destination);
}
async function hablarElevenLabs(clip, texto, id) {
  asegurarAudio();
  if (ctx.state === "suspended" && !st.pausa) await ctx.resume();
  const bin = atob(clip.audio); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const buf = await ctx.decodeAudioData(u.buffer);
  if (id !== st.run || st.saltar) return;
  const vel = +$("#velocidad").value;
  const src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = vel; src.connect(analizador);
  fuenteAudio = src;
  const t0 = ctx.currentTime, starts = clip.align.starts;
  empezarBoca(false);
  let raf;
  const tick = () => {
    const t = (ctx.currentTime - t0) * vel;
    let i = 0; while (i < starts.length && starts[i] <= t) i++;
    marcar(i - 1);
    analizador.getByteTimeDomainData(nivel);
    let s = 0; for (const v of nivel) { const d = (v - 128) / 128; s += d * d; }
    const rms = Math.sqrt(s / nivel.length);
    forma(rms > 0.11 ? "open" : rms > 0.045 ? "mid" : "base");
    raf = requestAnimationFrame(tick);
  };
  await new Promise((ok) => { src.onended = ok; src.start(); tick(); });
  cancelAnimationFrame(raf); fuenteAudio = null;
}

const synth = window.speechSynthesis;
let voces = [];
function cargarVoces() {
  if (!synth) return;
  voces = synth.getVoices().filter((v) => /^es/i.test(v.lang));
  const pref = ["es-AR", "es-419", "es-MX", "es-US", "es-CO", "es-ES"];
  voces.sort((a, b) => (pref.indexOf(a.lang) + 99) % 100 - (pref.indexOf(b.lang) + 99) % 100);
  const sel = $("#voz"), cur = sel.value;
  sel.innerHTML = voces.length ? voces.map((v, i) => `<option value="${i}">${esc(v.name)} (${esc(v.lang)})</option>`).join("") : `<option value="">Sin voces en español</option>`;
  if (cur && [...sel.options].some((o) => o.value === cur)) sel.value = cur;
}
if (synth) { cargarVoces(); synth.onvoiceschanged = cargarVoces; }

function frase(texto, id) {
  return new Promise((ok) => {
    const v = voces[+$("#voz").value];
    if (!synth || !v || st.mudo) {
      const ms = Math.max(1200, texto.split(/\s+/).length * (380 / +$("#velocidad").value));
      const t0 = performance.now();
      const iv = setInterval(() => { if (id !== st.run || st.saltar || (!st.pausa && performance.now() - t0 > ms)) { clearInterval(iv); ok(); } }, 100);
      return;
    }
    const u = new SpeechSynthesisUtterance(texto);
    u.voice = v; u.lang = v.lang; u.rate = 1.05 * +$("#velocidad").value; u.pitch = 0.92;
    u.onend = ok; u.onerror = ok;
    u.onboundary = (e) => marcar(frase.offset + e.charIndex);
    synth.speak(u);
  });
}
async function hablarNavegador(texto, id) {
  empezarBoca(true);
  const trozos = texto.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [texto];
  let desde = 0;
  for (const t of trozos) {
    if (id !== st.run || st.saltar) break;
    await esperarPausa(id);
    const s = texto.indexOf(t.trim(), desde);
    frase.offset = s; marcar(s);
    await frase(t.trim(), id);
    desde = s + t.trim().length;
  }
}
async function hablar(texto, id) {
  pintarSubtitulo(texto);
  await esperarPausa(id);
  const clip = await pedirVoz(texto);
  if (id !== st.run) return;
  if (clip) await hablarElevenLabs(clip, texto, id);
  else await hablarNavegador(texto, id);
  marcar(texto.length + 1);
  pararBoca();
}

// ---------- cada tipo de evento
function agregarCharla(html, cls) {
  $("#charla .empty")?.remove();
  const li = document.createElement("li"); li.className = cls; li.innerHTML = html;
  const ch = $("#charla"); ch.append(li); ch.scrollTop = ch.scrollHeight;
}
function agregarBloque(titulo, html) {
  $("#veredicto .empty")?.remove();
  $("#veredicto").insertAdjacentHTML("beforeend", `<div class="block"><h3>${esc(titulo)}</h3>${html}</div>`);
}
const etiqueta = (l) => (/NO |DON'T|NO$/i.test(l) ? "" : /CONDIC|ESPER|WAIT|AJUST/i.test(l) ? "warn" : "go");

const manejar = {
  async session(ev) {
    if (ev.business || ev.question) {
      const q = $("#pregunta"); q.hidden = false;
      q.innerHTML = `${ev.business ? `<b>${esc(ev.business)}</b><br>` : ""}${ev.question ? `"${esc(ev.question)}"` : ""}`;
    }
    $("#tema").textContent = ev.title || "Auditoría";
  },
  async connectors(ev) {
    for (const c of ev.items) { fuente(c.name, c.slug, c.category); await sleep(st.rapido ? 0 : 220); }
  },
  async reading(ev, id) {
    const f = fuente(ev.source, ev.slug, ev.category);
    marcarLeyendo(f);
    const box = $("#lectura");
    $("#lecturaLogo").replaceWith(Object.assign(logo(f.slug, f.nombre), { id: "lecturaLogo" }));
    const verbo = ev.verb || "Leyendo";
    $("#lecturaVerbo").textContent = /^(Buscando|Listando)$/.test(verbo) ? `${verbo} en ${f.nombre}` : `${verbo} ${f.nombre}`;
    $("#lecturaQue").textContent = ev.what ? ev.what : ev.tool || "";
    box.hidden = false; box.style.animation = "none"; void box.offsetWidth; box.style.animation = "";
    $("#tema").textContent = `Leyendo ${f.nombre}`;
    await sleep(st.vivo ? 600 : 1300);
  },
  async read(ev) {
    const f = buscarFuente(ev.source) || fuente(ev.source, ev.slug);
    f.n++; f.li.querySelector(".count").textContent = `${f.n} ${f.n === 1 ? "lectura" : "lecturas"}`;
    f.li.classList.add("done"); f.burbuja.el.classList.add("hecha");
    await sleep(250);
    if (st.cola[0]?.t !== "reading") { $("#lectura").hidden = true; marcarLeyendo(null); }
  },
  async found(ev) {
    $("#hallazgos .empty")?.remove();
    const f = buscarFuente(ev.source);
    const li = document.createElement("li"); li.className = "f";
    li.append(logo(f?.slug || "x", ev.source, true));
    li.insertAdjacentHTML("beforeend", `<span>${esc(ev.text)}</span>`);
    $("#hallazgos").prepend(li);
    datoFlotante(f, ev.text);
    await sleep(700);
  },
  async thinking(ev) {
    $("#lectura").hidden = true; marcarLeyendo(null);
    $("#subtitulo").innerHTML = `<span class="think">${esc(ev.text)}…</span>`;
    await sleep(900);
  },
  async question(ev) {
    $("#lectura").hidden = true; marcarLeyendo(null);
    $("#tema").textContent = "Tu pregunta";
    $("#subtitulo").innerHTML = `<span class="ask">Pregunta del dueño</span>${esc(ev.text)}`;
    agregarCharla(`<small>Vos</small>${esc(ev.text)}`, "ask");
    await sleep(1600);
  },
  async say(ev, id) {
    const rep = Boolean(ev.repetido);
    if (!rep) st.dichas.push(ev);
    st.actualSay = rep ? ev._i : st.dichas.length - 1; st.esRepeticion = rep;
    $("#repetir").disabled = false; $("#anterior").disabled = false;
    $("#lectura").hidden = true;
    $("#tema").textContent = ev.topic || (ev.source ? ev.source : "Asesor");
    const f = ev.source ? buscarFuente(ev.source) : null;
    marcarLeyendo(f);
    const q = $("#cita");
    if (ev.quote) { q.hidden = false; q.innerHTML = `<q>${esc(ev.quote.text)}</q><span class="srcid">${esc(ev.quote.id)}</span>`; } else q.hidden = true;
    if (ev.metric && !rep) {
      $("#pizarron .empty")?.remove();
      const m = document.createElement("div");
      m.className = `metric ${ev.metric.tone || ""}`;
      m.innerHTML = `<div class="row"><span class="lbl">${esc(ev.metric.label)}</span><span class="val">${esc(ev.metric.value)}</span></div>${ev.metric.math ? `<div class="math">${esc(ev.metric.math)}</div>` : ""}`;
      if (f) { const from = document.createElement("div"); from.className = "from"; from.append(logo(f.slug, f.nombre, true)); from.append(`de ${f.nombre}`); m.append(from); }
      $("#pizarron").prepend(m);
    }
    if (!rep) agregarCharla(`<small>${esc(ev.topic || "Asesor")}</small>${esc(ev.text)}`, "say");
    await hablar(ev.text, id);
    st.actualSay = -1;
    marcarLeyendo(null);
  },
  async rules(ev, id) {
    const cont = $("#reglas"); cont.innerHTML = "";
    for (const r of ev.rules) {
      if (id !== st.run) return;
      cont.insertAdjacentHTML("beforeend", `<div class="rule"><span class="n">${r.n}</span><span class="name">${esc(r.name)}</span><span class="score" style="color:${tone(r.score)}">${r.score}/10</span><span class="bar"><i style="background:${tone(r.score)}"></i></span><span class="why">${esc(r.line)}</span></div>`);
      const i = cont.lastElementChild.querySelector(".bar i");
      requestAnimationFrame(() => requestAnimationFrame(() => (i.style.width = `${r.score * 10}%`)));
      await sleep(st.rapido ? 0 : 260);
    }
    const avg = ev.rules.reduce((a, r) => a + r.score, 0) / ev.rules.length;
    $("#totalBox").hidden = false;
    $("#promedio").textContent = `${avg.toFixed(1).replace(".", ",")}/10`;
    $("#promedio").style.color = tone(avg);
  },
  async verdict(ev) {
    const v = $("#veredicto");
    v.innerHTML = `<h2>Veredicto</h2><div class="stamp ${etiqueta(ev.label)}">${esc(ev.label)}</div><p class="headline">${esc(ev.headline)}</p>`;
    if (ev.bottleneck) agregarBloque("Cuello de botella", `<p>${esc(ev.bottleneck)}</p>`);
    if (ev.answer) agregarBloque("Tu pregunta", `<p>${esc(ev.answer)}</p>`);
    if (ev.actions?.length) agregarBloque("Qué hacer", `<ul class="actions">${ev.actions.map((a) => `<li><b>${esc(a.when)}</b><span>${esc(a.action)}</span></li>`).join("")}</ul>`);
    await sleep(900);
  },
  async done() {
    $("#lectura").hidden = true; marcarLeyendo(null);
    $("#tema").textContent = "Auditoría terminada";
    if (!st.vivo) { $("#pausa").disabled = true; $("#siguiente").disabled = true; }
  },
};

async function procesar() {
  if (st.corriendo) return;
  st.corriendo = true;
  const id = st.run;
  while (st.cola.length && id === st.run) {
    await esperarPausa(id);
    const ev = st.cola.shift();
    st.saltar = false;
    if (ev.t === "say") pedirVoz(ev.text);
    const prox = st.cola.find((e) => e.t === "say");   // la próxima frase se pide mientras habla esta
    if (prox) pedirVoz(prox.text);
    try { await manejar[ev.t]?.(ev, id); } catch (e) { console.error(ev, e); }
    if (ev.t === "say") await sleep(350);
  }
  if (id === st.run) st.corriendo = false;
}

// ---------- sesiones
function limpiar() {
  st.run++; st.cola = []; st.desde = 0; st.pausa = false; st.saltar = false; st.corriendo = false;
  st.dichas = []; st.actualSay = -1; st.esRepeticion = false; st.nueva = false; $("#repetir").disabled = true; $("#anterior").disabled = true;
  if (synth) synth.cancel();
  if (fuenteAudio) { try { fuenteAudio.stop(); } catch {} }
  pararBoca();
  $("#fuentes").innerHTML = `<li class="empty">Aparecen cuando Claude revisa tus conectores.</li>`;
  $("#orbita").innerHTML = ""; st.fuentes.clear(); marcarLeyendo(null);
  $("#hallazgos").innerHTML = `<li class="empty">Cada dato que saca de tus herramientas.</li>`;
  $("#pizarron").innerHTML = `<p class="empty">Los números aparecen acá a medida que los calcula.</p>`;
  $("#reglas").innerHTML = `<p class="empty">Aparecen al final de la auditoría.</p>`;
  $("#totalBox").hidden = true;
  $("#veredicto").innerHTML = `<h2>Veredicto</h2><p class="empty">Aparece al final de la auditoría.</p>`;
  $("#charla").innerHTML = `<li class="empty">Lo que dice el asesor y las preguntas que le hacés en Claude.</li>`;
  $("#pregunta").hidden = true; $("#cita").hidden = true; $("#lectura").hidden = true;
  $("#subtitulo").innerHTML = `<span class="think">Esperando al asesor…</span>`; $("#tema").textContent = "";
  $("#pausa").disabled = false; $("#siguiente").disabled = false; $("#pausa").textContent = "Pausa";
}
async function abrir(id, vivo) {
  limpiar();
  st.sesion = id; st.vivo = vivo;
  actualizarCharla();
  $("#live").hidden = !vivo;
  $("#sesiones").value = id;
  if (ctx && ctx.state === "suspended") ctx.resume();
  await traer();
}
async function traer() {
  if (!st.sesion) return;
  const r = await fetch(`/api/eventos?s=${encodeURIComponent(st.sesion)}&desde=${st.desde}`).then((x) => x.json()).catch(() => null);
  if (!r || !r.eventos) return;
  st.desde = r.total;
  for (const ev of r.eventos) st.cola.push(ev);
  procesar();
}
async function estado(primera = false) {
  const r = await fetch("/api/estado").then((x) => x.json()).catch(() => null);
  if (!r) return;
  st.modoVoz = r.voz;
  st.logos = new Set(r.logos || []);
  st.claude = r.claude || { disponible: false, ocupado: false };
  st.actual = r.actual;
  actualizarCharla();
  $("#voz").hidden = r.voz !== "navegador";
  const sel = $("#sesiones"), cur = sel.value;
  sel.innerHTML = `<option value="">Auditorías guardadas</option>` + r.sesiones.map((s) => `<option value="${esc(s.id)}">${esc(s.ejemplo ? "Ejemplo: " : "")}${esc(s.title)}</option>`).join("");
  sel.value = st.sesion || cur || "";
  // una auditoría nueva arrancó en Claude: la sala se engancha sola, aunque esté mostrando otra
  if (r.actual && !st.vistas.has(r.actual)) { st.vistas.add(r.actual); abrir(r.actual, true); }
}

// ---------- controles
$("#ejemplo").addEventListener("click", () => { asegurarAudio(); abrir("ejemplo-nordica-home", false); });
$("#sesiones").addEventListener("change", (e) => { if (e.target.value) { asegurarAudio(); abrir(e.target.value, false); } });
$("#pausa").addEventListener("click", async () => {
  st.pausa = !st.pausa;
  $("#pausa").textContent = st.pausa ? "Seguir" : "Pausa";
  if (synth) st.pausa ? synth.pause() : synth.resume();
  if (ctx) st.pausa ? await ctx.suspend() : await ctx.resume();
  if (st.pausa) pararBoca();
});
$("#siguiente").addEventListener("click", async () => {
  st.saltar = true;
  if (st.pausa) { st.pausa = false; $("#pausa").textContent = "Pausa"; if (ctx) await ctx.resume(); if (synth) synth.resume(); }
  if (synth) synth.cancel();
  if (fuenteAudio) { try { fuenteAudio.stop(); } catch {} }
});
// Anterior y Repetir: vuelven a decir frases ya dichas y siguen hacia adelante hasta la última,
// así nunca se queda atrás. Repetir arranca en la frase actual; Anterior, una antes (y cada toque, una más).
async function rebobinar(atras) {
  const hablandoAhora = st.actualSay >= 0;
  const actual = hablandoAhora ? st.actualSay : st.dichas.length - 1;
  const desde = Math.max(0, atras && hablandoAhora ? actual - 1 : actual);
  if (!st.dichas[desde]) return;
  asegurarAudio();
  st.cola = st.cola.filter((e) => !e.repetido);
  const tramo = st.dichas.slice(desde).map((ev, k) => ({ ...ev, repetido: true, _i: desde + k }));
  st.cola.unshift(...tramo);
  if (st.pausa) { st.pausa = false; $("#pausa").textContent = "Pausa"; if (ctx) await ctx.resume(); if (synth) synth.resume(); }
  if (hablandoAhora) cortarFrase();
  procesar();
}
$("#repetir").addEventListener("click", () => rebobinar(false));
$("#anterior").addEventListener("click", () => rebobinar(true));
$("#sonido").addEventListener("click", () => {
  st.mudo = !st.mudo;
  $("#sonido").textContent = st.mudo ? "Sonido: no" : "Sonido: sí";
  $("#sonido").setAttribute("aria-pressed", String(st.mudo));
  if (ganancia) ganancia.gain.value = st.mudo ? 0 : 1;
});
document.addEventListener("click", () => { if (ctx && ctx.state === "suspended" && !st.pausa) ctx.resume(); }, { once: true });

// ---------- charla con el asesor (texto o voz) desde la sala
function aviso(texto, error = false) { const h = $("#hint"); h.textContent = texto || ""; h.classList.toggle("error", error); }
function actualizarCharla() {
  const c = st.claude || {};
  const enEjemplo = st.sesion && !st.vivo;
  // Sin una auditoría en vivo, lo que escriba o diga el dueño arranca una nueva, con eso como brief.
  st.arranca = !st.actual || enEjemplo || st.nueva;
  const bloqueado = !c.disponible || c.ocupado;
  $("#preguntaTxt").disabled = bloqueado; $("#preguntarBtn").disabled = bloqueado; $("#mic").disabled = bloqueado || !Reco;
  $("#nueva").disabled = bloqueado;
  $("#preguntaTxt").placeholder = st.arranca ? "¿Qué querés saber? Ej: ¿puedo subir los precios? ¿Cuánto invierto en anuncios?" : "Preguntale algo: ¿y si subo los precios?";
  $("#preguntarBtn").textContent = st.arranca ? "Auditar" : "Preguntar";
  if (st.escuchando) return;
  if (!c.disponible) aviso("Para charlar desde acá hace falta Claude Code instalado. También podés preguntar directo en Claude Code.");
  else if (c.ocupado) aviso("El asesor está trabajando…");
  else if (st.arranca) aviso("Contale qué querés saber o qué te preocupa, escribiendo o con el micrófono. Lee tus herramientas y te responde con tus números.");
  else aviso(Reco ? "Escribile o tocá el micrófono y hablale." : "Escribile tu pregunta.");
}
function cortarFrase() {
  st.saltar = true;
  if (synth) synth.cancel();
  if (fuenteAudio) { try { fuenteAudio.stop(); } catch {} }
}
async function enviarPregunta(texto, nueva = false) {
  texto = String(texto || "").trim();
  if (!texto) { if (nueva) aviso("Contale primero qué querés saber de tu negocio.", true); return; }
  aviso(nueva ? "Arrancando la auditoría…" : "Enviando…");
  const r = await fetch("/api/preguntar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ texto, nueva }) })
    .then(async (x) => ({ status: x.status, j: await x.json().catch(() => ({})) })).catch(() => null);
  if (!r || r.status !== 200) { aviso(r?.j?.error || "No pude hablar con el servidor de la sala.", true); return; }
  $("#preguntaTxt").value = "";
  st.claude = { ...(st.claude || {}), ocupado: true };
  if (nueva) {
    st.nueva = false;
    $("#tema").textContent = "Tu pregunta";
    $("#subtitulo").innerHTML = `<span class="ask">Lo que querés saber</span>${esc(texto)}`;
  } else {
    cortarFrase();
    if (!(st.vivo && st.sesion === r.j.sesion) && r.j.sesion) { st.vistas.add(r.j.sesion); abrir(r.j.sesion, true); }
  }
  actualizarCharla();
}
$("#formPregunta").addEventListener("submit", (e) => { e.preventDefault(); asegurarAudio(); enviarPregunta($("#preguntaTxt").value, st.arranca); });
// Nueva auditoría: no arranca nada, deja la sala lista para que el dueño cuente qué quiere saber.
$("#nueva").addEventListener("click", () => {
  limpiar();
  st.sesion = null; st.vivo = false; st.nueva = true;
  $("#live").hidden = true; $("#sesiones").value = "";
  $("#pausa").disabled = true; $("#siguiente").disabled = true;
  $("#tema").textContent = "Nueva auditoría";
  $("#subtitulo").innerHTML = "¿Qué querés saber de tu negocio? Por ejemplo: <b>¿puedo subir los precios?</b> o <b>¿cuánto invierto en anuncios?</b>";
  actualizarCharla();
  $("#preguntaTxt").focus();
});

// micrófono: Chrome y Edge pasan la voz a texto
const Reco = window.SpeechRecognition || window.webkitSpeechRecognition;
let reco = null, pausadoPorMic = false;
async function pausarPorMic(on) {
  if (on && !st.pausa) { pausadoPorMic = true; st.pausa = true; if (synth) synth.pause(); if (ctx) await ctx.suspend(); pararBoca(); }
  if (!on && pausadoPorMic) { pausadoPorMic = false; st.pausa = false; if (synth) synth.resume(); if (ctx) await ctx.resume(); }
  $("#pausa").textContent = st.pausa ? "Seguir" : "Pausa";
}
$("#mic").addEventListener("click", () => {
  if (!Reco) return;
  if (st.escuchando) { reco?.stop(); return; }
  reco = new Reco();
  reco.lang = navigator.language?.startsWith("es") ? navigator.language : "es-AR";
  reco.interimResults = true; reco.continuous = false;
  let final = "";
  reco.onstart = () => { st.escuchando = true; $("#mic").classList.add("escuchando"); aviso("Te escucho… (tocá de nuevo para terminar)"); pausarPorMic(true); };
  reco.onresult = (e) => {
    let txt = "";
    for (const r of e.results) { txt += r[0].transcript; if (r.isFinal) final = txt; }
    $("#preguntaTxt").value = txt;
  };
  reco.onerror = (e) => { aviso(e.error === "not-allowed" ? "El navegador no dio permiso al micrófono." : "No te escuché bien. Probá de nuevo o escribí.", true); };
  reco.onend = async () => {
    st.escuchando = false; $("#mic").classList.remove("escuchando");
    const texto = (final || $("#preguntaTxt").value).trim();
    if (texto) { pausadoPorMic = false; st.pausa = false; if (synth) synth.resume(); if (ctx) await ctx.resume(); $("#pausa").textContent = "Pausa"; enviarPregunta(texto, st.arranca); }
    else { await pausarPorMic(false); actualizarCharla(); }
  };
  asegurarAudio();
  reco.start();
});

estado(true);
setInterval(() => estado(false), 3000);
setInterval(() => { if (st.vivo) traer(); }, 1000);
