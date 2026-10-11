import { supabase } from './supabaseClient';

export interface UsuarioBasico {
  id: string;
  nombre: string | null;
  apellido: string | null;
  email: string | null;
}

// Quién hizo algo (borró un proveedor, generó un rótulo): se repite en Papelera
// y en la pantalla de Envíos — una sola consulta filtrada por ids para las dos.
export async function fetchUsuariosPorIds(ids: string[]): Promise<Record<string, UsuarioBasico>> {
  const unicos = [...new Set(ids)];
  if (!unicos.length) return {};
  const { data, error } = await supabase.from('usuarios_perfil').select('id,nombre,apellido,email').in('id', unicos);
  if (error) throw error;
  return Object.fromEntries((data ?? []).map(u => [u.id, u]));
}

export function nombreUsuario(u: UsuarioBasico | null | undefined, fallback = 'Desconocido'): string {
  if (!u) return fallback;
  return `${u.nombre || ''} ${u.apellido || ''}`.trim() || u.email || fallback;
}
