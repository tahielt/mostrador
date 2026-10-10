import type { Producto } from '../tipos.ts';
import { normalizar } from '../util.ts';

const VACIAS = new Set(('hola buenas buen dia tardes noches cuanto cuanta cuesta sale esta precio precios valor tenes tienen ' +
  'tenias hay queda quedan stock me te le lo la las los el un una unos unas de del al en con para por que y o a ' +
  'quiero queria quisiera necesito busco favor gracias porfa si dale ok listo').split(' '));
const SINONIMOS: Record<string, string> = { kilo: 'kg', kilos: 'kg', gramos: 'g', gr: 'g', grs: 'g', mililitros: 'ml', cc: 'ml' };

const tokens = (s: string) => new Set(
  normalizar(s).split(' ').map((t) => SINONIMOS[t] ?? t).filter((t) => t && !VACIAS.has(t) && !/^[a-z]$/.test(t)),
);

const solapamiento = (a: Set<string>, b: Set<string>) => [...a].filter((t) => b.has(t)).length;

export interface Busqueda { exacto?: Producto; opciones: Producto[] }

/** Busca en el Catálogo. Nunca inventa: si no hay coincidencia clara devuelve opciones (o nada). */
export function buscar(consulta: string, catalogo: Producto[]): Busqueda {
  const q = tokens(consulta);
  const puntajes = catalogo
    .map((p) => {
      const t = tokens(p.producto);
      const n = solapamiento(q, t);
      return { p, n, score: t.size ? n / t.size : 0 };
    })
    .filter((x) => x.n > 0)
    .sort((a, b) => b.score - a.score || b.n - a.n);

  const [mejor, segundo] = puntajes;
  const claro = mejor && (mejor.score >= 0.6 || (mejor.n >= 2 && mejor.n === q.size)); // nombra casi todo el producto, o todo lo que dijo coincide
  const unico = !segundo || segundo.score < mejor.score || segundo.n < mejor.n;
  if (claro && unico) return { exacto: mejor.p, opciones: [] };
  return { opciones: puntajes.filter((x) => x.p.stock > 0).slice(0, 3).map((x) => x.p) };
}

/** Sin stock → el producto con stock más parecido (nombre, y a igualdad, precio más cercano). */
export function parecido(sinStock: Producto, catalogo: Producto[]): Producto | undefined {
  const base = tokens(sinStock.producto);
  return catalogo
    .filter((p) => p.sku !== sinStock.sku && p.stock > 0)
    .map((p) => ({ p, n: solapamiento(base, tokens(p.producto)) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || Math.abs(a.p.precio - sinStock.precio) - Math.abs(b.p.precio - sinStock.precio))[0]?.p;
}
