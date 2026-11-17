// Cómo se muestra una persona (nombre y apellido, o su correo). Aparte de usuarios.ts (que habla con la base) para usarlo en cualquier pantalla,
// también en la app de Next.
export interface UsuarioBasico {
  id: string;
  nombre: string | null;
  apellido: string | null;
  email: string | null;
}

export function nombreUsuario(u: UsuarioBasico | null | undefined, fallback = 'Desconocido'): string {
  if (!u) return fallback;
  return `${u.nombre || ''} ${u.apellido || ''}`.trim() || u.email || fallback;
}
