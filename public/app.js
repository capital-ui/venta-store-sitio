"use strict";
/* Catálogo y pedido por WhatsApp de Venta Store. */
const WHATSAPP = "5493764586667";
const DESC_EFECTIVO = 20; // USD menos por equipo pagando en efectivo
const sellado = p => p.condicion === "Garantía Apple"; // el descuento en efectivo es solo para sellados
const enEfectivo = () => /efectivo/i.test($("#pago").value);
const CATEGORIAS = [["todos", "Todos"], ["iphone", "iPhone"], ["ipad", "iPad"], ["mac", "MacBook"], ["watch", "Apple Watch"], ["consolas", "Consolas"], ["lentes", "Lentes"], ["accesorios", "Accesorios"]];
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
  pedido = pedido.map(x => { const p = datos.productos.find(q => q.clave === x.clave); return p ? { ...x, usd: p.usd, imagen: p.imagen, consultarColor: p.consultarColor } : null; }).filter(Boolean);
  pintarFiltros(); pintar(); pintarPedido(); datosEstructurados();
}

function pintarFiltros() {
  const hay = new Set(datos.productos.map(p => p.categoria));
  $("#filtros").innerHTML = CATEGORIAS.filter(([id]) => id === "todos" || hay.has(id)).map(([id, et]) => `<button type="button" data-cat="${id}" aria-pressed="${filtro === id}">${et}</button>`).join("");
  const conds = [...new Set(datos.productos.filter(p => p.categoria === "iphone").map(p => p.condicion).filter(Boolean))];
  $("#filtrosCond").hidden = filtro !== "iphone" || conds.length < 2;
  $("#filtrosCond").innerHTML = [["", "Todas las condiciones"], ...conds.map(c => [c, c])].map(([id, et]) => `<button type="button" data-cond="${esc(id)}" aria-pressed="${condicion === id}">${esc(et)}</button>`).join("");
}

