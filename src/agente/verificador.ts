import type { Producto } from '../tipos.ts';
import { normalizar } from '../util.ts';

export interface Permitido {
  montos: number[];        // precios y totales que salen del Catálogo
  urls: string[];          // solo el link de pago generado
  productos: Producto[];   // productos que corresponden a esta respuesta
  catalogo: Producto[];
  sinStock: boolean;       // la respuesta habla de un producto sin stock
}

const MONTO = /\$\s?(\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?|\b(\d{1,3}(?:\.\d{3})+|\d+)\s?(?:pesos|ars)\b/gi;
const PROMESA = /\b(manana|pasado manana|lunes|martes|miercoles|jueves|viernes|sabado|domingo|en \d+ (?:dias|horas|hs)|te llega|llega el|entregamos|despachamos)\b|\b\d{1,2}\/\d{1,2}\b/;
const HAY_STOCK = /\b(hay stock|tenemos stock|esta disponible|lo tengo|la tengo|tengo stock)\b/;
const NO_HAY = /\b(no hay|sin stock|no (?:lo |la )?tengo|no tenemos)\b/;

/**
 * Capa anti-alucinación: el texto final solo puede contener montos, links y productos
 * que salen de los hechos. Si falla, el pipeline usa la plantilla determinística.
 */
export function verificar(texto: string, ok: Permitido): string[] {
  const problemas: string[] = [];
  const plano = normalizar(texto);

  for (const m of texto.matchAll(MONTO)) {
    const n = Number((m[1] ?? m[2]).replace(/\./g, ''));
    if (!ok.montos.includes(n)) problemas.push(`monto no respaldado: ${m[0].trim()}`);
  }
  for (const url of texto.match(/https?:\/\/\S+/g) ?? []) {
    if (!ok.urls.includes(url.replace(/[).,!?]+$/, ''))) problemas.push(`link no generado por el sistema: ${url}`);
  }
  const permitidos = new Set(ok.productos.map((p) => p.sku));
  for (const p of ok.catalogo) {
    if (!permitidos.has(p.sku) && plano.includes(normalizar(p.producto))) problemas.push(`producto fuera de la consulta: ${p.producto}`);
  }
  if (PROMESA.test(plano)) problemas.push('promete fecha o plazo de entrega');
  if (ok.sinStock && HAY_STOCK.test(plano) && !NO_HAY.test(plano)) problemas.push('afirma stock de un producto agotado');
  return problemas;
}
