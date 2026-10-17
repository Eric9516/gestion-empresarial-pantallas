import { supabase } from '../../lib/supabaseClient';

// Cambia la contraseña de quien tiene la sesión abierta. Primero se comprueba la actual (volviendo a iniciar sesión con ella):
// así, si alguien deja la computadora abierta, no puede cambiarle la clave a la persona.
export async function cambiarContrasena(email: string, actual: string, nueva: string): Promise<void> {
  const { error: errorActual } = await supabase.auth.signInWithPassword({ email, password: actual });
  if (errorActual) throw new Error('La contraseña actual no es correcta');
  const { error } = await supabase.auth.updateUser({ password: nueva });
  if (error) throw error;
}

// Cierra la sesión en todos los demás equipos (computadoras o celulares) y deja abierta solo esta.
export async function cerrarSesionEnLosDemasEquipos(): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: 'others' });
  if (error) throw error;
}
