/**
 * Demo de punta a punta sin celular, sin Google y sin Mercado Pago:
 * mismos módulos que producción, con teléfono, planilla y pagos simulados.
 */
import { readFileSync } from 'node:fs';
import type { Mensaje } from './tipos.ts';
import { DatosLocales } from './datos/local.ts';
import { PagosSimulados } from './pagos/simulado.ts';
import { TelefonoSimulado } from './telefono/simulado.ts';
import { Turnos } from './telefono/turnos.ts';
import { AprobadorDemo } from './aprobacion/consola.ts';
import { revisarMensajes, type Entorno } from './tareas/ciclo.ts';
import { cierreDelDia } from './tareas/cierre.ts';
import { sumarDias } from './util.ts';

const datos = new DatosLocales(JSON.parse(readFileSync('data/catalogo-demo.json', 'utf8')));
const telefono = new TelefonoSimulado();
const pagos = new PagosSimulados();
let fecha = '2026-10-10';
const e: Entorno = { fase: 'propuestas', telefono, turnos: new Turnos(), aprobador: new AprobadorDemo(), datos, pagos, hoy: () => fecha };

async function revision(titulo: string, mensajes: Mensaje[]) {
  console.log(`\n── ${titulo} ${'─'.repeat(Math.max(0, 60 - titulo.length))}`);
  for (const m of mensajes) console.log(`  📥 [${m.canal}] ${m.contacto}: ${m.texto}`);
  telefono.bandeja.push(...mensajes);
  await revisarMensajes(e, ['whatsapp', 'instagram']);
}

console.log('☕ Café del Sur — demo de Mostrador (teléfono, planilla y pagos simulados)');

await revision(`${fecha} 10:00 · revisión`, [
  { canal: 'whatsapp', contacto: 'Marta Gómez', texto: 'Hola, cuánto el café molido de 500?' },
  { canal: 'instagram', contacto: 'juli.cafetera', texto: 'tenés café en grano de 1 kilo?' },
  { canal: 'whatsapp', contacto: 'Pedro Ruiz', texto: 'Hola, la prensa francesa me llegó rota, la quiero devolver' },
]);

await revision(`${fecha} 10:10 · revisión`, [
  { canal: 'whatsapp', contacto: 'Marta Gómez', texto: 'Sí, dos' },
  { canal: 'instagram', contacto: 'juli.cafetera', texto: 'dale, mandame uno' },
]);

pagos.pagados.add('P-0001'); // Marta paga; juli no
for (let d = 0; d < 4; d++) {
  console.log(`\n── ${fecha} 20:00 · cierre del día ${'─'.repeat(30)}`);
  await cierreDelDia(e);
  fecha = sumarDias(fecha, 1);
}

console.log('\n── Planilla al final ' + '─'.repeat(42));
console.table((await datos.pedidos()).map((p) => ({ id: p.id, cliente: p.cliente, items: p.items.map((i) => `${i.sku} x${i.cantidad}`).join(', '), total: p.total, estado: p.estado })));
console.table((await datos.catalogo()).filter((p) => ['CAF-MOL-500', 'CAF-GRA-500'].includes(p.sku)).map(({ sku, stock }) => ({ sku, stock })));
