import type { Accion, Datos, Item, LLM, Mensaje, Pagos, Pedido, Producto } from '../tipos.ts';
import { auditar } from '../auditoria.ts';
import { dia, nombre, pesos, sumarDias } from '../util.ts';
import { buscar, parecido } from './catalogo.ts';
import { interpretar, type Intencion } from './intencion.ts';
import { lista, redactar } from './redaccion.ts';
import type { Permitido } from './verificador.ts';

export interface Deps { datos: Datos; pagos: Pagos; llm?: LLM; hoy?: () => string }

/** Un mensaje entrante → acciones propuestas. Precios, stock y totales los calcula el código, nunca el modelo. */
export async function procesar(msg: Mensaje, d: Deps): Promise<Accion[]> {
  const intencion = await interpretar(msg.texto, d.llm);
  await auditar('mensaje', { ...msg, intencion });
  switch (intencion.tipo) {
    case 'reclamo': return [derivar(msg, 'Reclamo o devolución')];
    case 'envio': return [derivar(msg, 'Pregunta de envío o plazos (el agente no promete fechas)')];
    case 'pedido': return confirmar(msg, intencion, d);
    case 'consulta': return consultar(msg, intencion, d);
    default:
      return [await responder(msg, `¡Hola ${nombre(msg.contacto)}! ¿Qué producto buscás? Te paso precio y stock.`, permitir([], []), d, 'respuesta', false)];
  }
}

async function consultar(msg: Mensaje, intencion: Intencion, d: Deps): Promise<Accion[]> {
  const catalogo = await d.datos.catalogo();
  const conStock: Producto[] = [], agotados: Producto[] = [], alternativas: Producto[] = [], opciones: Producto[] = [];
  const cantidades = new Map<string, number>();
  for (const it of intencion.items) {
    const { exacto, opciones: ops } = buscar(it.busqueda, catalogo);
    const ofrecido = !exacto ? undefined : exacto.stock > 0 ? exacto : parecido(exacto, catalogo);
    if (!exacto) opciones.push(...ops);
    else if (exacto.stock > 0) conStock.push(exacto);
    else {
      agotados.push(exacto);
      if (ofrecido) alternativas.push(ofrecido);
    }
    if (ofrecido) cantidades.set(ofrecido.sku, it.cantidad ?? 1);
  }

  const partes = [`¡Hola ${nombre(msg.contacto)}!`];
  if (conStock.length) partes.push(`${lista(conStock, (p) => `${p.producto} a ${pesos(p.precio)}`)}, hay stock.`);
  if (agotados.length) partes.push(`${lista(agotados, (p) => p.producto)} no lo tengo ahora.`);
  if (alternativas.length) partes.push(`Te puedo ofrecer ${lista(alternativas, (p) => `${p.producto} a ${pesos(p.precio)}`)}.`);
  if (opciones.length) partes.push(`Tengo ${lista(opciones, (p) => `${p.producto} (${pesos(p.precio)})`)}. ¿Cuál querés?`);
  else if (conStock.length) partes.push(conStock.length > 1 ? '¿Te los preparo?' : '¿Te lo preparo?');
  else if (alternativas.length) partes.push('¿Te sirve?');
  else partes.push('¿Me decís qué producto buscás? Así te paso precio y stock.');

  const ofrecidos = [...conStock, ...alternativas];
  await guardarConsulta(msg, ofrecidos.map((p) => ({ sku: p.sku, cantidad: cantidades.get(p.sku) ?? 1 })), catalogo, d);
  const permitido = permitir([...ofrecidos, ...agotados, ...opciones], catalogo, agotados.length > 0);
  const auto = ofrecidos.length + agotados.length > 0 && !opciones.length;
  return [await responder(msg, partes.join(' '), permitido, d, 'respuesta', auto)];
}

