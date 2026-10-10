import { createInterface } from 'node:readline/promises';
import type { Accion, Aprobador } from '../tipos.ts';

/** El dueño aprueba desde la terminal. Reemplazable por WhatsApp (router + Evolution API) con la misma interfaz. */
export class AprobadorConsola implements Aprobador {
  async pedir(a: Extract<Accion, { tipo: 'responder' }>) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const r = await rl.question(`\n📝 ${a.motivo === 'cobro' ? 'Cobro' : 'Respuesta'} propuesta para ${a.contacto} (${a.canal}):\n${a.texto}\n¿Envío? SÍ/NO › `);
    rl.close();
    return /^\s*s/i.test(r);
  }
  async avisar(texto: string) { console.log(`\n🔔 ${texto}`); }
}

/** Aprueba todo e imprime. Solo para la demo. */
export class AprobadorDemo implements Aprobador {
  async pedir(a: Extract<Accion, { tipo: 'responder' }>) {
    console.log(`  📝 Propuesta (${a.motivo}) para ${a.contacto}: "${a.texto}"  → SÍ`);
    return true;
  }
  async avisar(texto: string) { console.log(`  🔔 Al dueño: ${texto}`); }
}
