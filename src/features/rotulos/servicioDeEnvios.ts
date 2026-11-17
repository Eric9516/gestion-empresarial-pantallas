import { createContext, useContext } from 'react';
import type { RotuloSnapshot } from '../../lib/generarRotuloPdf';
import type { Comisionista } from '../comisionistas/tipos';
import type { Proveedor } from '../proveedores/tipos';
import type { RotuloBulto, RotuloFoto, RotuloGenerado } from './tipos';

export { MAX_FOTOS_ROTULO } from './fotosDelEnvio';

/** Un bulto del envío. `url`: el PDF ya guardado de los rótulos viejos (los de ahora se arman en el momento y no tienen). */
export type BultoDeEnvio = RotuloBulto & { url: string | null };
export type FotoDeEnvio = RotuloFoto & { url: string };
export interface EnvioConBultos { rotulo: RotuloGenerado; bultos: BultoDeEnvio[] }

/** Un artículo del stock para agregar a la descripción de un bulto. */
export interface ArticuloParaRotulo { id: string; codigo: string; descripcion: string; stock: number | null; unidad: string; deposito: string }

export interface EnvioAGuardar {
  proveedorId: string;
  /** Tamaño en milímetros. */
  w: number;
  h: number;
  /** Lo que se anota en cada bulto (uno por bulto). */
  bultosDetalle: string[];
  docInfo: { tipoDoc: string; numDoc: string; valorDeclarado: string; comisionistaId: string };
  extra: string;
  /** Editar crea una versión nueva del mismo envío (grupo) y la anterior queda en el historial. */
  editando: { rotuloId: string; grupoId: string; motivo: string } | null;
}

/**
 * Lo que las ventanas de Envíos (el editor del rótulo, el detalle, las versiones, las fotos y el comentario) leen y hacen. Lo pone cada app
 * a su manera (Supabase en la de Vite, el servidor en la de Next) con <ContextoDeEnvios.Provider>; también lo ponen Proveedores ("Rótulo")
 * y Reparaciones ("Ver envío"), que abren estas mismas ventanas.
 */
export interface ServicioDeEnvios {
  proveedores: Proveedor[] | undefined;
  comisionistas: Comisionista[] | undefined;
  /** Si el envío lleva comisionista (cuando la empresa usa Comisionistas). */
  conComisionistas: boolean;
  /** El diseño del rótulo de ahora (lo configura el administrador); cada envío guarda una copia del que tenía al crearse. */
  diseno: RotuloSnapshot | undefined;
  leerEnvio: (id: string) => Promise<EnvioConBultos>;
  versiones: (grupoId: string) => Promise<RotuloGenerado[]>;
  guardar: (e: EnvioAGuardar) => Promise<EnvioConBultos>;
  /** Texto vacío = sin comentario. */
  guardarComentario: (id: string, comentario: string) => Promise<void>;
  fotos: (grupoId: string) => Promise<FotoDeEnvio[]>;
  /** La foto ya achicada en el navegador. */
  subirFoto: (f: { grupoId: string; proveedorId: string; proveedorNombre: string; foto: Blob }) => Promise<void>;
  eliminarFoto: (f: FotoDeEnvio) => Promise<void>;
  registrarError: (descripcion: string, err: unknown) => Promise<void>;
  /** Buscar artículos del stock (en los depósitos de la persona) para la descripción de un bulto. Sin esto (o sin depósitos), no se ofrece. */
  buscarArticulos?: (texto: string) => Promise<ArticuloParaRotulo[]>;
}

export const ContextoDeEnvios = createContext<ServicioDeEnvios | null>(null);

export function useServicioDeEnvios(): ServicioDeEnvios {
  const s = useContext(ContextoDeEnvios);
  if (!s) throw new Error('Las ventanas de Envíos van dentro de <ContextoDeEnvios.Provider>');
  return s;
}
