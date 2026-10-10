import { appendFile, mkdir } from 'node:fs/promises';

const ARCHIVO = process.env.AUDITORIA ?? 'logs/auditoria.jsonl';

/** Todo lo que el agente propone, aprueba, envía o deriva queda en JSONL para auditar. */
export async function auditar(evento: string, datos: Record<string, unknown> = {}) {
  if (process.env.AUDITORIA === 'off') return;
  await mkdir(ARCHIVO.replace(/\/[^/]+$/, ''), { recursive: true });
  await appendFile(ARCHIVO, JSON.stringify({ ts: new Date().toISOString(), evento, ...datos }) + '\n');
}
