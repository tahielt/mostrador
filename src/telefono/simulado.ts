import type { Canal, Mensaje, Telefono } from '../tipos.ts';

/** Teléfono de mentira: devuelve mensajes encolados e imprime lo que "envía". */
export class TelefonoSimulado implements Telefono {
  bandeja: Mensaje[] = [];
  enviados: { canal: Canal; contacto: string; texto: string }[] = [];
  constructor(private eco = true) {}

  async leerNoLeidos(canal: Canal) {
    const nuevos = this.bandeja.filter((m) => m.canal === canal);
    this.bandeja = this.bandeja.filter((m) => m.canal !== canal);
    return nuevos;
  }
  async enviar(canal: Canal, contacto: string, texto: string) {
    this.enviados.push({ canal, contacto, texto });
    if (this.eco) console.log(`  📤 [${canal}] → ${contacto}: ${texto}`);
  }
}
