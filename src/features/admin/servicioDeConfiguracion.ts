import { createContext, useContext, type ComponentType, type ReactNode } from 'react';
import type { Database } from '../../lib/database.types';
import type { integraciones, Modulos, ModuloId } from '../../lib/modulos';
import type { Cursor } from '../../lib/paginacion';
import type { LetraPdf } from '../../lib/preferencias';
import type { RotuloCampos, RotuloDesign } from '../../lib/rotuloDesign';
import type { Profile } from '../../lib/types';
import type { CampoCustom } from '../config/camposCustom';
import type { DatosDeposito, Deposito } from '../depositos/tipos';
import type { Familia, Subfamilia } from '../familias/tipos';
import type { DatosDeFamiliasParaImportar, LoteDeFamilias } from '../familias/importarFamilias';
import type { DatosParaImportarStock, FilaAImportar } from '../items/importarStock';
import type { BuscarRepuestos } from '../items/useRepuestosQueCoinciden';
import type { RotuloDiseno } from '../rotulos/tipos';
import type { Sector } from '../sectores/tipos';
import type { ErrorLogRow } from './tipos';
import type { FilaFotoPendiente } from './tipos';
import type { FilaActividad, FiltrosHistorial } from './historialDeActividad';
import type { FilaPapelera } from './tipos';
import type { Sugerencia } from './tipos';
import type { Usuario, UsuarioInput } from './tipos';
import type { FotoSlot } from '../items/slotsDeFoto';

export type Configuracion = Database['public']['Tables']['configuracion']['Row'];

export interface DatosDeEmpresa {
  empresa_nombre: string; empresa_direccion: string; empresa_telefono: string; empresa_email: string; logo_base64?: string;
  // Salen en los comprobantes (remitos, cargas de stock…)
  empresa_razon_social?: string; empresa_cuit?: string; empresa_web?: string;
  // null = volver a los colores originales de la app
  color_primario?: string | null; color_deposito?: string | null;
  zona_horaria?: string;
}

export interface DisenoDeRotuloAGuardar { rotulo_design: RotuloDesign; rotulo_pie: string; rotulo_campos: RotuloCampos }

/** La última planilla de codificación que se subió (para volver a bajarla). */
export interface PlanillaDeFamilias { nombre_archivo: string; url: string; actualizada_at: string }

export interface ConteosIniciales { sectores: number; familias: number; repuestos: number; usuarios: number }

/**
 * Lo que las pestañas de Configuración leen y hacen. Lo pone cada app a su manera (Supabase en la de Vite, el servidor en la de Next) con
 * <ContextoDeConfiguracion.Provider>, y cada pestaña toma lo suyo con useServicioDeConfiguracion. Después de cada cambio, cada app vuelve a
 * leer lo que corresponde (la cabecera, los menús, los módulos).
 */
export interface ServicioDeConfiguracion {
  /** Quién mira (para lo que solo puede el dueño, o uno mismo). */
  perfil: Profile;
  /** El selector del depósito en el que se trabaja (lo de la pestaña Depósito es de ese depósito). Sin él, no se muestra. */
  selectorDeDeposito?: ReactNode;
  /** El depósito en el que se está: al cambiarlo, la pestaña abierta se vuelve a leer. */
  depositoActual?: string | null;
  /** El grupo con el que se abre (por ejemplo, 'mantenimiento' al entrar desde Mantenimiento). */
  grupoInicial?: string | null;
  /** Mantenimiento → Excel (importar y exportar), con las acciones de la app. Sin él, la pestaña no aparece. */
  excelDeMantenimiento?: ReactNode;
  /** Mantenimiento → Etiquetas QR de los equipos (en cantidad), con los datos de la app. Sin él, la pestaña no aparece. */
  etiquetasQrDeMantenimiento?: ReactNode;
  /** Mantenimiento → Avisos al celular (prenderlos o apagarlos por persona), con los datos de la app. Sin él, la pestaña no aparece. */
  avisosDeMantenimiento?: ReactNode;
  /** La configuración de la empresa (la fila única). */
  config: Configuracion | undefined;
  modulos: Modulos;
  integ: ReturnType<typeof integraciones>;
  /** Para la pestaña Módulos: lo que incluye el plan y lo que apagó el dueño. `leida`: se pudo leer la licencia. */
  licencia: { contratados: Modulos; apagados: Partial<Record<ModuloId, boolean>>; leida: boolean; listo: boolean };
  letraPdf: LetraPdf;
  cambiarLetraPdf: (l: LetraPdf) => void;
  /** Sugerencias nuevas desde la última vez (el número rojo), y "ya las vi". */
  sugerenciasNuevas: number;
  marcarSugerenciasVistas: () => void;
  registrarError: (descripcion: string, err: unknown) => Promise<void>;

