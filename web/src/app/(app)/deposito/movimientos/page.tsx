import { notFound } from 'next/navigation';
import { isOwner, puedeAjustarInventario } from '@/lib/types';
import { contexto } from '~/lib/contexto';
import { datosIniciales } from '~/lib/datosIniciales';
import { paginaDeMovimientos } from '../acciones';
import PantallaDeMovimientosEnNext from './PantallaDeMovimientosEnNext';

// Depósito → Movimientos: solo para quien puede ajustar el inventario (dueño o autorizado); anular, solo el dueño. La base lo impone igual.
export default async function Movimientos() {
  const { perfil } = await contexto();
  if (!puedeAjustarInventario(perfil)) notFound();
  const primera = await paginaDeMovimientos({ texto: '', filtro: 'todos', desde: null, hasta: null }, null);
  return <PantallaDeMovimientosEnNext puedeAnular={isOwner(perfil)} iniciales={datosIniciales(primera)} />;
}
