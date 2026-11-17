'use client';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import FichaDeUsuario from '@/features/admin/FichaDeUsuario';
import { ContextoDeUsuarios, type ServicioDeUsuarios } from '@/features/admin/servicioDeConfiguracion';
import type { Usuario } from '@/features/admin/tipos';
import type { Modulos } from '@/lib/modulos';
import type { Profile } from '@/lib/types';
import * as a from '../../acciones';

// Las acciones del servidor devuelven el error en vez de lanzarlo (Next no deja pasar su texto): acá se lanza, con su código si lo trae.
async function hecho(r: Promise<{ error: string | null; codigo?: string }>) {
  const { error, codigo } = await r;
  if (error) throw Object.assign(new Error(error), { code: codigo });
}

/**
 * La ficha de una persona en su página, con lo que hace falta del servidor. Al guardar, bloquear o cambiar el cargo de dueño se queda (con el
 * aviso de que se hizo) y se vuelve a leer; al crear o eliminar, vuelve a la lista.
 */
export default function FichaDeUsuarioEnNext({ perfil, modulos, usuario }: { perfil: Profile; modulos: Modulos; usuario: Usuario | null }) {
  const router = useRouter();
  const servicio = useMemo<ServicioDeUsuarios>(() => ({
    perfil, modulos,
    depositos: { leer: a.leerDepositos },
    usuarios: {
      leer: a.leerUsuarios,
      crear: (input, contrasena) => hecho(a.crearUsuario(input, contrasena)),
      editar: (id, input) => hecho(a.editarUsuario(id, input)),
      activar: (id, activo) => hecho(a.activarUsuario(id, activo)),
      eliminar: id => hecho(a.eliminarUsuario(id)),
      agregarDueno: id => hecho(a.agregarDueno(id)),
      quitarDueno: id => hecho(a.quitarDueno(id)),
      cambiarContrasena: (id, contrasena) => hecho(a.cambiarContrasena(id, contrasena)),
    },
  }), [perfil, modulos]);
  const alTerminar = (que: 'guardado' | 'creado' | 'cambiado' | 'eliminado') => {
    if (que === 'creado' || que === 'eliminado') router.push('/configuracion?grupo=usuarios');
    router.refresh();
  };
  return (
    <ContextoDeUsuarios.Provider value={servicio}>
      <FichaDeUsuario usuario={usuario} activa alTerminar={alTerminar} enPagina />
    </ContextoDeUsuarios.Provider>
  );
}
