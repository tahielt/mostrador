import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import type { Datos, Pedido, Producto, Seguimiento } from '../tipos.ts';

interface Db { catalogo: Producto[]; pedidos: Pedido[]; seguimiento: Seguimiento[] }

/** Base local (JSON) con la misma forma que la planilla. Para demo, tests y desarrollo sin Google. */
export class DatosLocales implements Datos {
  private db: Db;
  constructor(catalogo: Producto[], private archivo?: string) {
    this.db = archivo && existsSync(archivo)
      ? JSON.parse(readFileSync(archivo, 'utf8'))
      : { catalogo: structuredClone(catalogo), pedidos: [], seguimiento: [] };
  }
  private guardar() { if (this.archivo) writeFileSync(this.archivo, JSON.stringify(this.db, null, 2)); }

  async catalogo() { return structuredClone(this.db.catalogo); }
  async setStock(sku: string, stock: number) {
    const p = this.db.catalogo.find((x) => x.sku === sku);
    if (p) p.stock = stock;
    this.guardar();
  }
  async pedidos() { return structuredClone(this.db.pedidos); }
  async guardarPedido(p: Pedido) { upsert(this.db.pedidos, p, (x) => x.id === p.id); this.guardar(); }
  async seguimientos() { return structuredClone(this.db.seguimiento); }
  async guardarSeguimiento(s: Seguimiento) { upsert(this.db.seguimiento, s, (x) => x.pedido_id === s.pedido_id); this.guardar(); }
}

function upsert<T>(lista: T[], item: T, igual: (x: T) => boolean) {
  const i = lista.findIndex(igual);
  if (i >= 0) lista[i] = structuredClone(item); else lista.push(structuredClone(item));
}
