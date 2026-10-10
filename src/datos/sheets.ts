import { GoogleAuth } from 'google-auth-library';
import type { Datos, Estado, Item, Pedido, Producto, Seguimiento } from '../tipos.ts';

const API = 'https://sheets.googleapis.com/v4/spreadsheets';
const HOJAS = { catalogo: 'Catálogo', pedidos: 'Pedidos', seguimiento: 'Seguimiento' } as const;

// Columnas (fila 1 = encabezados):
// Catálogo:    sku | producto | precio | stock | foto
// Pedidos:     id | fecha | cliente | canal | items | total | estado | link_pago | notas
// Seguimiento: pedido_id | próxima_acción | fecha

const itemsATexto = (items: Item[]) => items.map((i) => `${i.sku} x${i.cantidad}`).join('; ');
const textoAItems = (s = '') =>
  s.split(';').map((x) => x.trim().match(/^(\S+)\s+x(\d+)$/)).filter((m) => m !== null).map((m) => ({ sku: m[1], cantidad: Number(m[2]) }));

/** Google Sheets como base de datos, vía cuenta de servicio (compartí la planilla con su email). */
export class DatosSheets implements Datos {
  private auth: GoogleAuth;
  constructor(private id: string, keyFile: string) {
    this.auth = new GoogleAuth({ keyFile, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  }

  private async pedir<T>(ruta: string, method: 'GET' | 'PUT' | 'POST' = 'GET', values?: unknown[][]): Promise<T> {
    const client = await this.auth.getClient();
    const res = await client.request<T>({ url: `${API}/${this.id}/values/${ruta}`, method, data: values && { values } });
    return res.data;
  }
  /** Valores sin formato (números como números), convertidos a texto salvo que se pidan como número. */
  private leer = async (hoja: string, cols: string) =>
    ((await this.pedir<{ values?: unknown[][] }>(`${encodeURIComponent(`'${hoja}'!A2:${cols}`)}?valueRenderOption=UNFORMATTED_VALUE`)).values ?? [])
      .map((r) => r.map((v) => String(v ?? '')));
  private escribir = (hoja: string, fila: number, cols: string, valores: unknown[]) =>
    this.pedir(`${encodeURIComponent(`'${hoja}'!A${fila}:${cols}${fila}`)}?valueInputOption=RAW`, 'PUT', [valores]);
  private agregar = (hoja: string, cols: string, valores: unknown[]) =>
    this.pedir(`${encodeURIComponent(`'${hoja}'!A:${cols}`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, 'POST', [valores]);

  private async upsert(hoja: string, cols: string, clave: string, valores: unknown[]) {
    const fila = (await this.leer(hoja, 'A')).findIndex((r) => r[0] === clave);
    await (fila >= 0 ? this.escribir(hoja, fila + 2, cols, valores) : this.agregar(hoja, cols, valores));
  }

  async catalogo(): Promise<Producto[]> {
    return (await this.leer(HOJAS.catalogo, 'E')).filter((r) => r[0]).map(([sku, producto, precio, stock, foto]) => ({
      sku, producto, precio: Number(precio), stock: Number(stock) || 0, foto: foto || undefined,
    }));
  }
  async setStock(sku: string, stock: number) {
    const fila = (await this.leer(HOJAS.catalogo, 'A')).findIndex((r) => r[0] === sku);
    if (fila < 0) throw new Error(`SKU ${sku} no está en el Catálogo`);
    await this.pedir(`${encodeURIComponent(`'${HOJAS.catalogo}'!D${fila + 2}`)}?valueInputOption=RAW`, 'PUT', [[stock]]);
  }
  async pedidos(): Promise<Pedido[]> {
    return (await this.leer(HOJAS.pedidos, 'I')).filter((r) => r[0]).map(([id, fecha, cliente, canal, items, total, estado, link_pago, notas]) => ({
      id, fecha, cliente, canal: canal as Pedido['canal'], items: textoAItems(items), total: Number(total) || 0,
      estado: estado as Estado, link_pago: link_pago || undefined, notas: notas || undefined,
    }));
  }
  async guardarPedido(p: Pedido) {
    await this.upsert(HOJAS.pedidos, 'I', p.id,
      [p.id, p.fecha, p.cliente, p.canal, itemsATexto(p.items), p.total, p.estado, p.link_pago ?? '', p.notas ?? '']);
  }
  async seguimientos(): Promise<Seguimiento[]> {
    return (await this.leer(HOJAS.seguimiento, 'C')).filter((r) => r[0]).map(([pedido_id, proxima_accion, fecha]) => ({ pedido_id, proxima_accion, fecha }));
  }
  async guardarSeguimiento(s: Seguimiento) {
    await this.upsert(HOJAS.seguimiento, 'C', s.pedido_id, [s.pedido_id, s.proxima_accion, s.fecha]);
  }
}
