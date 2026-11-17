import { createContext, useContext, type ComponentType } from 'react';
import type { BuscarRepuestos } from '../items/useRepuestosQueCoinciden';
import type { RotuloGenerado } from '../rotulos/tipos';
import type { EditarReparacionInput, NuevaReparacionInput, RegistrarEntregaInput, ReparacionConDetalle } from './tipos';

/**
 * Lo que las pantallas de Reparaciones leen y hacen. Lo pone cada app a su manera (Supabase en la de Vite, el servidor en la de Next) con
 * <ContextoDeReparaciones.Provider>, y las ventanas lo toman con useServicioDeReparaciones.
 */
export interface ServicioDeReparaciones {
  reparaciones: ReparacionConDetalle[] | undefined;
  isLoading: boolean;
  isError: boolean;
  proveedores: { id: string; nombre: string }[] | undefined;
  /** Los envíos vigentes (para elegir con cuál salió la reparación). */
  envios: RotuloGenerado[] | undefined;
  /** Envío (grupo) → la reparación activa que ya lo usa. */
  enviosAsignados: Map<string, string> | undefined;
  /** Envío → el detalle de sus bultos (para reconocerlo en la lista). */
  detallesDeEnvios: Map<string, string[]> | undefined;
  crear: (r: NuevaReparacionInput) => Promise<void>;
  editar: (r: EditarReparacionInput) => Promise<void>;
  /** Registra lo que volvió (quién la registra lo pone cada app: es quien tiene la sesión). */
  registrarEntrega: (e: Omit<RegistrarEntregaInput, 'registrado_por'>) => Promise<void>;
  eliminar: (id: string) => Promise<void>;
  buscarRepuestos: BuscarRepuestos;
  registrarError: (descripcion: string, err: unknown) => Promise<void>;
  /** "Ver envío": el envío vigente de ese grupo y la ventana que lo muestra. Sin ventana (todavía), el número se muestra sin enlace. */
  resolverEnvioVigente: (envioId: string) => Promise<string>;
  VerEnvio: ComponentType<{ open: boolean; onClose: () => void; rotuloId: string | null }> | null;
  /** El depósito manda cosas a reparar (lo decide Compras). Si no, lo que ya hay se ve y se recibe, pero no se cargan nuevas. Sin dato, sí. */
  sePuedenCrear?: boolean;
}

export const ContextoDeReparaciones = createContext<ServicioDeReparaciones | null>(null);

export function useServicioDeReparaciones(): ServicioDeReparaciones {
  const s = useContext(ContextoDeReparaciones);
  if (!s) throw new Error('Las pantallas de Reparaciones van dentro de <ContextoDeReparaciones.Provider>');
  return s;
}
