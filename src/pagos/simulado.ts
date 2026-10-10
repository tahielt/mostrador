import type { Pagos, Pedido } from '../tipos.ts';

export class PagosSimulados implements Pagos {
  pagados = new Set<string>();
  async crearLink(p: Pedido) { return `https://mpago.la/demo-${p.id}`; }
  async estaPagado(id: string) { return this.pagados.has(id); }
}
