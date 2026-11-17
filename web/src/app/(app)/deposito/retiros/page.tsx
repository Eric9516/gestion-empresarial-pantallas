import type { UsuarioBasico } from '@/lib/nombreUsuario';
import { puedeAjustarInventario, puedeVerTodosLosRetiros } from '@/lib/types';
import { comoUsuario } from '~/lib/db';
import { contexto } from '~/lib/contexto';
import { datosIniciales } from '~/lib/datosIniciales';
import { paginaDeRetiros } from '../acciones';
import PantallaDeRetirosEnNext from './PantallaDeRetirosEnNext';

// Depósito → Retiros. Quien puede ver los de todos (dueño o con el permiso) elige además por persona; el resto ve los suyos (la base decide igual).
// Quien puede hacer movimientos de stock registra desde acá lo que vuelve de un retiro (una carga de stock: el retiro no se toca).
export default async function Retiros() {
  const { perfil } = await contexto();
  const admin = puedeVerTodosLosRetiros(perfil);
  const usuarios = admin
    ? await comoUsuario(perfil.id, async c => (await c.query<UsuarioBasico>('select id, nombre, apellido, email from public.usuarios_perfil')).rows)
    : [];
  // la primera página, sin filtros (los últimos 30 días), va con la pantalla
  const hace30 = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const primera = await paginaDeRetiros({ texto: '', usuario: '', desde: hace30, hasta: null }, null);
  return <PantallaDeRetirosEnNext admin={admin} puedeDevolver={puedeAjustarInventario(perfil)} usuarios={usuarios} iniciales={datosIniciales(primera)} />;
}