  empresa: { guardar: (datos: DatosDeEmpresa) => Promise<void> };
  rotulo: {
    guardar: (d: DisenoDeRotuloAGuardar) => Promise<void>;
    restablecer: () => Promise<void>;
    modelos: () => Promise<RotuloDiseno[]>;
    guardarModelo: (m: { nombre: string; design: RotuloDesign; pie: string; campos: RotuloCampos }) => Promise<void>;
    usarModelo: (m: RotuloDiseno) => Promise<void>;
    eliminarModelo: (id: number) => Promise<void>;
  };
  comisionistas: { guardarCampos: (campos: CampoCustom[]) => Promise<void> };
  /** Solo el dueño: apaga o prende un módulo de su plan. */
  definirModulo: (id: ModuloId, apagado: boolean) => Promise<void>;
  sectores: {
    leer: () => Promise<Sector[]>;
    agregar: (nombre: string) => Promise<void>;
    renombrar: (id: string, nombre: string) => Promise<void>;
    activar: (id: string, activo: boolean) => Promise<void>;
    eliminar: (id: string) => Promise<void>;
  };
  familias: {
    /** `deposito`: el nombre del depósito en el que se está (las familias son de cada depósito). */
    leer: () => Promise<{ familias: Familia[]; subfamilias: Subfamilia[]; deposito?: string | null }>;
    renombrarFamilia: (id: string, nombre: string) => Promise<void>;
    renombrarSubfamilia: (id: string, nombre: string) => Promise<void>;
    planilla: () => Promise<PlanillaDeFamilias | null>;
    datosParaImportar: () => Promise<DatosDeFamiliasParaImportar>;
    importar: (lote: LoteDeFamilias) => Promise<void>;
    subirPlanilla: (archivo: File) => Promise<void>;
  };
  depositos: {
    leer: () => Promise<Deposito[]>;
    /** Cuántos depósitos activos permite el plan. */
    tope: () => Promise<number>;
    crear: (d: DatosDeposito & { prefijo: string }) => Promise<void>;
    editar: (d: DatosDeposito & { id: string; activo: boolean; prefijo?: string }) => Promise<void>;
    /** Solo un dueño, y solo un depósito sin historia. */
    borrar?: (id: string) => Promise<void>;
  };
  /**
   * Abre la ficha de una persona (null: una nueva) en una página propia (la app de Next). Sin esto, la ficha se abre en una ventana
   * flotante, como siempre (la app de Vite).
   */
  abrirUsuario?: (id: string | null) => void;
  usuarios: {
    leer: () => Promise<Usuario[]>;
    crear: (input: UsuarioInput, contrasena: string) => Promise<void>;
    editar: (id: string, input: UsuarioInput) => Promise<void>;
    activar: (id: string, activo: boolean) => Promise<void>;
    eliminar: (id: string) => Promise<void>;
    agregarDueno: (id: string) => Promise<void>;
    quitarDueno: (id: string) => Promise<void>;
    cambiarContrasena: (id: string, contrasena: string) => Promise<void>;
  };
  historial: {
    pagina: (f: FiltrosHistorial, despuesDe: FilaActividad | null, limite: number) => Promise<FilaActividad[]>;
    /** Cuántas filas daría la descarga, contando como mucho hasta `tope`. */
    cantidad: (f: FiltrosHistorial, tope: number) => Promise<number>;
    personas: () => Promise<{ id: string; nombre: string }[]>;
    depositos: (usuario: string) => Promise<{ id: string; nombre: string }[]>;
  };
  errores: { pagina: (despuesDe: Cursor | null) => Promise<ErrorLogRow[]>; limpiar: () => Promise<void> };
  sugerencias: { pagina: (despuesDe: Cursor | null) => Promise<Sugerencia[]>; limpiar: () => Promise<void> };
  papelera: {
    leer: () => Promise<FilaPapelera[]>;
    restaurar: (tipo: FilaPapelera['tipo'], id: string) => Promise<void>;
    purgar: (tipo: FilaPapelera['tipo'], id: string) => Promise<void>;
  };
  fotosPendientes: {
    leer: () => Promise<FilaFotoPendiente[]>;
    aprobar: (itemId: string, slot: FotoSlot) => Promise<void>;
    rechazar: (f: FilaFotoPendiente) => Promise<void>;
  };
  repuestos: {
    buscar: BuscarRepuestos;
    datosParaImportarStock: () => Promise<DatosParaImportarStock>;
    importarStock: (filas: FilaAImportar[]) => Promise<void>;
    /** El alta de un repuesto (cada app tiene su formulario, con lo que necesita). */
    FormularioNuevo: ComponentType<{ open: boolean; onClose: () => void }>;
  };
  inicial: {
    conteos: () => Promise<ConteosIniciales>;
    /** Cierra el asistente (se terminó o se lo saltó) y lleva a la entrada. */
    cerrar: () => Promise<void>;
  };
}

export const ContextoDeConfiguracion = createContext<ServicioDeConfiguracion | null>(null);

/** Lo que usa la ficha de una persona: en la página propia de la app de Next se pone solo esto (ContextoDeUsuarios), sin toda la Configuración. */
export type ServicioDeUsuarios = Pick<ServicioDeConfiguracion, 'perfil' | 'modulos' | 'usuarios'> & { depositos: Pick<ServicioDeConfiguracion['depositos'], 'leer'> };
export const ContextoDeUsuarios = createContext<ServicioDeUsuarios | null>(null);

/** Para la ficha de una persona: su propio servicio (página aparte) o el de la Configuración (ventana flotante). */
export function useServicioDeUsuarios(): ServicioDeUsuarios {
  const propio = useContext(ContextoDeUsuarios);
  const deLaConfiguracion = useContext(ContextoDeConfiguracion);
  const s = propio ?? deLaConfiguracion;
  if (!s) throw new Error('La ficha de un usuario va dentro de <ContextoDeUsuarios.Provider> o de <ContextoDeConfiguracion.Provider>');
  return s;
}

export function useServicioDeConfiguracion(): ServicioDeConfiguracion {
  const s = useContext(ContextoDeConfiguracion);
  if (!s) throw new Error('Las pestañas de Configuración van dentro de <ContextoDeConfiguracion.Provider>');
  return s;
}
