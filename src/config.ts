import type { Canal } from './tipos.ts';
import type { Fase } from './tareas/ciclo.ts';

try { process.loadEnvFile(); } catch { /* sin .env: se usan variables del entorno */ }

const env = (k: string, def?: string) => process.env[k] ?? def;

export const config = {
  fase: env('FASE', 'propuestas') as Fase,
  canales: env('CANALES', 'whatsapp,instagram')!.split(',').map((c) => c.trim()) as Canal[],
  cadaMinutos: Number(env('CADA_MINUTOS', '10')),
  horaCierre: env('HORA_CIERRE', '20:00')!,
  sheets: { id: env('SHEETS_ID'), credenciales: env('GOOGLE_CREDENCIALES', 'credenciales/cuenta-servicio.json')! },
  mp: { token: env('MP_ACCESS_TOKEN'), notificationUrl: env('MP_NOTIFICATION_URL') },
  llm: { key: env('LLM_API_KEY'), modelo: env('LLM_MODELO', 'deepseek/deepseek-chat')!, base: env('LLM_BASE_URL'), tope: Number(env('LLM_TOPE_DIARIO', '300')) },
  artemis: { cmd: env('ARTEMIS_CMD'), args: (env('ARTEMIS_ARGS', '-m mcp_server') ?? '').split(' ').filter(Boolean), cwd: env('ARTEMIS_CWD') },
};
