"use strict";
/* Sitio de Venta Store (ventastore.store): catálogo con pedido por WhatsApp.
   Los productos y la cotización salen de la planilla de Google de siempre:
   - GOOGLE_SHEET_ID con la planilla compartida como "cualquiera con el link puede ver" (se lee como CSV), o
   - CATALOGO_URL: un JSON con la misma forma que /api/products del sitio anterior.
   Si ninguna fuente responde, se usa la última lista buena (o la de respaldo en datos/). */
const http = require("http");
const fs = require("fs");
const path = require("path");

const PUERTO = process.env.PORT || 3000;
const PUB = path.join(__dirname, "public");
const RESPALDO = path.join(__dirname, "datos", "productos-respaldo.json");
const MINUTOS = 5;
let cache = { hasta: 0, datos: null };

/* ---------- Lectura de la planilla ---------- */
function csv(texto) {
  const filas = []; let fila = [], campo = "", comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) { if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; } else if (c === '"') comillas = false; else campo += c; }
    else if (c === '"') comillas = true;
    else if (c === ",") { fila.push(campo); campo = ""; }
    else if (c === "\n") { fila.push(campo); filas.push(fila); fila = []; campo = ""; }
    else if (c !== "\r") campo += c;
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  return filas;
}
const numero = x => { const n = parseFloat(String(x || "").replace(/[^0-9.,]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };

async function desdePlanilla(id) {
  const r = await fetch(`https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/gviz/tq?tqx=out:csv`, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error("planilla " + r.status);
  const filas = csv(await r.text()).slice(1);
  // Columnas como en el sitio anterior: A nombre, B descripción, C precio USD, D categoría, E imagen, F stock, H cotización.
  let dolar = 0;
  for (const f of filas.slice(0, 10)) { const v = numero(f[7]); if (v > 500) { dolar = v; break; } }
  const productos = filas.filter(f => f[0] && f[2] && f[3]).map(f => ({ nombre: f[0], descripcion: f[1] || "", usd: numero(f[2]), categoria: String(f[3]).trim().toLowerCase(), imagen: f[4] || "", stock: f[5] }));
  return { dolar, productos };
}
async function desdeJson(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error("catálogo " + r.status);
  return deFormatoViejo(await r.json());
}
function deFormatoViejo(lista) {
  const dolar = numero(lista.find(p => p.dollarRate)?.dollarRate);
  return { dolar, productos: lista.map(p => ({ nombre: p.name, descripcion: p.description || "", usd: numero(p.price), categoria: String(p.category || "").toLowerCase(), imagen: p.imageUrl || "", stock: p.stock })) };
}

/* ---------- Fotos propias (public/productos): cuadradas, fondo blanco; mandan sobre la de la planilla ---------- */
const FOTOS = new Set((() => { try { return fs.readdirSync(path.join(__dirname, "public", "productos")); } catch { return []; } })().map(f => f.replace(/\.webp$/, "")));
// Colores que se reconocen en la descripción (lo que se muestra → nombre de la foto, si hay una de ese color)
const COLORES = [
  [/\bburgundy\b|\bbord[oó]\b|\bburdeos\b/, "Burgundy", "burgundy"], [/\bglacier\b/, "Glacier", "glacier"],
  [/\bsilver\b|\bplata\b|\bplateado\b/, "Plata", "silver"], [/\bnegro\b|\bblack\b/, "Negro", "black"],
  [/\bblanco\b|\bwhite\b/, "Blanco", "white"], [/\bazul\b|\bblue\b/, "Azul", "blue"], [/\brosa\b|\bpink\b/, "Rosa", "pink"],
  [/\bverde\b|\bgreen\b/, "Verde", "green"], [/\bnaranja\b|\borange\b/, "Naranja", "orange"], [/\blavanda\b|\blavender\b/, "Lavanda", "lavender"],
  [/\bvioleta\b|\bpurple\b/, "Violeta", "purple"], [/\bdorado\b|\bgold\b/, "Dorado", "gold"], [/\bgris\b|\bgr[ae]y\b/, "Gris", "gray"],
  [/\bnatural\b/, "Natural", "natural"], [/\bdesert\b|\bdesierto\b/, "Desierto", "desert"], [/\bmidnight\b|\bmedianoche\b/, "Medianoche", "midnight"],
];
function fotoDe(nombre, color) {
  const n = nombre.toLowerCase(); let k = null;
  const ip = n.match(/iphone\s*(\d+)\s*(e)?\b/);
  if (/iphone/.test(n) && /\bair\b/.test(n)) k = "iphone-air";
  else if (ip) { k = "iphone-" + ip[1] + (ip[2] || ""); if (/\bpro\b/.test(n) && FOTOS.has(k + "-pro")) k += "-pro"; }
  else if (/ipad/.test(n)) k = /air/.test(n) ? "ipad-air" : /pro/.test(n) ? "ipad-pro" : "ipad";
  else if (/macbook/.test(n)) k = /pro/.test(n) ? "macbook-pro" : /neo/.test(n) ? "macbook-neo" : "macbook-air";
  else if (/watch/.test(n)) k = /ultra/.test(n) ? "watch-ultra" : /\bse\b/.test(n) ? "watch-se" : "watch-series";
  else if (/airtag/.test(n)) k = "airtag";
  else if (/airpods/.test(n)) k = "airpods-pro-3";
  else if (/playstation|ps5/.test(n)) k = "ps5";
  else if (/switch 2/.test(n)) k = "switch-2";
  if (k && color && FOTOS.has(k + "-" + color)) k += "-" + color;
  return k && FOTOS.has(k) ? "/productos/" + k + ".webp?v=1" : null;
}

/* ---------- Nombres prolijos y datos de cada equipo (la planilla queda como está) ---------- */
const CATEGORIAS = { celulares: "iphone", iphone: "iphone", ipad: "ipad", macbook: "mac", mac: "mac", watch: "watch", consolas: "consolas", airpods: "accesorios", airtag: "accesorios", accesorios: "accesorios" };
const PALABRAS = { pro: "Pro", max: "Max", air: "Air", neo: "Neo", ultra: "Ultra", mini: "Mini", plus: "Plus", se: "SE" };
function prolijo(p) {
  let nombre = String(p.nombre).trim(), desc = String(p.descripcion).trim().replace(/\.$/, "");
  const cpo = /\bcpo\b/i.test(nombre) || /\bcpo\b/i.test(desc);
  nombre = nombre.replace(/\bcpo\b/ig, "").replace(/\s+/g, " ").trim()
    .replace(/^ipad/i, "iPad").replace(/^macbook/i, "MacBook").replace(/apple wach/i, "Apple Watch").replace(/^apple watch/i, "Apple Watch").replace(/^ps5$/i, "PlayStation 5")
    .replace(/^airtags?$/i, "AirTag").replace(/^airpods/i, "AirPods").replace(/iphone (\d+) e\b/i, "iPhone $1e").replace(/^(\d+ pro( max)?)$/i, "iPhone $1").replace(/^iphone/i, "iPhone")
    .replace(/\b(pro|max|air|neo|ultra|mini|plus|se)\b/gi, w => PALABRAS[w.toLowerCase()]);
  // El chip puede venir en el nombre ("iPad Air 11 M4") o en la descripción
  let chip = (nombre.match(/\s(m\d)$/i) || [])[1];
  if (chip) nombre = nombre.replace(/\s(m\d)$/i, ""); else chip = (desc.match(/\b(m\d)\b/i) || [])[1];
  // Memorias: con "RAM" en la descripción, la menor es la RAM y la mayor el almacenamiento
  const tam = [...desc.matchAll(/(\d+)\s*(gb|tb)\b/gi)].map(m => ({ txt: m[1] + " " + m[2].toUpperCase(), gb: +m[1] * (/tb/i.test(m[2]) ? 1024 : 1) }));
  let gb, ram;
  if (/\bram\b/i.test(desc) && tam.length >= 2) { const o = [...tam].sort((a, b) => a.gb - b.gb); ram = o[0].txt; gb = o[o.length - 1].txt; }
  else { const r = desc.match(/(\d+)\s*gb\s*ram/i); if (r) ram = r[1] + " GB"; gb = (tam.find(t => !r || t.gb !== +r[1]) || {}).txt; }
  const bateria = (desc.match(/(\d+)%\s*bater/i) || [])[1];
  const conPulgadas = /^(iPad|MacBook)/.test(nombre) && (/inch/i.test(desc) || chip || /\b(air|pro|neo)\b/i.test(nombre));
  const pulgadas = conPulgadas ? (nombre.match(/\s(1\d)$/) || [])[1] : null;
  const dl = desc.toLowerCase(), col = COLORES.find(c => c[0].test(dl));
  let condicion = /swap/i.test(desc) ? "Swap" : cpo ? "CPO" : /garant[ií]a apple/i.test(desc) ? "Garantía Apple" : "";
  if (/^nintendo$/i.test(nombre) && /switch 2/i.test(desc)) nombre = "Nintendo Switch 2";
  let detalle = [];
  const mm = [...desc.matchAll(/(\d+)\s*mm\b/gi)].map(m => m[1]);
  if (/^apple watch$/i.test(nombre)) { const m = desc.replace(/generacion/i, "generación").replace(/^se\b/i, "SE").replace(/^s(\d+)/i, "Series $1").replace(/\s*(\d+)\s*mm$/i, " · $1 mm"); nombre = "Apple Watch " + m.split(" · ")[0]; detalle.push(...m.split(" · ").slice(1)); }
  else if (/^apple watch/i.test(nombre)) {
    nombre = nombre.replace(/\bS(\d+)\b/i, "Series $1").replace(/\b(\d+)\s*generaci[oó]n\b/i, "$1.ª generación");
    if (mm.length) detalle.push(mm.join(" o ") + " mm");
  } else {
    if (pulgadas) detalle.push(pulgadas + "″");
    if (chip) detalle.push("Chip " + chip.toUpperCase());
    if (ram) detalle.push(ram + " RAM");
    if (gb) detalle.push(gb);
    if (bateria) detalle.push("Batería " + bateria + "%");
    if (/digital/i.test(desc)) detalle.push("Edición digital");
    if (/x4|4\s*pack|pack\s*(de\s*)?4/i.test(desc)) detalle.push("Pack de 4");
    if (/6ta generacion/i.test(nombre)) { nombre = nombre.replace(/6ta generacion/i, "").trim(); detalle.unshift("6.ª generación"); }
  }
  if (col) detalle.push(col[1]);
  if (pulgadas) nombre = nombre.replace(/\s1\d$/, "") + " " + pulgadas;
  const categoria = /airtag|airpods/i.test(nombre) ? "accesorios" : CATEGORIAS[p.categoria] || "otros";
  return { nombre, detalle: detalle.join(" · "), condicion, categoria, usd: p.usd, imagen: fotoDe(nombre, col && col[2]) || p.imagen, conAccesorios: categoria === "iphone",
    consultarColor: !col && ["iphone", "ipad", "mac", "watch"].includes(categoria) };
}

/* ---------- Usados: valores para el cotizador ----------
   Se arman solos desde el catálogo: costo = precio publicado − MARGEN (100 USD) y al cliente se le ofrece
   costo − TOMA_MENOS (100 USD), o sea precio publicado − 200. Los "Garantía Apple" dan el valor de un usado
   comprado sellado; los "Swap", el de un Swap. Si hay varios colores, se toma el más barato.
   Opcional: la pestaña "Usados" (Modelo · Capacidad · Costo Garantía Apple · Costo Swap) pisa esos valores.
   El costo nunca sale del servidor. */
const TOMA_MENOS = numero(process.env.TOMA_MENOS) || 100, MARGEN = numero(process.env.MARGEN) || 100;
function usadosDelCatalogo(productos) {
  const mapa = new Map();
  for (const p of productos) {
    if (p.categoria !== "iphone") continue;
    const tipo = p.condicion === "Garantía Apple" ? "original" : p.condicion === "Swap" ? "swap" : null;
    const capacidad = (p.detalle.match(/\d+ (GB|TB)/) || [])[0] || "";
    const v = Math.round(p.usd - MARGEN - TOMA_MENOS);
    if (!tipo || !capacidad || v <= 0) continue;
    const k = p.nombre + "|" + capacidad, u = mapa.get(k) || { modelo: p.nombre, capacidad, original: null, swap: null };
    u[tipo] = u[tipo] == null ? v : Math.min(u[tipo], v);
    mapa.set(k, u);
  }
  return mapa;
}
let cacheUsados = { hasta: 0, datos: null };
async function usados() {
  if (cacheUsados.datos && Date.now() < cacheUsados.hasta) return cacheUsados.datos;
  let lista = [];
  try {
    const id = process.env.GOOGLE_SHEET_ID, prueba = process.env.USADOS_CSV; // USADOS_CSV: archivo local, solo para probar
    if (id || prueba) {
      let texto = "";
      if (prueba) texto = fs.readFileSync(prueba, "utf8");
      else { const r = await fetch(`https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/gviz/tq?tqx=out:csv&sheet=Usados`, { signal: AbortSignal.timeout(10000) }); if (r.ok) texto = await r.text(); }
      const filas = csv(texto);
      // Si la pestaña no existe, Google devuelve la primera (productos): sin columna "Costo" no se usa.
      // Columnas: Modelo · Capacidad · Costo Garantía Apple · Costo Swap (con una sola columna "Costo", vale para los dos)
      const cab = (filas[0] || []).map(c => String(c).toLowerCase());
      const iM = cab.findIndex(c => /modelo|nombre|equipo/.test(c)), iC = cab.findIndex(c => /capacidad|gb/.test(c));
      const iG = cab.findIndex(c => /costo/.test(c) && /garant|apple|sellad|nuevo/.test(c)), iS = cab.findIndex(c => /costo/.test(c) && /swap/.test(c));
      const iP = cab.findIndex(c => /costo/.test(c));
      const toma = v => { const n = Math.round(numero(v) - TOMA_MENOS); return n > 0 ? n : null; };
      if (iM >= 0 && iP >= 0) lista = filas.slice(1).map(f => ({
          modelo: prolijo({ nombre: f[iM] || "", descripcion: "", categoria: "", usd: 0, imagen: "" }).nombre,
          capacidad: iC >= 0 ? String(f[iC] || "").trim().replace(/\s*(gb|tb)$/i, (_, u) => " " + u.toUpperCase()) : "",
          original: toma(f[iG >= 0 ? iG : iP]), swap: toma(f[iS >= 0 ? iS : iP]) }))
        .filter(u => u.modelo && (u.original || u.swap));
    }
  } catch (e) { console.error("No se pudo leer Usados:", e.message); if (cacheUsados.datos) return cacheUsados.datos; }
  // Valores automáticos del catálogo; lo cargado en la pestaña "Usados" manda sobre ellos
  let mapa = new Map();
  try { mapa = usadosDelCatalogo((await catalogo()).productos); } catch (e) { console.error("Usados del catálogo:", e.message); }
  for (const u of lista) { const k = u.modelo + "|" + u.capacidad, a = mapa.get(k) || {}; mapa.set(k, { ...a, ...u, original: u.original ?? a.original ?? null, swap: u.swap ?? a.swap ?? null }); }
  const orden = (a, b) => a.modelo.localeCompare(b.modelo, "es", { numeric: true }) || parseInt(a.capacidad) * (/TB/.test(a.capacidad) ? 1024 : 1) - parseInt(b.capacidad) * (/TB/.test(b.capacidad) ? 1024 : 1);
  lista = [...mapa.values()].sort(orden);
  cacheUsados = { hasta: Date.now() + MINUTOS * 60e3, datos: { usados: lista } };
  return cacheUsados.datos;
}

async function catalogo() {
  if (cache.datos && Date.now() < cache.hasta) return cache.datos;
  let base = null;
  try {
    if (process.env.GOOGLE_SHEET_ID) base = await desdePlanilla(process.env.GOOGLE_SHEET_ID);
    else if (process.env.CATALOGO_URL) base = await desdeJson(process.env.CATALOGO_URL);
  } catch (e) { console.error("No se pudo leer el catálogo:", e.message); }
  if (!base?.productos?.length) {
    if (cache.datos) return cache.datos;
    base = deFormatoViejo(JSON.parse(fs.readFileSync(RESPALDO, "utf8")));
  }
  const datos = { dolar: base.dolar || numero(process.env.DOLAR) || 0, actualizado: new Date().toISOString(), productos: base.productos.filter(p => p.usd > 0).map(prolijo) };
  // Un solo Apple Watch en rosa para que se vea la opción (el primer Series 11, o el primer Series); si la planilla dice "rosa", manda la planilla
  const series = datos.productos.filter(p => /^Apple Watch Series/.test(p.nombre));
  if (series.length && !series.some(p => /watch-series-pink/.test(p.imagen))) {
    const uno = series.find(p => /Series 11/.test(p.nombre) && /^\/productos\/watch-series\.webp/.test(p.imagen)) || series.find(p => /^\/productos\/watch-series\.webp/.test(p.imagen));
    if (uno && FOTOS.has("watch-series-pink")) uno.imagen = "/productos/watch-series-pink.webp?v=1";
  }
  cache = { hasta: Date.now() + MINUTOS * 60e3, datos };
  return datos;
}

/* ---------- Servidor ---------- */
const TIPOS = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon", ".xml": "application/xml; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json" };
const CABECERAS = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin", "X-Frame-Options": "DENY" };

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x"), ruta = decodeURIComponent(url.pathname);
  try {
    // La dirección principal es ventastore.store: www lleva ahí
    if ((req.headers.host || "").toLowerCase().startsWith("www.ventastore.store")) { res.writeHead(301, { Location: "https://ventastore.store" + req.url }); return res.end(); }
    if (ruta === "/salud") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end('{"ok":true}'); }
    if (ruta === "/api/usados") {
      const d = await usados();
      res.writeHead(200, { ...CABECERAS, "Content-Type": TIPOS[".json"], "Cache-Control": "public, max-age=60" }); return res.end(JSON.stringify(d));
    }
    if (ruta === "/api/catalogo") {
      const d = await catalogo();
      res.writeHead(200, { ...CABECERAS, "Content-Type": TIPOS[".json"], "Cache-Control": "public, max-age=60" }); return res.end(JSON.stringify(d));
    }
    // Direcciones del sitio anterior que pueden estar en Google o compartidas
    if (["/catalogo", "/catalog", "/productos"].includes(ruta)) { res.writeHead(301, { Location: "/#catalogo" }); return res.end(); }
    if (ruta === "/invertir") { res.writeHead(301, { Location: "/#invertir" }); return res.end(); }
    let archivo = path.normalize(path.join(PUB, ruta === "/" ? "index.html" : ruta));
    if (!archivo.startsWith(PUB) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) archivo = path.join(PUB, "index.html");
    // HTML, estilos y código se revisan siempre (cambian con cada versión); imágenes, un día.
    const ext = path.extname(archivo), largo = [".html", ".css", ".js"].includes(ext) ? "no-cache" : "public, max-age=86400";
    res.writeHead(200, { ...CABECERAS, "Content-Type": TIPOS[ext] || "application/octet-stream", "Cache-Control": largo });
    fs.createReadStream(archivo).pipe(res);
  } catch (e) { console.error(e); if (!res.headersSent) res.writeHead(500); res.end("Error"); }
});

if (require.main === module) servidor.listen(PUERTO, () => console.log("Sitio de Venta Store en el puerto " + PUERTO));
module.exports = { prolijo, csv, catalogo, usados };
