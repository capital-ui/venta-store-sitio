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
      ${p.conAccesorios ? '<p class="incluye">Llega con vidrio templado y cable</p>' : ""}
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

/* ---------- Simulador de inversión (6 % mensual en pesos, 3 % en dólares) ---------- */
const TASA = { ARS: 0.06, USD: 0.03 }, MINIMO = { ARS: 3000000, USD: 2000 };
const RAPIDOS = { ARS: [3000000, 5000000, 10000000, 20000000], USD: [2000, 5000, 10000, 20000] };
const sim = { moneda: "ARS", plazo: 12, modo: "cobro", monto: 5000000 };
const fmt = (n, m = sim.moneda) => (m === "ARS" ? pesos(n) : usd(n));
const corto = (n, m = sim.moneda) => m === "ARS" ? (n >= 1e6 ? "$" + (n / 1e6).toLocaleString("es-AR", { maximumFractionDigits: 1 }) + " M" : pesos(n)) : usd(n);

function simular() {
  const { moneda: m, plazo: N, modo, monto } = sim, t = TASA[m];
  document.querySelectorAll(".segmento").forEach(g => g.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(String(sim[g.dataset.grupo]) === b.dataset.valor))));
  $("#simRapidos").innerHTML = RAPIDOS[m].map(v => `<button type="button" data-rapido="${v}" aria-pressed="${v === monto}">${corto(v)}</button>`).join("");
  const bajo = monto < MINIMO[m];
  $("#simError").hidden = !bajo; $("#simError").textContent = bajo ? `El monto mínimo en ${m === "ARS" ? "pesos" : "dólares"} es ${fmt(MINIMO[m])}.` : "";
  const base = Math.max(monto, 0);
  // Mes a mes: capital y ganancia acumulada
  const meses = Array.from({ length: N }, (_, k) => {
    const g = modo === "cobro" ? base * t * (k + 1) : base * (Math.pow(1 + t, k + 1) - 1);
    return { capital: base, ganancia: g };
  });
  const ganancia = meses[N - 1].ganancia, mensual = base * t;
  const cifras = modo === "cobro"
    ? [["Cobrás por mes", fmt(mensual)], [`Ganancia en ${N} meses`, fmt(ganancia)], ["Al final", `recuperás ${fmt(base)}`]]
    : [["Ganancia el primer mes", fmt(mensual)], [`Ganancia en ${N} meses`, fmt(ganancia)], ["Terminás con", fmt(base + ganancia)]];
  $("#simCifras").innerHTML = cifras.map(([e, v], i) => `<div class="${i === 1 ? "destacada" : ""}"><span>${e}</span><b>${v}</b></div>`).join("");
  const tope = base + ganancia || 1;
  $("#simGrafico").innerHTML = meses.map((x, k) => `<div class="barra" title="Mes ${k + 1}: ${fmt(x.capital + x.ganancia)}"><i class="gan" style="height:${(x.ganancia / tope) * 100}%"></i><i class="cap" style="height:${(x.capital / tope) * 100}%"></i>${(k + 1) % (N > 12 ? 6 : 3) === 0 ? `<em>${k + 1}</em>` : ""}</div>`).join("");
  const texto = `Hola, quiero invertir en Venta Store.\nMonto: ${fmt(base)}\nPlazo: ${N} meses\n${modo === "cobro" ? "Quiero cobrar la ganancia cada mes" : "Quiero reinvertir la ganancia"}\nTasa: ${Math.round(t * 100)} % mensual en ${m === "ARS" ? "pesos" : "dólares"}`;
  const wa = $("#simWa"); wa.textContent = bajo ? "Quiero invertir" : `Quiero invertir ${fmt(base)}`;
  wa.href = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(texto)}`;
}
function ponerMonto(v) { sim.monto = v; $("#simMonto").value = v ? Number(v).toLocaleString("es-AR") : ""; simular(); }
$("#simMonto").addEventListener("input", ev => { const d = ev.target.value.replace(/\D/g, "").slice(0, 12); sim.monto = Number(d) || 0; ev.target.value = d ? Number(d).toLocaleString("es-AR") : ""; simular(); });
document.querySelector(".sim-controles").addEventListener("click", ev => {
  const r = ev.target.closest("[data-rapido]"); if (r) return ponerMonto(Number(r.dataset.rapido));
  const b = ev.target.closest(".segmento button"); if (!b) return;
  const g = b.parentElement.dataset.grupo;
  if (g === "moneda") { sim.moneda = b.dataset.valor; return ponerMonto(RAPIDOS[sim.moneda][1]); }
  sim[g] = g === "plazo" ? Number(b.dataset.valor) : b.dataset.valor; simular();
});
ponerMonto(sim.monto);
iniciar();
