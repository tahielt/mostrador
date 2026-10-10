import { readFileSync } from 'node:fs';
import { config } from './config.ts';
import { DatosLocales } from './datos/local.ts';
import { DatosSheets } from './datos/sheets.ts';
import { MercadoPago } from './pagos/mercadopago.ts';
import { PagosSimulados } from './pagos/simulado.ts';
import { LLMCompat } from './llm/openai-compat.ts';
import { TelefonoArtemis } from './telefono/artemis.ts';
import { Turnos } from './telefono/turnos.ts';
import { AprobadorConsola } from './aprobacion/consola.ts';
import { revisarMensajes, type Entorno } from './tareas/ciclo.ts';
import { cierreDelDia } from './tareas/cierre.ts';
import { dia, hora } from './util.ts';

const { artemis, sheets, mp, llm } = config;
if (!artemis.cmd || !artemis.cwd) throw new Error('Configurá ARTEMIS_CMD y ARTEMIS_CWD (ver README → Fase 0). Para probar sin celular: npm run demo');

const entorno: Entorno = {
  fase: config.fase,
  telefono: new TelefonoArtemis(artemis.cmd, artemis.args, artemis.cwd),
  turnos: new Turnos(),
  aprobador: new AprobadorConsola(),
  datos: sheets.id
    ? new DatosSheets(sheets.id, sheets.credenciales)
    : new DatosLocales(JSON.parse(readFileSync('data/catalogo-demo.json', 'utf8')), 'data/local-db.json'),
  pagos: mp.token ? new MercadoPago(mp.token, mp.notificationUrl) : new PagosSimulados(),
  llm: llm.key ? new LLMCompat(llm.key, llm.modelo, llm.base, llm.tope) : undefined,
};

console.log(`Mostrador en marcha · fase ${config.fase} · ${config.canales.join(' + ')} cada ${config.cadaMinutos} min · cierre ${config.horaCierre}`);
if (!sheets.id) console.log('⚠️  Sin SHEETS_ID: usando base local data/local-db.json');
if (!mp.token) console.log('⚠️  Sin MP_ACCESS_TOKEN: links de pago simulados');

let ultimaRevision = 0, ultimoCierre = '';
let ocupado = false;
async function tick() {
  if (ocupado) return;
  ocupado = true;
  try {
    if (Date.now() - ultimaRevision >= config.cadaMinutos * 60_000) {
      ultimaRevision = Date.now();
      await revisarMensajes(entorno, config.canales);
    }
    if (hora() >= config.horaCierre && ultimoCierre !== dia()) {
      ultimoCierre = dia();
      await cierreDelDia(entorno);
    }
  } catch (e) {
    await entorno.aprobador.avisar(`Error en el ciclo: ${(e as Error).message}`);
  } finally {
    ocupado = false;
  }
}

await tick();
setInterval(tick, 60_000);