async function confirmar(msg: Mensaje, intencion: Intencion, d: Deps): Promise<Accion[]> {
  const [catalogo, pedidos] = await Promise.all([d.datos.catalogo(), d.datos.pedidos()]);
  const porSku = new Map(catalogo.map((p) => [p.sku, p]));
  const abierta = pedidos.findLast((p) => p.cliente === msg.contacto && p.canal === msg.canal && p.estado === 'consulta');
  const n = nombre(msg.contacto);

  let items: Item[] = intencion.items.flatMap((it) => {
    const { exacto } = buscar(it.busqueda, catalogo);
    return exacto ? [{ sku: exacto.sku, cantidad: it.cantidad ?? intencion.cantidad ?? 1 }] : [];
  });
  if (!items.length && abierta?.items.length) {
    items = abierta.items.map((i) => ({ ...i, cantidad: abierta.items.length === 1 ? (intencion.cantidad ?? i.cantidad) : i.cantidad }));
  }
  if (!items.length) {
    return [await responder(msg, `¡Dale ${n}! ¿Qué producto querés y cuántos? Así te paso el total.`, permitir([], catalogo), d, 'respuesta', false)];
  }

  const productos = items.map((i) => porSku.get(i.sku)!);
  const faltan = items.filter((i) => porSku.get(i.sku)!.stock < i.cantidad);
  if (faltan.length) {
    const detalle = lista(faltan, (i) => {
      const p = porSku.get(i.sku)!;
      return p.stock ? `de ${p.producto} me quedan ${p.stock}` : `${p.producto} no lo tengo ahora`;
    });
    return [await responder(msg, `${n}, ${detalle}. ¿Te preparo lo que hay?`, permitir(productos, catalogo, true), d, 'respuesta', false)];
  }

  const hoy = (d.hoy ?? dia)();
  const total = items.reduce((s, i) => s + porSku.get(i.sku)!.precio * i.cantidad, 0);
  const pedido: Pedido = { ...(abierta ?? nuevo(msg, pedidos, hoy)), items, total, estado: 'confirmado' };
  for (const i of items) await d.datos.setStock(i.sku, porSku.get(i.sku)!.stock - i.cantidad);

  try {
    pedido.link_pago = await d.pagos.crearLink(pedido, catalogo);
  } catch (e) {
    pedido.notas = `error creando link de pago: ${(e as Error).message}`;
  }
  await d.datos.guardarPedido(pedido);
  await auditar('pedido_confirmado', { id: pedido.id, total, items });
  if (!pedido.link_pago) return [derivar(msg, `Pedido ${pedido.id} confirmado (${pesos(total)}) pero falló el link de pago`)];

  await d.datos.guardarSeguimiento({ pedido_id: pedido.id, proxima_accion: 'recordar_pago:1', fecha: sumarDias(hoy, 1) });
  const detalle = lista(items, (i) => `${i.cantidad} x ${porSku.get(i.sku)!.producto}`);
  const texto = `¡Listo ${n}! ${detalle}, total ${pesos(total)}. Te paso el link de pago: ${pedido.link_pago}`;
  return [await responder(msg, texto, permitir(productos, catalogo, false, [total], [pedido.link_pago]), d, 'cobro', false)];
}

// ── helpers ──────────────────────────────────────────────────────────────────
export function permitir(productos: Producto[], catalogo: Producto[], sinStock = false, montos: number[] = [], urls: string[] = []): Permitido {
  return { productos, catalogo, sinStock, urls, montos: [...montos, ...productos.map((p) => p.precio)] };
}

export async function responder(msg: Mensaje, plantilla: string, permitido: Permitido, d: Deps, motivo: 'respuesta' | 'cobro' | 'seguimiento', auto: boolean): Promise<Accion> {
  const { texto, problemas } = await redactar(plantilla, permitido, d.llm);
  if (problemas.length) await auditar('verificador_rechazo', { contacto: msg.contacto, problemas });
  return { tipo: 'responder', canal: msg.canal, contacto: msg.contacto, texto, motivo, auto };
}

const derivar = (msg: Mensaje, motivo: string): Accion => ({ tipo: 'derivar', canal: msg.canal, contacto: msg.contacto, motivo, texto: msg.texto });

const nuevo = (msg: Mensaje, pedidos: Pedido[], hoy: string): Pedido => ({
  id: `P-${String(pedidos.length + 1).padStart(4, '0')}`, fecha: hoy, cliente: msg.contacto, canal: msg.canal, items: [], total: 0, estado: 'consulta',
});

async function guardarConsulta(msg: Mensaje, items: Item[], catalogo: Producto[], d: Deps) {
  const pedidos = await d.datos.pedidos();
  const abierta = pedidos.findLast((p) => p.cliente === msg.contacto && p.canal === msg.canal && p.estado === 'consulta');
  const precio = new Map(catalogo.map((p) => [p.sku, p.precio]));
  const total = items.reduce((s, i) => s + (precio.get(i.sku) ?? 0) * i.cantidad, 0);
  await d.datos.guardarPedido({ ...(abierta ?? nuevo(msg, pedidos, (d.hoy ?? dia)())), items, total });
}
