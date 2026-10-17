import { puedeAjustarInventario, puedeGestionarDepositos, puedeResetearContrasenas, puedeVerErrores, puedeVerSugerencias, puedeVerTodosLosRetiros, type Profile } from '../../lib/types';

// Lo que una persona puede hacer, en palabras. "Mi perfil" muestra solo el nombre y si lo tiene o no;
// qué significa cada cosa se explica aparte, con el botón de ayuda (signo de pregunta).
export interface Permiso {
  clave: string;
  nombre: string;
  explicacion: string;
  tiene: boolean;
}

interface Contexto {
  profile: Profile | null;
  /** El Depósito está prendido para esta empresa (si no, sus permisos no aplican y no se muestran). */
  deposito: boolean;
}

export function permisosDe({ profile, deposito }: Contexto): Permiso[] {
  return [
    ...(deposito ? [
      { clave: 'retiros', nombre: 'Ver todos los retiros', explicacion: 'Ve los retiros que hizo cualquier persona, no solo los suyos.', tiene: puedeVerTodosLosRetiros(profile) },
      { clave: 'ajustes', nombre: 'Ajustar inventario', explicacion: 'Puede cargar stock y corregirlo (Movimientos). Cada cambio queda registrado con su nombre.', tiene: puedeAjustarInventario(profile) },
      { clave: 'depositos', nombre: 'Gestionar depósitos', explicacion: 'Puede crear depósitos y cambiarles el nombre, el color, el ícono o la letra (Configuración, Depósitos).', tiene: puedeGestionarDepositos(profile) },
    ] : []),
    { clave: 'errores', nombre: 'Ver errores', explicacion: 'Ve los errores que registró la aplicación (Configuración, Errores). Sirve para avisar de un problema.', tiene: puedeVerErrores(profile) },
    { clave: 'sugerencias', nombre: 'Ver sugerencias', explicacion: 'Lee las sugerencias que mandan las demás personas y recibe el aviso cuando llega una nueva.', tiene: puedeVerSugerencias(profile) },
    { clave: 'contrasenas', nombre: 'Resetear contraseñas', explicacion: 'Puede ponerle una contraseña nueva a otra persona que se olvidó la suya.', tiene: puedeResetearContrasenas(profile) },
  ];
}

// Qué significa cada rol.
export const ROLES_EXPLICADOS: { nombre: string; explicacion: string }[] = [
  { nombre: 'Dueño del sistema', explicacion: 'Control total: configura la empresa, los módulos y las personas, y ve todo. Puede haber más de uno.' },
  { nombre: 'Administrador', explicacion: 'Gestiona su área: configura lo suyo y ve los informes. No cambia la licencia ni los módulos de la empresa.' },
  { nombre: 'Usuario', explicacion: 'Trabaja en su área (buscar, cargar, retirar) sin tocar la configuración.' },
  { nombre: 'Sin acceso', explicacion: 'No puede entrar a esa área.' },
];

// Una fecha de la base, en el formato de acá (día/mes/año). Si no hay fecha, un guion.
export function fechaCorta(iso: string | null | undefined, conHora = false): string {
  if (!iso) return '—';
  const f = new Date(iso);
  if (Number.isNaN(f.getTime())) return '—';
  const opciones: Intl.DateTimeFormatOptions = conHora
    ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: '2-digit', year: 'numeric' };
  return f.toLocaleString('es-AR', opciones);
}

export const LARGO_MINIMO_CLAVE = 8;

// Valida el cambio de contraseña antes de pedirle nada a la base. Devuelve el mensaje de lo que falta, o null si está bien.
export function problemaDeLaClave(actual: string, nueva: string, repetida: string): string | null {
  if (!actual) return 'Escribí tu contraseña actual';
  if (nueva.length < LARGO_MINIMO_CLAVE) return `La contraseña nueva debe tener al menos ${LARGO_MINIMO_CLAVE} caracteres`;
  if (nueva === actual) return 'La contraseña nueva tiene que ser distinta de la actual';
  if (nueva !== repetida) return 'Las contraseñas nuevas no coinciden';
  return null;
}
