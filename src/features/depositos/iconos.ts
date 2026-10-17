import type { NombreIcono } from '@/components/Icono';

// Los íconos que el dueño puede elegir para un depósito: uno por tipo de área. Salen del mismo juego que el resto de la app (Icono.tsx).
export const ICONOS_DEPOSITO = [
  'deposito', 'herramienta', 'paquete', 'cajas', 'fabrica', 'camion', 'tienda', 'laboratorio', 'empresa', 'etiqueta', 'carrito', 'estrella',
] as const satisfies readonly NombreIcono[];

export const ICONO_DEPOSITO_POR_DEFECTO: NombreIcono = 'deposito';

// Si el ícono guardado ya no está en la lista (o no hay depósito todavía), se usa el de depósito.
export function iconoDeDeposito(nombre: string | null | undefined): NombreIcono {
  return (ICONOS_DEPOSITO as readonly string[]).includes(nombre ?? '') ? (nombre as NombreIcono) : ICONO_DEPOSITO_POR_DEFECTO;
}
