import type { Instrumentation } from 'next';

// Al prender la app: arranca el envío de los avisos al celular de Mantenimiento (cada minuto: ~/lib/avisosAlCelular). Solo en Node (este
// archivo también se arma para el proxy).
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { arrancarAvisos } = await import('./lib/avisosAlCelular');
  arrancarAvisos();
}

// Next avisa acá de cada error que nadie atrapó en el servidor (no de los redirect ni de las páginas que no existen): queda en
// Configuración → Errores (~/lib/registroDeErrores). Lo de la base solo corre en Node (este archivo también se arma para el proxy).
export const onRequestError: Instrumentation.onRequestError = async (error, pedido) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { anotarErrorDelPedido } = await import('./lib/registroDeErrores');
  await anotarErrorDelPedido(error, pedido);
};
