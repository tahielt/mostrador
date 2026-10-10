// Server MCP falso con la forma de ARTEMIS (tarea asíncrona + status) para testear el adaptador sin celular.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({ name: 'fake-artemis', version: '0.0.0' });
const tareas = new Map<string, { tarea: string; consultas: number }>();
const t = (text: string) => ({ content: [{ type: 'text' as const, text }] });

server.registerTool('mobile_run_task', { inputSchema: { goal: z.string(), profile: z.string() } }, async ({ goal }) => {
  const id = `trace-${tareas.size + 1}`;
  tareas.set(id, { tarea: goal, consultas: 0 });
  return t(JSON.stringify({ trace_id: id, status: 'queued' }));
});

server.registerTool('mobile_manage_task', { inputSchema: { action: z.string(), trace_id: z.string() } }, async ({ trace_id }) => {
  const x = tareas.get(trace_id)!;
  if (x.consultas++ === 0) return t('status: running');
  const resultado = x.tarea.includes('sin leer') ? '[{"contacto":"Marta Gómez","texto":"Hola, cuánto el café molido de 500?"}]' : 'Mensaje enviado.';
  return t(`status: completed\nresult: ${resultado}`);
});

await server.connect(new StdioServerTransport());
