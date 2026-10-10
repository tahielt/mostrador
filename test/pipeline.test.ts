import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buscar, parecido } from '../src/agente/catalogo.ts';
import { interpretarConReglas } from '../src/agente/intencion.ts';
import { procesar, type Deps } from '../src/agente/pipeline.ts';
import { DatosLocales } from '../src/datos/local.ts';
import { PagosSimulados } from '../src/pagos/simulado.ts';
import type { Accion, Producto } from '../src/tipos.ts';

process.env.AUDITORIA = 'off';
const catalogo: Producto[] = JSON.parse(readFileSync('data/catalogo-demo.json', 'utf8'));
const deps = (): Deps => ({ datos: new DatosLocales(catalogo), pagos: new PagosSimulados(), hoy: () => '2026-10-10' });
const texto = (a: Accion[]) => (a[0].tipo === 'responder' ? a[0].texto : '');
const marta = (t: string) => ({ canal: 'whatsapp' as const, contacto: 'Marta Gómez', texto: t });

test('catálogo: encuentra el producto exacto y, sin stock, el parecido', () => {
  assert.equal(buscar('Hola, cuánto el café molido de 500?', catalogo).exacto?.sku, 'CAF-MOL-500');
  assert.equal(buscar('tenés café en grano de 1 kilo?', catalogo).exacto?.sku, 'CAF-GRA-1K');
  assert.equal(parecido(catalogo.find((p) => p.sku === 'CAF-GRA-1K')!, catalogo)?.sku, 'CAF-GRA-500');
  assert.equal(buscar('cuánto el molido?', catalogo).exacto, undefined); // ambiguo → opciones, no adivina
});

test('reglas: "Sí, dos" es un pedido de 2 sobre lo consultado', () => {
  assert.deepEqual(interpretarConReglas('Sí, dos'), { tipo: 'pedido', items: [], cantidad: 2 });
  assert.equal(interpretarConReglas('quiero saber el precio del molido').tipo, 'consulta');
});

test('consulta → pedido: total, stock, link y seguimiento salen del código', async () => {
  const d = deps();
  assert.match(texto(await procesar(marta('Hola, cuánto el café molido de 500?'), d)), /\$9\.800, hay stock/);

  const [a] = await procesar(marta('Sí, dos'), d);
  assert.equal(a.tipo === 'responder' && a.motivo, 'cobro');
  assert.match(texto([a]), /2 x Café molido 500 g, total \$19\.600.*mpago\.la\/demo-P-0001/);

  const [pedido] = await d.datos.pedidos();
  assert.equal(pedido.estado, 'confirmado');
  assert.equal(pedido.total, 19600);
  assert.equal((await d.datos.catalogo()).find((p) => p.sku === 'CAF-MOL-500')!.stock, 10);
  assert.deepEqual(await d.datos.seguimientos(), [{ pedido_id: 'P-0001', proxima_accion: 'recordar_pago:1', fecha: '2026-10-11' }]);
});

test('no vende más de lo que hay', async () => {
  const d = deps();
  await procesar(marta('cuánto la cafetera moka?'), d);
  assert.match(texto(await procesar(marta('Sí, cinco'), d)), /me quedan 3/);
  assert.equal((await d.datos.pedidos())[0].estado, 'consulta');
});

test('reclamos y envíos van a una persona', async () => {
  for (const t of ['me llegó rota la taza', '¿cuándo llega el envío?']) {
    assert.equal((await procesar(marta(t), deps()))[0].tipo, 'derivar');
  }
});
