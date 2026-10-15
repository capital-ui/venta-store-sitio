"use strict";
/* Catálogo y pedido por WhatsApp de Venta Store. */
const WHATSAPP = "5493764586667";
const CATEGORIAS = [["todos", "Todos"], ["iphone", "iPhone"], ["ipad", "iPad"], ["mac", "MacBook"], ["watch", "Apple Watch"], ["consolas", "Consolas"], ["accesorios", "Accesorios"]];
const CONDICIONES = { "Swap": "swap", "CPO": "cpo", "Garantía Apple": "apple" };
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const miles = n => Math.round(n).toLocaleString("es-AR");
const usd = n => miles(n) + " USD";
const pesos = n => "$" + miles(n);

let datos = { dolar: 0, productos: [] }, filtro = "todos", condicion = "", texto = "";
let pedido = leer();

function leer() { try { return JSON.parse(localStorage.getItem("vs-pedido") || "[]").filter(x => x && x.clave && x.cant > 0); } catch { return []; } }
function guardar() { try { localStorage.setItem("vs-pedido", JSON.stringify(pedido)); } catch {} }
const clave = p => [p.nombre, p.condicion, p.detalle].join("|");

async function iniciar() {
  try {
    const r = await fetch("/api/catalogo"); if (!r.ok) throw 0;
    datos = await r.json();
  } catch { $("#grilla").innerHTML = '<p class="sin-resultados">No pudimos cargar el catálogo. Escribinos por WhatsApp y te pasamos los precios.</p>'; return; }
  datos.productos.forEach((p, i) => { p.id = i; p.clave = clave(p); });
  if (datos.dolar > 0) {
    $("#dolarPortada").innerHTML = `Dólar de hoy: <b>$${miles(datos.dolar)}</b>`; $("#dolarPortada").hidden = false;
    $("#catalogoSub").textContent = `${datos.productos.length} equipos. Precios en dólares y en pesos al dólar de hoy ($${miles(datos.dolar)}).`;
  }
  // Lo que quedó en el pedido se actualiza con los precios de hoy
  pedido = pedido.map(x => { const p = datos.productos.find(q => q.clave === x.clave); return p ? { ...x, usd: p.usd, imagen: p.imagen } : null; }).filter(Boolean);
  pintarFiltros(); pintar(); pintarPedido(); datosEstructurados();
}

function pintarFiltros() {
  const hay = new Set(datos.productos.map(p => p.categoria));
  $("#filtros").innerHTML = CATEGORIAS.filter(([id]) => id === "todos" || hay.has(id)).map(([id, et]) => `<button type="button" data-cat="${id}" aria-pressed="${filtro === id}">${et}</button>`).join("");
  const conds = [...new Set(datos.productos.filter(p => p.categoria === "iphone").map(p => p.condicion).filter(Boolean))];
  $("#filtrosCond").hidden = filtro !== "iphone" || conds.length < 2;
  $("#filtrosCond").innerHTML = [["", "Todas las condiciones"], ...conds.map(c => [c, c])].map(([id, et]) => `<button type="button" data-cond="${esc(id)}" aria-pressed="${condicion === id}">${esc(et)}</button>`).join("");
}

