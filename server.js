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
function fotoDe(nombre) {
  const n = nombre.toLowerCase(); let k = null;
  const ip = n.match(/iphone\s*(\d+)\s*(e)?\b/);
  if (/iphone/.test(n) && /\bair\b/.test(n)) k = "iphone-air";
  else if (ip) { k = "iphone-" + ip[1] + (ip[2] || ""); if (/\bpro\b/.test(n) && FOTOS.has(k + "-pro")) k += "-pro"; }
  else if (/ipad/.test(n)) k = /air/.test(n) ? "ipad-air" : /pro/.test(n) ? "ipad-pro" : "ipad";
  else if (/macbook/.test(n)) k = /pro/.test(n) ? "macbook-pro" : /neo/.test(n) ? "macbook-neo" : "macbook-air";
  else if (/watch/.test(n)) k = /ultra/.test(n) ? "watch-ultra" : /\bse\b/.test(n) ? "watch-se" : "watch-series";
  else if (/airtag/.test(n)) k = "airtag";
  else if (/playstation|ps5/.test(n)) k = "ps5";
  else if (/switch 2/.test(n)) k = "switch-2";
  return k && FOTOS.has(k) ? "/productos/" + k + ".webp?v=1" : null;
}

/* ---------- Nombres prolijos y datos de cada equipo (la planilla queda como está) ---------- */
const CATEGORIAS = { celulares: "iphone", ipad: "ipad", macbook: "mac", watch: "watch", consolas: "consolas" };
function prolijo(p) {
  let nombre = String(p.nombre).trim(), desc = String(p.descripcion).trim().replace(/\.$/, "");
  const cpo = /\bcpo\b/i.test(nombre) || /\bcpo\b/i.test(desc);
  nombre = nombre.replace(/\bcpo\b/ig, "").replace(/\s+/g, " ").trim()
    .replace(/^ipad/i, "iPad").replace(/^macbook/i, "MacBook").replace(/apple wach/i, "Apple Watch").replace(/^ps5$/i, "PlayStation 5")
    .replace(/^airtags?$/i, "AirTag").replace(/iphone (\d+) e\b/i, "iPhone $1e").replace(/^(\d+ pro( max)?)$/i, "iPhone $1").replace(/^iphone/i, "iPhone");
  const gb = (desc.match(/(\d+)\s*(gb|tb)\b(?!\s*ram)/i) || [])[0];
  const ram = (desc.match(/(\d+)\s*gb\s*ram/i) || [])[1];
  const bateria = (desc.match(/(\d+)%\s*bater/i) || [])[1];
  const pulgadas = /inch/i.test(desc) ? (nombre.match(/\s(1\d)$/) || [])[1] : null;
  const chip = (desc.match(/\b(m\d)\b/i) || [])[1];
  let condicion = /swap/i.test(desc) ? "Swap" : cpo ? "CPO" : /garant[ií]a apple/i.test(desc) ? "Garantía Apple" : "";
  if (/^nintendo$/i.test(nombre) && /switch 2/i.test(desc)) nombre = "Nintendo Switch 2";
  let detalle = [];
  if (/^apple watch$/i.test(nombre)) { const m = desc.replace(/generacion/i, "generación").replace(/^se\b/i, "SE").replace(/^s(\d+)/i, "Series $1").replace(/\s*(\d+)\s*mm$/i, " · $1 mm"); nombre = "Apple Watch " + m.split(" · ")[0]; detalle.push(...m.split(" · ").slice(1)); }
  else {
    if (pulgadas) detalle.push(pulgadas + "″");
    if (chip) detalle.push("Chip " + chip.toUpperCase());
    if (ram) detalle.push(ram + " GB RAM");
    if (gb) detalle.push(gb.replace(/\s*(gb|tb)/i, (_, u) => " " + u.toUpperCase()));
    if (bateria) detalle.push("Batería " + bateria + "%");
    if (/digital/i.test(desc)) detalle.push("Edición digital");
    if (/x4/i.test(desc)) detalle.push("Pack de 4");
    if (/6ta generacion/i.test(nombre)) { nombre = nombre.replace(/6ta generacion/i, "").trim(); detalle.unshift("6.ª generación"); }
  }
  if (pulgadas) nombre = nombre.replace(/\s1\d$/, "") + " " + pulgadas;
  const categoria = /airtag/i.test(nombre) ? "accesorios" : CATEGORIAS[p.categoria] || "otros";
  return { nombre, detalle: detalle.join(" · "), condicion, categoria, usd: p.usd, imagen: fotoDe(nombre) || p.imagen, conAccesorios: categoria === "iphone" };
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
module.exports = { prolijo, csv, catalogo };
