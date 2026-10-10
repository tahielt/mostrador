/** Un celular = una tarea a la vez. Todo uso del teléfono pasa por acá, en orden de llegada. */
export class Turnos {
  private cola: Promise<unknown> = Promise.resolve();
  usar<T>(tarea: () => Promise<T>): Promise<T> {
    const turno = this.cola.then(tarea);
    this.cola = turno.catch(() => undefined);
    return turno;
  }
}
