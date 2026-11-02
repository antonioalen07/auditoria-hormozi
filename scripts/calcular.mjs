#!/usr/bin/env node
// Calcula los números que usa Hormozi, con la cuenta escrita, para no equivocarse a mano.
//
//   node scripts/calcular.mjs '{"ingresos":[18200,19100],"pedidos":[260,270],"anuncios":[4800,5200],
//     "clientes_nuevos":[190,195],"margen_bruto":0.42,"pedidos_por_cliente":1.25,"gastos_fijos":4200,"caja":9000}'
//
// Todos los campos son opcionales: calcula lo que se pueda con lo que haya.
// Los arrays son meses, del más viejo al más nuevo. Montos en una sola moneda.
const d = JSON.parse(process.argv.slice(2).join(" ") || "{}");
const sum = (a) => (Array.isArray(a) ? a.reduce((x, y) => x + Number(y || 0), 0) : Number(a || 0));
const last = (a) => (Array.isArray(a) ? Number(a.at(-1)) : Number(a));
const first = (a) => (Array.isArray(a) ? Number(a[0]) : Number(a));
const n = (x, dec = 2) => Number(x).toLocaleString("es-AR", { maximumFractionDigits: dec, minimumFractionDigits: 0 });
const out = {};
const put = (k, valor, cuenta) => { if (Number.isFinite(valor)) out[k] = { valor: Math.round(valor * 100) / 100, cuenta }; };

if (d.ingresos && d.pedidos) put("ticket_promedio", sum(d.ingresos) / sum(d.pedidos), `${n(sum(d.ingresos))} / ${n(sum(d.pedidos))}`);
if (out.ticket_promedio && d.margen_bruto) put("ganancia_bruta_por_pedido", out.ticket_promedio.valor * d.margen_bruto, `${n(out.ticket_promedio.valor)} x ${d.margen_bruto}`);
if (d.anuncios && d.clientes_nuevos) put("cac", sum(d.anuncios) / sum(d.clientes_nuevos), `${n(sum(d.anuncios))} / ${n(sum(d.clientes_nuevos))}`);
if (d.cac) put("cac", Number(d.cac), "dato");
if (out.ganancia_bruta_por_pedido && d.pedidos_por_cliente) put("ltv_ganancia_bruta", out.ganancia_bruta_por_pedido.valor * d.pedidos_por_cliente, `${n(out.ganancia_bruta_por_pedido.valor)} x ${d.pedidos_por_cliente}`);
if (d.ltv_ganancia_bruta) put("ltv_ganancia_bruta", Number(d.ltv_ganancia_bruta), "dato");
if (out.ltv_ganancia_bruta && out.cac) put("ltv_cac", out.ltv_ganancia_bruta.valor / out.cac.valor, `${n(out.ltv_ganancia_bruta.valor)} / ${n(out.cac.valor)} (piso de Hormozi: 3 a 1)`);
const gp30 = d.ganancia_30_dias ?? out.ganancia_bruta_por_pedido?.valor;
if (gp30 && out.cac) put("caja_30_dias_vs_cac", gp30 / out.cac.valor, `${n(gp30)} / ${n(out.cac.valor)} (Hormozi pide más de 2 veces el CAC más el costo de entrega)`);
if (d.ingresos && d.margen_bruto) {
  const gb = last(d.ingresos) * d.margen_bruto;
  const ads = d.anuncios ? last(d.anuncios) : 0;
  const fijos = Number(d.gastos_fijos || 0);
  put("resultado_ultimo_mes", gb - ads - fijos, `${n(last(d.ingresos))} x ${d.margen_bruto} = ${n(gb)}; ${n(gb)} - ${n(ads)} anuncios - ${n(fijos)} fijos`);
  if (out.resultado_ultimo_mes.valor < 0 && d.caja) put("meses_de_caja", d.caja / -out.resultado_ultimo_mes.valor, `${n(d.caja)} / ${n(-out.resultado_ultimo_mes.valor)}`);
}
if (Array.isArray(d.ingresos) && d.ingresos.length > 1) put("variacion_ingresos", last(d.ingresos) / first(d.ingresos) - 1, `${n(last(d.ingresos))} / ${n(first(d.ingresos))} - 1`);
if (Array.isArray(d.anuncios) && d.anuncios.length > 1) put("variacion_anuncios", last(d.anuncios) / first(d.anuncios) - 1, `${n(last(d.anuncios))} / ${n(first(d.anuncios))} - 1`);
if (d.descuento && out.ticket_promedio && d.margen_bruto) {
  const costo = out.ticket_promedio.valor * (1 - d.margen_bruto);
  put("ganancia_por_pedido_con_descuento", out.ticket_promedio.valor * (1 - d.descuento) - costo, `${n(out.ticket_promedio.valor)} x ${1 - d.descuento} - ${n(costo)} de costo`);
}
console.log(JSON.stringify(out, null, 2));
