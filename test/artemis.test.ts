import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TelefonoArtemis } from '../src/telefono/artemis.ts';

test('adaptador ARTEMIS: lanza la tarea, espera el status y parsea los no leídos', async () => {
  const tel = new TelefonoArtemis(process.execPath, ['--import', 'tsx', 'test/fake-artemis.ts'], process.cwd(), 10_000, 50);
  try {
    assert.deepEqual(await tel.leerNoLeidos('whatsapp'), [
      { canal: 'whatsapp', contacto: 'Marta Gómez', texto: 'Hola, cuánto el café molido de 500?' },
    ]);
    await tel.enviar('whatsapp', 'Marta Gómez', 'Hola!');
  } finally {
    await tel.cerrar();
  }
});
