import { readFile } from 'node:fs/promises';
import type { LLM } from '../tipos.ts';
import { verificar, type Permitido } from './verificador.ts';

/**
 * El texto base sale de una plantilla con datos del Catálogo (siempre correcto).
 * Si hay LLM, se "humaniza" y pasa por el verificador; si el verificador lo rechaza, queda la plantilla.
 */
export async function redactar(plantilla: string, permitido: Permitido, llm?: LLM): Promise<{ texto: string; problemas: string[] }> {
  if (!llm || process.env.LLM_HUMANIZAR !== '1') return { texto: plantilla, problemas: [] };
  try {
    const reglas = await readFile(process.env.REGLAS ?? 'config/reglas.md', 'utf8');
    const propuesta = (await llm.completar(
      `${reglas}\n\nReescribí el mensaje para que suene natural. Mantené EXACTOS los precios, cantidades y links. No agregues datos.`,
      plantilla,
    )).trim();
    const problemas = verificar(propuesta, permitido);
    return problemas.length ? { texto: plantilla, problemas } : { texto: propuesta, problemas };
  } catch {
    return { texto: plantilla, problemas: [] };
  }
}

export const lista = <T>(xs: T[], fmt: (x: T) => string) =>
  xs.length === 1 ? fmt(xs[0]) : xs.slice(0, -1).map(fmt).join(", ") + " y " + fmt(xs.at(-1)!);
