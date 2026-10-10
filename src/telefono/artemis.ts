import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { z } from 'zod';
import type { Canal, Mensaje, Telefono } from '../tipos.ts';

const APPS: Record<Canal, string> = { whatsapp: 'WhatsApp Business', instagram: 'Instagram (mensajes directos)' };
const NoLeidos = z.array(z.object({ contacto: z.string(), texto: z.string() }));

type Resultado = { content?: { type: string; text?: string }[] };
const texto = (r: unknown) => ((r as Resultado).content ?? []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');

/**
 * Maneja el Android con ARTEMIS (github.com/google/artemis) por MCP.
 * mobile_run_task es asíncrona: devuelve un trace id y se consulta con mobile_manage_task(action="status").
 * Los nombres de los argumentos se leen del schema que publica el server, así no dependen de la versión.
 */
export class TelefonoArtemis implements Telefono {
  private cliente?: Client;
  private claves = { tarea: 'task', perfil: 'profile', trace: 'trace_id' };

  constructor(private cmd: string, private args: string[], private cwd: string, private timeoutMs = 300_000, private intervaloMs = 3000) {}

  private async conectar() {
    if (this.cliente) return this.cliente;
    const cliente = new Client({ name: 'mostrador', version: '0.1.0' });
    await cliente.connect(new StdioClientTransport({
      command: this.cmd, args: this.args, cwd: this.cwd,
      env: { ...process.env, PYTHONPATH: this.cwd, PYTHONUNBUFFERED: '1' } as Record<string, string>,
    }));
    const { tools } = await cliente.listTools();
    const props = (nombre: string) => Object.keys(tools.find((t) => t.name === nombre)?.inputSchema.properties ?? {});
    const elegir = (opciones: string[], disponibles: string[], def: string) => opciones.find((o) => disponibles.includes(o)) ?? def;
    const run = props('mobile_run_task'), manage = props('mobile_manage_task');
    if (!run.length) throw new Error('ARTEMIS no expone mobile_run_task: revisá ARTEMIS_CMD/ARGS/CWD y corré `artemis doctor`');
    this.claves = {
      tarea: elegir(['task', 'goal', 'prompt', 'instruction'], run, 'task'),
      perfil: elegir(['profile', 'mode'], run, 'profile'),
      trace: elegir(['trace_id', 'task_id', 'id'], manage, 'trace_id'),
    };
    return (this.cliente = cliente);
  }

  /** Lanza una tarea en modo Flash y espera el resultado. */
  async correr(tarea: string): Promise<string> {
    const c = await this.conectar();
    const inicio = texto(await c.callTool({ name: 'mobile_run_task', arguments: { [this.claves.tarea]: tarea, [this.claves.perfil]: 'flash' } }));
    const trace = inicio.match(/trace[_\s-]?id["'\s:=]+([\w.-]+)/i)?.[1];
    if (!trace) return inicio; // versión síncrona: ya vino el resultado

    for (const limite = Date.now() + this.timeoutMs; Date.now() < limite;) {
      await new Promise((r) => setTimeout(r, this.intervaloMs));
      const estado = texto(await c.callTool({ name: 'mobile_manage_task', arguments: { action: 'status', [this.claves.trace]: trace } }));
      if (/\b(running|pending|queued|in[_ ]progress)\b/i.test(estado)) continue;
      if (/\b(failed|error|cancel+ed)\b/i.test(estado)) throw new Error(`ARTEMIS falló (${trace}): ${estado.slice(0, 300)}`);
      return estado;
    }
    throw new Error(`ARTEMIS: timeout en ${trace} (revisalo con mobile_inspect_trace)`);
  }

  async leerNoLeidos(canal: Canal): Promise<Mensaje[]> {
    const salida = await this.correr(
      `Abrí ${APPS[canal]}. Listá los chats con mensajes sin leer: nombre del contacto y su último mensaje. ` +
      'No respondas ni abras ningún chat más de lo necesario. ' +
      'Al terminar, devolvé SOLO un JSON así: [{"contacto":"Nombre","texto":"último mensaje"}] o [] si no hay.',
    );
    const json = salida.slice(salida.indexOf('['), salida.lastIndexOf(']') + 1);
    try {
      return NoLeidos.parse(JSON.parse(json)).map((m) => ({ ...m, canal }));
    } catch {
      throw new Error(`No pude leer la lista de no leídos de ${canal}: ${salida.slice(0, 300)}`);
    }
  }

  async enviar(canal: Canal, contacto: string, mensaje: string) {
    await this.correr(
      `Abrí ${APPS[canal]}, entrá al chat de "${contacto}", escribí exactamente este texto (sin cambiar nada) y enviá:\n` +
      `<<<\n${mensaje}\n>>>\nNo toques nada más. Confirmá cuando el mensaje figure como enviado.`,
    );
  }

  async cerrar() { await this.cliente?.close(); }
}
