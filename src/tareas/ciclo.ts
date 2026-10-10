import type { Accion, Aprobador, Canal, Telefono } from '../tipos.ts';
import { procesar, type Deps } from '../agente/pipeline.ts';
import { auditar } from '../auditoria.ts';
import type { Turnos } from '../telefono/turnos.ts';

export type Fase = 'propuestas' | 'auto_simple';
export interface Entorno extends Deps { telefono: Telefono; turnos: Turnos; aprobador: Aprobador; fase: Fase }

/**
 * Fase "propuestas": todo mensaje al cliente pasa por SÍ/NO.
 * Fase "auto_simple": solo se autoenvían respuestas de precio/stock verificadas. Cobros, seguimientos y reclamos, siempre con persona.
 */
const autoEnviable = (a: Extract<Accion, { tipo: 'responder' }>, fase: Fase) => fase === 'auto_simple' && a.motivo === 'respuesta' && a.auto;

export async function ejecutar(acciones: Accion[], e: Entorno) {
  for (const a of acciones) {
    if (a.tipo === 'derivar') {
      await e.aprobador.avisar(`Pasar a una persona — ${a.motivo}. ${a.contacto} (${a.canal}) escribió: "${a.texto}"`);
      await auditar('derivado', a);
      continue;
    }
    const ok = autoEnviable(a, e.fase) || (await e.aprobador.pedir(a));
    await auditar(ok ? 'aprobado' : 'rechazado', a);
    if (ok) {
      await e.turnos.usar(() => e.telefono.enviar(a.canal, a.contacto, a.texto));
      await auditar('enviado', { contacto: a.contacto, canal: a.canal });
    }
  }
}

const vistos = new Set<string>();

/** Cada N minutos: leer no leídos de cada canal y responder. Un mensaje se procesa una sola vez. */
export async function revisarMensajes(e: Entorno, canales: Canal[]) {
  for (const canal of canales) {
    let mensajes;
    try {
      mensajes = await e.turnos.usar(() => e.telefono.leerNoLeidos(canal));
    } catch (err) {
      await e.aprobador.avisar(`No pude leer ${canal}: ${(err as Error).message}`);
      continue;
    }
    for (const m of mensajes) {
      const clave = `${m.canal}|${m.contacto}|${m.texto}`;
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      await ejecutar(await procesar(m, e), e);
    }
  }
}
