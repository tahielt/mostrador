import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verificar } from '../src/agente/verificador.ts';
import { permitir } from '../src/agente/pipeline.ts';
import type { Producto } from '../src/tipos.ts';

const catalogo: Producto[] = JSON.parse(readFileSync('data/catalogo-demo.json', 'utf8'));
const molido = catalogo.find((p) => p.sku === 'CAF-MOL-500')!;
const ok = permitir([molido], catalogo, false, [19600], ['https://mpago.la/x']);

test('pasa un mensaje con datos del catálogo', () => {
  assert.deepEqual(verificar('Dale! 2 x Café molido 500 g, total $19.600. Link: https://mpago.la/x', ok), []);
});

test('bloquea precios inventados', () => {
  assert.match(verificar('Te queda en $9.500 con descuento', ok)[0], /monto no respaldado/);
  assert.match(verificar('Son 9800 pesos... o 9000 pesos', ok)[0], /9000/);
});

test('bloquea links que no generó el sistema', () => {
  assert.match(verificar('Pagá acá: https://mpago.la/otro', ok)[0], /link/);
});

test('bloquea productos fuera de la consulta y promesas de entrega', () => {
  assert.ok(verificar('También tengo Molinillo manual', ok).some((p) => p.includes('Molinillo')));
  assert.ok(verificar('Te llega el viernes', ok).some((p) => p.includes('entrega')));
});

test('bloquea afirmar stock de un agotado', () => {
  const agotado = permitir([catalogo.find((p) => p.sku === 'CAF-GRA-1K')!], catalogo, true);
  assert.deepEqual(verificar('Café en grano 1 kg no lo tengo ahora.', agotado), []);
  assert.match(verificar('Sí, hay stock del de 1 kg', agotado)[0], /agotado/);
});