function tarjeta(p) {
  const enPedido = pedido.find(x => x.clave === p.clave);
  return `<article class="tarjeta">
    <div class="foto">${p.imagen ? `<img src="${esc(p.imagen)}" alt="${esc(p.nombre)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ""}${p.condicion ? `<span class="pill ${CONDICIONES[p.condicion] || ""}">${esc(p.condicion)}</span>` : ""}</div>
    <div class="info">
      <h3>${esc(p.nombre)}</h3>
      ${p.detalle ? `<p class="detalle">${esc(p.detalle)}</p>` : ""}
      ${p.conAccesorios ? '<p class="incluye">Llega con funda, vidrio, cargador y AirPods</p>' : ""}
      <p class="precio">${usd(p.usd)}</p>
      ${datos.dolar > 0 ? `<p class="pesos">${pesos(p.usd * datos.dolar)} al dólar de hoy</p>` : ""}
      <p class="cuota-nota">o en cuotas sin tarjeta, en Posadas</p>
      <button class="btn pri${enPedido ? " sumado" : ""}" type="button" data-sumar="${p.id}">${enPedido ? `En el pedido (${enPedido.cant})` : "Sumar al pedido"}</button>
    </div></article>`;
}

function pintar() {
  const q = texto.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const lista = datos.productos.filter(p => (filtro === "todos" || p.categoria === filtro) && (!condicion || p.condicion === condicion)
    && (!q || [p.nombre, p.detalle, p.condicion].join(" ").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(q)));
  $("#grilla").innerHTML = lista.length ? lista.map(tarjeta).join("") : `<p class="sin-resultados">No encontramos “${esc(texto)}”. Escribinos por WhatsApp: si no está publicado, lo conseguimos.</p>`;
}

/* ---------- Pedido ---------- */
function sumar(id) {
  const p = datos.productos[id]; if (!p) return;
  const x = pedido.find(i => i.clave === p.clave);
  if (x) x.cant++; else pedido.push({ clave: p.clave, nombre: p.nombre, condicion: p.condicion, detalle: p.detalle, usd: p.usd, imagen: p.imagen, cant: 1 });
  guardar(); pintar(); pintarPedido();
}
function cambiar(k, d) { const x = pedido.find(i => i.clave === k); if (!x) return; x.cant += d; pedido = pedido.filter(i => i.cant > 0); guardar(); pintar(); pintarPedido(); }

function mensaje() {
  const lineas = pedido.map(x => `· ${[x.nombre, x.condicion, x.detalle].filter(Boolean).join(" · ")}${x.cant > 1 ? ` × ${x.cant}` : ""}\n  ${usd(x.usd * x.cant)}`);
  const total = pedido.reduce((a, x) => a + x.usd * x.cant, 0);
  const envio = $("#envio").value.trim(), nombre = $("#nombre").value.trim();
  return [nombre ? `Hola, soy ${nombre}. Quiero pedir:` : "Hola, quiero pedir:", ...lineas, "",
    `Total: ${usd(total)}${datos.dolar > 0 ? ` · ${pesos(total * datos.dolar)} al dólar de hoy` : ""}`,
    `Pago: ${$("#pago").value.toLowerCase()}`, `Envío a: ${envio || "a confirmar"}`].join("\n");
}

function pintarPedido() {
  const n = pedido.reduce((a, x) => a + x.cant, 0), total = pedido.reduce((a, x) => a + x.usd * x.cant, 0);
  document.querySelectorAll(".contador").forEach(c => { c.textContent = n; c.hidden = !n; });
  document.body.classList.toggle("con-pedido", n > 0);
  $("#items").innerHTML = pedido.map(x => `<li>${x.imagen ? `<img src="${esc(x.imagen)}" alt="" referrerpolicy="no-referrer">` : "<span></span>"}<div><b>${esc(x.nombre)}</b><small>${esc([x.condicion, x.detalle].filter(Boolean).join(" · "))}</small><small style="display:block">${usd(x.usd * x.cant)}</small></div>
    <div class="cant"><button type="button" data-menos="${esc(x.clave)}" aria-label="Uno menos">−</button><span>${x.cant}</span><button type="button" data-mas="${esc(x.clave)}" aria-label="Uno más">+</button></div></li>`).join("");
  $("#vacio").hidden = n > 0; $("#datosPedido").hidden = !n;
  $("#total").innerHTML = n ? `${usd(total)}${datos.dolar > 0 ? `<small>${pesos(total * datos.dolar)} al dólar de hoy</small>` : ""}` : "";
  const b = $("#barraPedido"); b.hidden = !n; b.textContent = `Ver mi pedido (${n}) · ${usd(total)}`;
  actualizarEnlace();
}
function actualizarEnlace() {
  const a = $("#enviar"), n = pedido.length;
  a.setAttribute("aria-disabled", String(!n));
  a.href = n ? `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(mensaje())}` : "#";
}
function abrir(si) {
  $("#pedido").classList.toggle("abierto", si); $("#pedido").setAttribute("aria-hidden", String(!si)); $("#fondo").hidden = !si;
  document.body.style.overflow = si ? "hidden" : "";
  if (si) setTimeout(() => $("#pedido .cerrar").focus(), 50);
}

/* ---------- Datos para Google (productos con precio) ---------- */
function datosEstructurados() {
  const s = document.createElement("script"); s.type = "application/ld+json";
  s.textContent = JSON.stringify({ "@context": "https://schema.org", "@type": "ItemList", itemListElement: datos.productos.slice(0, 60).map((p, i) => ({ "@type": "ListItem", position: i + 1,
    item: { "@type": "Product", name: [p.nombre, p.detalle].filter(Boolean).join(" "), image: p.imagen || undefined, brand: { "@type": "Brand", name: /playstation/i.test(p.nombre) ? "Sony" : /nintendo/i.test(p.nombre) ? "Nintendo" : "Apple" },
      itemCondition: p.condicion === "Garantía Apple" ? "https://schema.org/NewCondition" : "https://schema.org/RefurbishedCondition",
      offers: { "@type": "Offer", price: p.usd, priceCurrency: "USD", availability: "https://schema.org/InStock", url: "https://ventastore.store/#catalogo" } } })) });
  document.head.appendChild(s);
}

/* ---------- Eventos ---------- */
document.addEventListener("click", ev => {
  const t = ev.target.closest("[data-cat],[data-cond],[data-sumar],[data-mas],[data-menos],[data-abrir-pedido],[data-cerrar-pedido],#fondo");
  if (!t) return;
  if (t.dataset.cat) { filtro = t.dataset.cat; condicion = ""; pintarFiltros(); pintar(); }
  else if (t.dataset.cond !== undefined) { condicion = t.dataset.cond; pintarFiltros(); pintar(); }
  else if (t.dataset.sumar !== undefined) sumar(+t.dataset.sumar);
  else if (t.dataset.mas) cambiar(t.dataset.mas, 1);
  else if (t.dataset.menos) cambiar(t.dataset.menos, -1);
  else if (t.hasAttribute("data-abrir-pedido")) abrir(true);
  else abrir(false);
});
document.addEventListener("keydown", ev => { if (ev.key === "Escape" && $("#pedido").classList.contains("abierto")) abrir(false); });
$("#buscar").addEventListener("input", ev => { texto = ev.target.value; pintar(); });
["#pago", "#envio", "#nombre"].forEach(s => $(s).addEventListener("input", actualizarEnlace));
$("#pago").addEventListener("change", actualizarEnlace);
iniciar();
