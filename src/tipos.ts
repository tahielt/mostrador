export type Canal = 'whatsapp' | 'instagram';
export type Estado = 'consulta' | 'confirmado' | 'pagado' | 'enviado' | 'cancelado';

export interface Mensaje { canal: Canal; contacto: string; texto: string }
export interface Producto { sku: string; producto: string; precio: number; stock: number; foto?: string }
export interface Item { sku: string; cantidad: number }

export interface Pedido {
  id: string; fecha: string; cliente: string; canal: Canal; items: Item[];
  total: number; estado: Estado; link_pago?: string; notas?: string;
}

/** Próxima acción pendiente de un pedido. `proxima_accion` = "recordar_pago:N" o "derivar". */
export interface Seguimiento { pedido_id: string; proxima_accion: string; fecha: string }

/** Lo que el pipeline decide hacer con un mensaje. Nada sale al cliente sin pasar por la política de aprobación. */
export type Accion =
  | { tipo: 'responder'; canal: Canal; contacto: string; texto: string; motivo: 'respuesta' | 'cobro' | 'seguimiento'; auto: boolean }
  | { tipo: 'derivar'; canal: Canal; contacto: string; motivo: string; texto: string };

// ── Puertos: cada integración externa se enchufa acá ─────────────────────────
export interface Datos {
  catalogo(): Promise<Producto[]>;
  setStock(sku: string, stock: number): Promise<void>;
  pedidos(): Promise<Pedido[]>;
  guardarPedido(p: Pedido): Promise<void>;
  seguimientos(): Promise<Seguimiento[]>;
  guardarSeguimiento(s: Seguimiento): Promise<void>;
}

export interface Telefono {
  leerNoLeidos(canal: Canal): Promise<Mensaje[]>;
  enviar(canal: Canal, contacto: string, texto: string): Promise<void>;
}

export interface Pagos {
  crearLink(p: Pedido, catalogo: Producto[]): Promise<string>;
  estaPagado(pedidoId: string): Promise<boolean>;
}

export interface Aprobador {
  pedir(a: Extract<Accion, { tipo: 'responder' }>): Promise<boolean>;
  avisar(texto: string): Promise<void>;
}

export interface LLM {
  completar(sistema: string, usuario: string, json?: boolean): Promise<string>;
}
