import { z } from 'zod';
import type { LLM } from '../tipos.ts';
import { normalizar } from '../util.ts';

export const Intencion = z.object({
  tipo: z.enum(['consulta', 'pedido', 'reclamo', 'envio', 'otro']),
  /** Lo que el cliente nombró, tal cual. El SKU lo resuelve el código contra el Catálogo, nunca el modelo. */
  items: z.array(z.object({ busqueda: z.string(), cantidad: z.number().int().positive().nullable() })).default([]),
  /** Cantidad suelta ("sí, dos") que aplica a lo que se consultó antes. */
  cantidad: z.number().int().positive().nullable().default(null),
});
export type Intencion = z.infer<typeof Intencion>;

const NUMEROS: Record<string, number> = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, docena: 12 };

function cantidad(t: string): number | null {
  for (const [palabra, n] of Object.entries(NUMEROS)) if (new RegExp(`\\b${palabra}\\b`).test(t)) return n;
  const m = t.match(/\b(\d{1,2})\b(?!\s?(?:g|kg|ml|tazas?)\b)/);
  return m && Number(m[1]) <= 50 ? Number(m[1]) : null;
}

/** Interpretación sin modelo: la usa la demo y es el fallback cuando el LLM falla o se agota el presupuesto. */
export function interpretarConReglas(texto: string): Intencion {
  const t = normalizar(texto);
  if (/\b(reclamo|devol\w*|roto|rota|fallad\w*|queja|no (?:me )?llego|cambiar)\b/.test(t)) return { tipo: 'reclamo', items: [], cantidad: null };
  if (/\b(envio|envios|enviar|entrega|demora|cuando llega|llega)\b/.test(t)) return { tipo: 'envio', items: [], cantidad: null };
  const afirma = /^(si|dale|ok|okey|listo|perfecto|joya)\b/.test(t);
  const compra = /^(quiero|me llevo|lo llevo|mandame|preparame)\b/.test(t) && cantidad(t) !== null;
  const resto = t.replace(/^(si|dale|ok|okey|listo|perfecto|joya)\b[\s,]*/, '');
  const pideAlgo = resto.split(' ').filter((w) => !(w in NUMEROS) && !/^\d+$/.test(w)).length >= 2;
  if (afirma || compra) {
    return { tipo: 'pedido', items: pideAlgo ? [{ busqueda: resto, cantidad: cantidad(resto) }] : [], cantidad: cantidad(t) };
  }
  return { tipo: 'consulta', items: [{ busqueda: texto, cantidad: null }], cantidad: null };
}

const SISTEMA = `Clasificás mensajes de clientes de una tienda. Respondé SOLO JSON con esta forma:
{"tipo":"consulta|pedido|reclamo|envio|otro","items":[{"busqueda":"texto del producto tal como lo nombró","cantidad":número|null}],"cantidad":número|null}
- consulta: pregunta precio, stock o productos.
- pedido: confirma o pide comprar ("sí, dos", "quiero 2 del molido"). Si no nombra producto, items=[] y cantidad=la que dijo.
- reclamo: reclamos, devoluciones, productos fallados.
- envio: pregunta por envíos, entregas o plazos.
No inventes productos ni precios: solo copiá lo que dijo el cliente.`;

export async function interpretar(texto: string, llm?: LLM): Promise<Intencion> {
  if (!llm) return interpretarConReglas(texto);
  try {
    return Intencion.parse(JSON.parse(await llm.completar(SISTEMA, texto, true)));
  } catch {
    return interpretarConReglas(texto);
  }
}
