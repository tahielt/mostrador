const TZ = process.env.TZ_NEGOCIO ?? 'America/Argentina/Buenos_Aires';

/** $9.800 — formato es-AR sin depender de ICU. */
export const pesos = (n: number) => '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** YYYY-MM-DD en la zona horaria del negocio. */
export const dia = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
export const hora = (d = new Date()) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
export const sumarDias = (fecha: string, n: number) => {
  const d = new Date(fecha + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const nombre = (contacto: string) => contacto.trim().split(/\s+/)[0];

/** minúsculas, sin acentos, "500g" → "500 g", sin puntuación. */
export const normalizar = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/(\d)([a-z])/g, '$1 $2').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
