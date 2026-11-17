import { describe, expect, it } from 'vitest';
import { esDeUnaVersionVieja, mensajeDeError } from './errores';

// Cuando se publica una versión nueva con una pantalla abierta, Next responde que la acción ya no existe: eso se avisa claro, no con el texto técnico.
describe('pantalla de una versión anterior', () => {
  const deNext = new Error('Server Action "4051f19e8afdce776e45c6b978156660ad" was not found on the server. Read more: https://nextjs.org/docs/messages/failed-to-find-server-action');
  it('se reconoce', () => {
    expect(esDeUnaVersionVieja(deNext)).toBe(true);
    expect(esDeUnaVersionVieja(new Error('No se encontró el artículo'))).toBe(false);
  });
  it('el aviso dice que se actualizó la app, sin el texto técnico', () => {
    expect(mensajeDeError(deNext)).toBe('Se actualizó la app. Recargá la página y probá de nuevo.');
    expect(mensajeDeError(new Error('Otra cosa'))).toBe('Otra cosa');
  });
});