function enlaceCuotas(p) {
  const texto = [`¡Hola Venta Store! Me interesa el *${p.nombre}* en cuotas sin tarjeta.`,
    `${[p.detalle, p.condicion].filter(Boolean).join(" · ")}${p.detalle || p.condicion ? " · " : ""}${usd(p.usd)}`,
    p.consultarColor ? "Color: a consultar" : "", "",
    "Cuánto puedo dejar de entrega: ", "Soy de Posadas: sí / no", "", "¿Qué plan me pueden ofrecer?"].filter((l, i) => l || i > 2).join("\n");
  return `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(texto)}`;
}
function tarjeta(p) {
  const enPedido = pedido.find(x => x.clave === p.clave);
  return `<article class="tarjeta">
    <div class="foto">${p.imagen ? `<img src="${esc(p.imagen)}" alt="${esc(p.nombre)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ""}${p.condicion ? `<span class="pill ${CONDICIONES[p.condicion] || ""}">${esc(p.condicion)}</span>` : ""}</div>
    <div class="info">
      <h3>${esc(p.nombre)}</h3>
      ${p.detalle ? `<p class="detalle">${esc(p.detalle)}</p>` : ""}
      ${p.consultarColor ? '<p class="colores">Consultá colores disponibles</p>' : ""}
      ${p.conAccesorios ? '<p class="incluye">Llega con vidrio templado, funda, cable y auriculares de regalo</p>' : ""}
      <p class="precio">${usd(p.usd)}</p>
      ${sellado(p) ? `<p class="efectivo">${usd(p.usd - DESC_EFECTIVO)} en efectivo</p>` : ""}
      ${datos.dolar > 0 ? `<p class="pesos">${pesos(p.usd * datos.dolar)} al dólar de hoy</p>` : ""}
      <p class="envio-gratis">Envío gratis a todo el país</p>
      <p class="cuota-nota"><a href="${enlaceCuotas(p)}" target="_blank" rel="noopener">o en cuotas sin tarjeta, en Posadas ›</a></p>
      <button class="btn pri${enPedido ? " sumado" : ""}" type="button" data-sumar="${p.id}">${enPedido ? `En el pedido (${enPedido.cant})` : "Sumar al pedido"}</button>
    </div></article>`;
}

// Se muestran unos pocos equipos y un botón para ver el resto (en el celular la página quedaba muy larga)
const CUANTOS = () => (innerWidth <= 520 ? 8 : 12);
let mostrar = CUANTOS(), vistaAnterior = "";
function pintar() {
  const vista = [filtro, condicion, texto].join("|");
  if (vista !== vistaAnterior) { mostrar = CUANTOS(); vistaAnterior = vista; }
  const q = texto.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const lista = datos.productos.filter(p => (filtro === "todos" || p.categoria === filtro) && (!condicion || p.condicion === condicion)
    && (!q || [p.nombre, p.detalle, p.condicion].join(" ").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(q)));
  $("#grilla").innerHTML = lista.length ? lista.slice(0, mostrar).map(tarjeta).join("") : `<p class="sin-resultados">No encontramos “${esc(texto)}”. Escribinos por WhatsApp: si no está publicado, lo conseguimos.</p>`;
  const resto = lista.length - mostrar, ver = $("#verMas");
  ver.hidden = resto <= 0; ver.textContent = `Ver más equipos (${resto})`;
}

/* ---------- Pedido ---------- */
function sumar(id) {
  const p = datos.productos[id]; if (!p) return;
  const x = pedido.find(i => i.clave === p.clave);
  if (x) x.cant++; else pedido.push({ clave: p.clave, nombre: p.nombre, condicion: p.condicion, detalle: p.detalle, consultarColor: p.consultarColor, usd: p.usd, imagen: p.imagen, cant: 1 });
  guardar(); pintar(); pintarPedido();
}
function cambiar(k, d) { const x = pedido.find(i => i.clave === k); if (!x) return; x.cant += d; pedido = pedido.filter(i => i.cant > 0); guardar(); pintar(); pintarPedido(); }

function mensaje() {
  const total = pedido.reduce((a, x) => a + x.usd * x.cant, 0), desc = descuento(), final = total - desc;
  const envio = $("#envio").value.trim(), nombre = $("#nombre").value.trim();
  const items = pedido.map((x, i) => [
    `${i + 1}) *${x.nombre}*${x.cant > 1 ? ` × ${x.cant}` : ""}`,
    [x.detalle, x.condicion].filter(Boolean).length ? `   ${[x.detalle, x.condicion].filter(Boolean).join(" · ")}` : "",
    x.consultarColor ? "   Color: a consultar" : "",
    `   ${usd(x.usd * x.cant)}`].filter(Boolean).join("\n"));
  return [`¡Hola Venta Store! ${nombre ? `Soy ${nombre}. ` : ""}Quiero hacer este pedido:`, "", ...items, "",
    ...(desc ? [`Subtotal: ${usd(total)}`, `Descuento en efectivo (sellados): −${usd(desc)}`] : []),
    `*Total: ${usd(final)}*${datos.dolar > 0 ? ` (${pesos(final * datos.dolar)} al dólar de hoy)` : ""}`,
    `Pago: ${$("#pago").value}`, `Envío: ${envio || "a confirmar"}`, "",
    "¿Me confirman disponibilidad? ¡Gracias!"].join("\n");
}
function descuento() { return enEfectivo() ? pedido.reduce((a, x) => a + (sellado(x) ? DESC_EFECTIVO * x.cant : 0), 0) : 0; }

function pintarPedido() {
  const n = pedido.reduce((a, x) => a + x.cant, 0), total = pedido.reduce((a, x) => a + x.usd * x.cant, 0);
  document.querySelectorAll(".contador").forEach(c => { c.textContent = n; c.hidden = !n; });
  document.body.classList.toggle("con-pedido", n > 0);
  $("#items").innerHTML = pedido.map(x => `<li>${x.imagen ? `<img src="${esc(x.imagen)}" alt="" referrerpolicy="no-referrer">` : "<span></span>"}<div><b>${esc(x.nombre)}</b><small>${esc([x.condicion, x.detalle].filter(Boolean).join(" · "))}</small><small style="display:block">${usd(x.usd * x.cant)}</small></div>
    <div class="cant"><button type="button" data-menos="${esc(x.clave)}" aria-label="Uno menos">−</button><span>${x.cant}</span><button type="button" data-mas="${esc(x.clave)}" aria-label="Uno más">+</button></div></li>`).join("");
  $("#vacio").hidden = n > 0; $("#datosPedido").hidden = !n;
  const desc = descuento(), final = total - desc;
  $("#total").innerHTML = n ? `${desc ? `<s>${usd(total)}</s>` : ""}${usd(final)}${desc ? `<small class="ahorro">Ahorrás ${usd(desc)} pagando en efectivo</small>` : ""}${datos.dolar > 0 ? `<small>${pesos(final * datos.dolar)} al dólar de hoy</small>` : ""}` : "";
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
$("#verMas").addEventListener("click", () => { mostrar = Infinity; pintar(); });
document.addEventListener("keydown", ev => { if (ev.key === "Escape" && $("#pedido").classList.contains("abierto")) abrir(false); });
$("#buscar").addEventListener("input", ev => { texto = ev.target.value; pintar(); });
["#envio", "#nombre"].forEach(s => $(s).addEventListener("input", actualizarEnlace));
$("#pago").addEventListener("change", pintarPedido);

/* ---------- Simulador de inversión (5 % mensual en pesos, 2,5 % en dólares) ---------- */
const TASA = { ARS: 0.05, USD: 0.025 }, MINIMO = { ARS: 3000000, USD: 2000 };
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
  const texto = `Hola, quiero invertir en Venta Store.\nMonto: ${fmt(base)}\nPlazo: ${N} meses\n${modo === "cobro" ? "Quiero cobrar la ganancia cada mes" : "Quiero reinvertir la ganancia"}\nTasa: ${(t * 100).toLocaleString("es-AR")} % mensual en ${m === "ARS" ? "pesos" : "dólares"}`;
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

/* ---------- Cotizador de usados (sección #usados; valores de la pestaña "Usados" de la planilla) ----------
   Nuevo/sellado + caja + batería 90-100 % + nunca reparado: se compara con Garantía Apple (costo − 100).
   Si no: se compara con Swap (costo − 100). Batería 85-89 %: −15; menor a 85 %: −30.
   Rayones o marcas: −30. Tapa trasera trizada: −25. Reparado con piezas no originales: −50.
   Pantalla trizada o algo que no funciona: se cotiza en persona. Con iCloud bloqueado no se toma.
   (Valores intermedios entre lo que usaba Venta Store y lo que descuenta el mercado.) */
const USADO_BATERIA_MEDIA = 15, USADO_BATERIA_BAJA = 30, USADO_DETALLES = 30, USADO_TRIZADO = 25, USADO_REPARADO = 50;
(async () => {
  let lista = [];
  try { lista = (await (await fetch("/api/usados")).json()).usados || []; } catch {}
  // ?demo-usados muestra el cotizador con precios de ejemplo (para verlo antes de cargar la pestaña Usados)
  if (!lista.length && /demo-usados/.test(location.search)) lista = [{ modelo: "iPhone 13", capacidad: "128 GB", original: 200, swap: 100 }, { modelo: "iPhone 14 Pro", capacidad: "128 GB", original: 420, swap: 300 }, { modelo: "iPhone 15", capacidad: "128 GB", original: 450, swap: 320 }];
  if (!lista.length) return; // sin tabla no se muestra la sección y queda el botón de WhatsApp de siempre
  $("#usados").hidden = false; $("#navUsados").hidden = false;
  $("#uTexto").textContent = "Lo tomamos en parte de pago. Cotizalo acá mismo en un minuto.";
  const ir = $("#uIr"); ir.href = "#usados"; ir.removeAttribute("target"); ir.textContent = "Cotizar mi usado";
  const mod = $("#uModelo"), cap = $("#uCapacidad"), bat = $("#uBateria"), est = $("#uEstado"), valor = $("#uValor"), detalle = $("#uDetalle"), enviar = $("#uEnviar");
  const llevarBox = $("#uLlevarBox"), llevar = $("#uLlevar"), dif = $("#uDif");
  // Equipos para llevarse: los del catálogo (se cargan aparte; se llenan cuando están)
  const nombreProd = p => [p.nombre, p.detalle, p.condicion].filter(Boolean).join(" · ");
  const llenarLlevar = () => {
    if (!datos.productos.length || llevar.options.length) return;
    const grupos = CATEGORIAS.filter(([id]) => id !== "todos").map(([id, et]) => [et, datos.productos.filter(p => p.categoria === id)]).filter(([, l]) => l.length);
    llevar.innerHTML = '<option value="">Elegí el equipo</option>' + grupos.map(([et, l]) => `<optgroup label="${esc(et)}">${l.map(p => `<option value="${p.id}">${esc(nombreProd(p))} — ${usd(p.usd)}</option>`).join("")}</optgroup>`).join("");
  };
  const chk = { swap: $("#cSwap"), funciona: $("#cFunciona"), faceid: $("#cFaceId"), original: $("#cOriginal"), icloud: $("#cIcloud"), caja: $("#cCaja") };
  const modelos = [...new Set(lista.map(u => u.modelo))];
  mod.innerHTML = '<option value="">Elegí tu modelo</option>' + modelos.map(m => `<option>${esc(m)}</option>`).join("") + '<option value="otro">Otro modelo</option>';
  const capacidades = () => {
    const c = lista.filter(u => u.modelo === mod.value);
    cap.innerHTML = c.length ? c.map(u => `<option>${esc(u.capacidad)}</option>`).join("") : '<option value="">—</option>';
    cap.disabled = !c.length;
  };
  // Devuelve { v, lineas } con el valor y cómo se llegó, o { aviso } cuando no se puede dar precio
  const cotizar = () => {
    if (!chk.icloud.checked) return { aviso: "Con bloqueo de iCloud o sin liberar no lo podemos tomar." };
    if (est.value === "pantalla") return { aviso: "Con la pantalla trizada lo tenemos que ver para cotizarlo." };
    if (!chk.funciona.checked || !chk.faceid.checked) return { aviso: "Si algo no funciona, lo tenemos que ver para cotizarlo." };
    const u = lista.find(x => x.modelo === mod.value && x.capacidad === cap.value), b = Number(bat.value);
    if (!b) return { aviso: "Poné el % de batería para ver cuánto vale." };
    if (!u) return { aviso: "Lo tenemos que ver para cotizarlo." };
    const comoNuevo = !chk.swap.checked && chk.caja.checked && chk.original.checked && b >= 90 && u.original;
    const lineas = [];
    let v;
    if (comoNuevo) { v = u.original; lineas.push(["Comprado sellado, con caja y batería 90 % o más", usd(v)]); }
    else if (u.swap) {
      v = u.swap; lineas.push([chk.swap.checked ? "Valor como Swap" : "Valor como Swap (sin caja, batería menor a 90 % o reparado)", usd(v)]);
      if (b < 85) { v -= USADO_BATERIA_BAJA; lineas.push([`Batería ${b} %`, "−" + usd(USADO_BATERIA_BAJA)]); }
      else if (b < 90) { v -= USADO_BATERIA_MEDIA; lineas.push([`Batería ${b} %`, "−" + usd(USADO_BATERIA_MEDIA)]); }
    } else return { aviso: "Este caso te lo cotizamos por WhatsApp: tocá el botón y te respondemos enseguida." };
    if (est.value === "detalles") { v -= USADO_DETALLES; lineas.push(["Rayones o marcas", "−" + usd(USADO_DETALLES)]); }
    if (est.value === "trizado") { v -= USADO_TRIZADO; lineas.push(["Tapa trasera trizada", "−" + usd(USADO_TRIZADO)]); }
    if (!chk.original.checked) { v -= USADO_REPARADO; lineas.push(["Reparado con piezas no originales", "−" + usd(USADO_REPARADO)]); }
    return v > 0 ? { v, lineas } : { aviso: "Lo tenemos que ver para cotizarlo." };
  };
  const calcular = () => {
    const elegido = mod.value && mod.value !== "otro", r = elegido ? cotizar() : {};
    valor.innerHTML = r.v ? `<span>Te lo tomamos en</span><b>${usd(r.v)}</b>`
      : `<span>${!mod.value ? "Elegí tu modelo para ver cuánto vale." : mod.value === "otro" ? "Contanos qué equipo es y te lo cotizamos." : r.aviso}</span>`;
    valor.classList.toggle("con-precio", !!r.v);
    detalle.innerHTML = r.v ? r.lineas.map(([t, m]) => `<li><span>${esc(t)}</span><b>${m}</b></li>`).join("") : "";
    // Equipo que se lleva y diferencia a poner (sobre el precio publicado)
    llenarLlevar(); llevarBox.hidden = !r.v;
    const prod = r.v && llevar.value !== "" ? datos.productos[Number(llevar.value)] : null;
    const resta = prod ? prod.usd - r.v : 0;
    dif.innerHTML = !prod ? "" : resta > 0
      ? `<span>Ponés de diferencia</span><b>${usd(resta)}</b>${datos.dolar > 0 ? `<small>${pesos(resta * datos.dolar)} al dólar de hoy</small>` : ""}${sellado(prod) && resta > DESC_EFECTIVO ? `<small class="ahorro">En efectivo: ${usd(resta - DESC_EFECTIVO)}</small>` : ""}<small>También en cuotas sin tarjeta, en Posadas</small>`
      : `<span>Tu usado cubre el equipo.</span><small>Escribinos y lo confirmamos.</small>`;
    const si = c => c.checked ? "Sí" : "No";
    const texto = ["¡Hola Venta Store! Quiero entregar mi usado en parte de pago.", "",
      `Equipo: ${elegido ? `${mod.value} ${cap.value}`.trim() : "(escribí tu modelo y capacidad)"}`,
      `Swap o reacondicionado: ${si(chk.swap)}`, `Batería: ${bat.value ? bat.value + " %" : ""}`, `Pantalla y cuerpo: ${est.selectedOptions[0].text}`,
      `Funciona todo: ${si(chk.funciona)} · Face ID: ${si(chk.faceid)}`, `Nunca reparado: ${si(chk.original)} · Sin iCloud: ${si(chk.icloud)} · Caja: ${si(chk.caja)}`,
      r.v ? `Valor estimado en el sitio: ${usd(r.v)}` : null,
      prod ? "" : null, prod ? `Me quiero llevar: *${nombreProd(prod)}* (${usd(prod.usd)})` : null,
      prod && resta > 0 ? `Diferencia a poner: ${usd(resta)}` : null,
      "", prod ? "¿Me confirman disponibilidad? ¡Gracias!" : "¿Qué equipo me puedo llevar?"].filter(l => l !== null).join("\n");
    enviar.href = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(texto)}`;
    // Con precio, el botón aparece recién cuando elige qué se lleva; sin precio, queda para consultar
    enviar.hidden = (!!r.v && !prod) || (elegido && !bat.value && chk.icloud.checked && chk.funciona.checked && chk.faceid.checked && est.value !== "pantalla");
    enviar.textContent = r.v ? "Enviar por WhatsApp" : mod.value ? "Consultar por WhatsApp" : "Elegí tu modelo";
  };
  // Sin modelo elegido, el botón lleva al formulario en vez de abrir WhatsApp
  enviar.addEventListener("click", e => { if (!mod.value) { e.preventDefault(); mod.focus(); mod.scrollIntoView({ block: "center", behavior: "smooth" }); } });
  mod.addEventListener("change", () => { capacidades(); calcular(); });
  [cap, est, llevar, ...Object.values(chk)].forEach(e => e.addEventListener("change", calcular)); bat.addEventListener("input", calcular);
  capacidades(); calcular();
})();
