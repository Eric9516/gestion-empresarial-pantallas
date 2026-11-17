import { notFound } from 'next/navigation';
import type { Sector } from '@/features/sectores/tipos';
import { usaDelDeposito } from '~/lib/comoTrabaja';
import { comoUsuario } from '~/lib/db';
import { contexto } from '~/lib/contexto';
import PanelDeRetiroEnNext from './PanelDeRetiroEnNext';

// Depósito → A retirar: el carrito (vive en el navegador), el sector y la confirmación. Los sectores se leen acá; el stock de lo que hay en el
// carrito y la confirmación, con acciones del servidor.
export default async function ARetirar() {
  const ctx = await contexto();
  // donde los operarios no retiran (lo decide Compras) no hay carrito; la base lo frena igual
  if (!usaDelDeposito(ctx).retiros) notFound();
  const { perfil } = ctx;
  const sectores = await comoUsuario(perfil.id, async c => (await c.query<Sector>('select * from public.sectores where activo order by nombre')).rows);
  return <PanelDeRetiroEnNext sectores={sectores} />;
}
