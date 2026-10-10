import type { Pagos, Pedido, Producto } from '../tipos.ts';

const API = 'https://api.mercadopago.com';

/** Checkout Pro: una preferencia por pedido, con external_reference = id del pedido para conciliar. */
export class MercadoPago implements Pagos {
  constructor(private token: string, private notificationUrl?: string) {}

  private async api<T>(ruta: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(API + ruta, {
      ...init,
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json', ...init.headers },
    });
    if (!res.ok) throw new Error(`Mercado Pago ${res.status}: ${await res.text()}`);
    return res.json() as Promise<T>;
  }

  async crearLink(p: Pedido, catalogo: Producto[]) {
    const items = p.items.map((i) => {
      const prod = catalogo.find((x) => x.sku === i.sku)!;
      return { id: i.sku, title: prod.producto, quantity: i.cantidad, unit_price: prod.precio, currency_id: 'ARS' };
    });
    const pref = await this.api<{ init_point: string }>('/checkout/preferences', {
      method: 'POST',
      body: JSON.stringify({ items, external_reference: p.id, notification_url: this.notificationUrl }),
    });
    return pref.init_point; // siempre init_point (no existe sandbox: se prueba con usuarios de prueba)
  }

  async estaPagado(pedidoId: string) {
    const r = await this.api<{ results: { status: string }[] }>(`/v1/payments/search?external_reference=${encodeURIComponent(pedidoId)}`);
    return r.results.some((x) => x.status === 'approved');
  }
}
