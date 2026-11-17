'use server';
import { z } from 'zod';
import { Texto, TextoONulo, entrada } from '~/lib/entrada';
import { anotarError } from '~/lib/registroDeErrores';
import { datosDelPedido, usuarioActual } from '~/lib/sesion';

const ErrorDeLaPantalla = z.object({ mensaje: Texto(2000), detalle: TextoONulo(4000), url: TextoONulo(2000) });

/** Un error de la pantalla (lo manda el navegador: ./registrar). */
export async function anotarErrorDeLaPantalla(e: z.infer<typeof ErrorDeLaPantalla>) {
  // sin sesión no se anota (y no se manda a /entrar por esto: lo hará la próxima acción)
  if (!(await usuarioActual())) return;
  const usuario = await entrada('anotarErrorDeLaPantalla', [ErrorDeLaPantalla], [e]);
  const { navegador } = await datosDelPedido();
  await anotarError(usuario, { ...e, navegador });
}
