import type { Pedido } from '../tipos.ts';
import { auditar } from '../auditoria.ts';
import { permitir, responder } from '../agente/pipeline.ts';
import { dia, nombre, pesos, sumarDias } from '../util.ts';
import { ejecutar, type Entorno } from './ciclo.ts';

const MAX_RECORDATORIOS = Number(process.env.MAX_RECORDATORIOS ?? 2);

/** 20:00 — concilia pagos, manda el informe del día y propone recordatorios a los que no pagaron (con tope anti-spam). */
export async function cierreDelDia(e: Entorno) {
  const hoy = (e.hoy ?? dia)();
  const pedidos = await e.datos.pedidos();

  const cobrados: Pedido[] = [];
  for (const p of pedidos.filter((x) => x.estado === 'confirmado')) {
    if (await e.pagos.estaPagado(p.id).catch(() => false)) {
      p.estado = 'pagado';
      await e.datos.guardarPedido(p);
      await e.datos.guardarSeguimiento({ pedido_id: p.id, proxima_accion: 'preparar_envio', fecha: hoy });
      cobrados.push(p);
    }
  }

  const deHoy = pedidos.filter((p) => p.fecha === hoy);
  const pendientes = pedidos.filter((p) => p.estado === 'confirmado');
  const suma = (ps: Pedido[]) => pesos(ps.reduce((s, p) => s + p.total, 0));
  const informe = `Informe ${hoy} — ` + [
    `consultas sin cerrar: ${deHoy.filter((p) => p.estado === 'consulta').length}`,
    `pedidos confirmados: ${deHoy.filter((p) => p.estado !== 'consulta').length}`,
    `cobrados: ${cobrados.length} (${suma(cobrados)})`,
    `pendientes de pago: ${pendientes.length} (${suma(pendientes)})`,
  ].join(' · ');
  await e.aprobador.avisar(informe);
  await auditar('informe', { hoy, informe });

  const catalogo = await e.datos.catalogo();
  for (const s of await e.datos.seguimientos()) {
    const p = pendientes.find((x) => x.id === s.pedido_id);
    const n = Number(s.proxima_accion.match(/^recordar_pago:(\d+)$/)?.[1]);
    if (!p || !n || s.fecha > hoy || !p.link_pago) continue;

    if (n > MAX_RECORDATORIOS) {
      await e.datos.guardarSeguimiento({ ...s, proxima_accion: 'derivar' });
      await e.aprobador.avisar(`${p.cliente} no pagó el pedido ${p.id} (${pesos(p.total)}) tras ${MAX_RECORDATORIOS} recordatorios. Revisalo vos (¿cancelar y devolver stock?).`);
      continue;
    }
    const texto = `¡Hola ${nombre(p.cliente)}! Te dejo de nuevo el link para tu pedido de ${pesos(p.total)}: ${p.link_pago} Cualquier cosa avisame.`;
    const productos = catalogo.filter((c) => p.items.some((i) => i.sku === c.sku));
    const accion = await responder({ canal: p.canal, contacto: p.cliente, texto: '' }, texto, permitir(productos, catalogo, false, [p.total], [p.link_pago]), e, 'seguimiento', false);
    await ejecutar([accion], e);
    await e.datos.guardarSeguimiento({ ...s, proxima_accion: `recordar_pago:${n + 1}`, fecha: sumarDias(hoy, 1) });
  }
}
