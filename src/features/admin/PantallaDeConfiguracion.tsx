import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { textoDeAviso } from '../avisos/textoDeAviso';
import type { ModuloId } from '../../lib/modulos';
import { administraEquipos, isDirectorioAdmin, isDepositoAdmin, isOwner, puedeGestionarDepositos, puedeResetearContrasenas, puedeVerAuditoria, puedeVerErrores, puedeVerSugerencias, type Profile } from '../../lib/types';
import ConfiguracionInicial from '../inicial/ConfiguracionInicial';
import EmpresaPane from './EmpresaPane';
import RotuloDesignPane from './RotuloDesignPane';
import ComisionistasCamposPane from './ComisionistasCamposPane';
import RepuestosPane from './RepuestosPane';
import SectoresPanel from '../sectores/SectoresPanel';
import FamiliasPane from './FamiliasPane';
import DepositosPane from '../depositos/DepositosPane';
import UsuariosPane from './UsuariosPane';
import HistorialPane from './HistorialPane';
import ErroresPane from './ErroresPane';
import PapeleraPane from './PapeleraPane';
import FotosPendientesPane from './FotosPendientesPane';
import SugerenciasPane from './SugerenciasPane';
import ModulosPane from './ModulosPane';
import { useServicioDeConfiguracion } from './servicioDeConfiguracion';
import { Icono } from '@/components/Icono';

type Grupo = 'directorio' | 'deposito' | 'mantenimiento' | 'general';

interface AdminTab {
  id: string;
  group: Grupo;
  label: ReactNode;
  check: (profile: Profile | null) => boolean;
  // Si el módulo está desactivado, la pestaña no aparece (la configuración de algo que no se usa no sirve).
  modulo?: ModuloId;
  // Aparece si está activo alguno de estos módulos.
  algunoDe?: ModuloId[];
  Pane: () => ReactElement;
}

// Espeja ADMIN_TABS de main.js: una sola pantalla de Configuración con pestañas
// agrupadas, cada una gateada por su propio permiso.
const ADMIN_TABS: AdminTab[] = [
  // El asistente se abre solo la primera vez que entra el dueño (ver PuertaConfiguracionInicial) y
  // queda siempre acá para retomarlo.
  { id: 'inicial', group: 'general', label: <><Icono n="cohete" /> Configuración inicial</>, check: isOwner, Pane: ConfiguracionInicial },
  // Empresa sirve a toda la aplicación, por eso está en General.
  { id: 'empresa', group: 'general', label: <><Icono n="empresa" /> Empresa</>, check: isDirectorioAdmin, Pane: EmpresaPane },
  { id: 'rotulo', group: 'directorio', label: <><Icono n="etiqueta" /> Rótulo</>, check: isDirectorioAdmin, modulo: 'envios', Pane: RotuloDesignPane },
  { id: 'comisionistas', group: 'directorio', label: <><Icono n="acuerdo" /> Comisionistas</>, check: isDirectorioAdmin, modulo: 'comisionistas', Pane: ComisionistasCamposPane },
  { id: 'repuestos', group: 'deposito', label: <><Icono n="herramienta" /> Artículos</>, check: isDepositoAdmin, modulo: 'deposito', Pane: RepuestosPane },
  { id: 'sectores', group: 'deposito', label: <><Icono n="fabrica" /> Sectores</>, check: isDepositoAdmin, modulo: 'deposito', Pane: SectoresPanel },
  { id: 'fotos-pendientes', group: 'deposito', label: <><Icono n="camara" /> Fotos pendientes</>, check: isOwner, modulo: 'deposito', Pane: FotosPendientesPane },
  { id: 'familias', group: 'deposito', label: <><Icono n="etiqueta" /> Familias</>, check: isOwner, modulo: 'deposito', Pane: FamiliasPane },
  { id: 'depositos', group: 'deposito', label: <><Icono n="deposito" /> Depósitos</>, check: puedeGestionarDepositos, modulo: 'deposito', Pane: DepositosPane },
  // Solo el dueño: apaga o prende, dentro de su plan, los módulos que usa (lo que el plan incluye lo define quien vende).
  // Mantenimiento: lo ve el rol más alto del área (el responsable) y el dueño (pedido del dueño, 12/11/2026)
  { id: 'mantenimiento-excel', group: 'mantenimiento', label: <><Icono n="planilla" /> Excel</>, check: administraEquipos, modulo: 'mantenimiento', Pane: ExcelDeMantenimiento },
  { id: 'mantenimiento-qr', group: 'mantenimiento', label: <><Icono n="qr" /> Etiquetas QR</>, check: administraEquipos, modulo: 'mantenimiento', Pane: EtiquetasQrDeMantenimiento },
  { id: 'mantenimiento-avisos', group: 'mantenimiento', label: <><Icono n="aviso" /> Avisos</>, check: administraEquipos, modulo: 'mantenimiento', Pane: AvisosDeMantenimiento },
  { id: 'modulos', group: 'general', label: <><Icono n="modulos" /> Módulos</>, check: isOwner, Pane: ModulosPane },
  { id: 'usuarios', group: 'general', label: <><Icono n="usuarios" /> Usuarios</>, check: p => isOwner(p) || puedeResetearContrasenas(p), Pane: UsuariosPane },
  { id: 'historial', group: 'general', label: <><Icono n="historial" /> Historial</>, check: puedeVerAuditoria, algunoDe: ['deposito', 'proveedores', 'comisionistas'], Pane: HistorialPane },
  { id: 'errores', group: 'general', label: <><Icono n="error" /> Errores</>, check: puedeVerErrores, Pane: ErroresPane },
  { id: 'papelera', group: 'general', label: <><Icono n="borrar" /> Papelera</>, check: isOwner, Pane: PapeleraPane },
  { id: 'sugerencias', group: 'general', label: <><Icono n="mensaje" /> Sugerencias</>, check: puedeVerSugerencias, Pane: SugerenciasPane },
];

const GRUPOS: { id: Grupo; icon: ReactNode; label: string }[] = [
  { id: 'directorio', icon: <Icono n="tabla" />, label: 'Directorio' },
  { id: 'deposito', icon: <Icono n="herramienta" />, label: 'Depósito' },
  { id: 'mantenimiento', icon: <Icono n="mantenimiento" />, label: 'Mantenimiento' },
  { id: 'general', icon: <Icono n="config" />, label: 'General' },
];

/** Las pestañas de Mantenimiento (Excel y etiquetas QR): las pone la app (con sus acciones). */
function ExcelDeMantenimiento() {
  return <>{useServicioDeConfiguracion().excelDeMantenimiento ?? null}</>;
}
function EtiquetasQrDeMantenimiento() {
  return <>{useServicioDeConfiguracion().etiquetasQrDeMantenimiento ?? null}</>;
}
function AvisosDeMantenimiento() {
  return <>{useServicioDeConfiguracion().avisosDeMantenimiento ?? null}</>;
}

// Configuración: grupos (Directorio, Depósito, Mantenimiento, General), sus pestañas y la pestaña abierta. Cada pestaña aparece si la persona tiene el
// permiso y la empresa usa el módulo. La comparten la app de Vite y la de Next (cada una pone su cabecera y el servicio).
export default function PantallaDeConfiguracion() {
  const {
    perfil: profile, config, modulos, licencia: { listo }, sugerenciasNuevas, marcarSugerenciasVistas, selectorDeDeposito, depositoActual, grupoInicial, excelDeMantenimiento,
    etiquetasQrDeMantenimiento, avisosDeMantenimiento,
  } = useServicioDeConfiguracion();

  const visibles = useMemo(
    () => ADMIN_TABS.filter(t => t.check(profile) && (!t.modulo || modulos[t.modulo]) && (!t.algunoDe || t.algunoDe.some(m => modulos[m]))
      && (t.id !== 'mantenimiento-excel' || !!excelDeMantenimiento) && (t.id !== 'mantenimiento-qr' || !!etiquetasQrDeMantenimiento)
      && (t.id !== 'mantenimiento-avisos' || !!avisosDeMantenimiento)),
    [profile, modulos, excelDeMantenimiento, etiquetasQrDeMantenimiento, avisosDeMantenimiento],
  );
  // al entrar desde un área (por ejemplo, Mantenimiento), arranca en su grupo; o en una pestaña (al volver de la ficha de un usuario: ?grupo=usuarios)
  const [tabId, setTabId] = useState<string>(() => (visibles.find(t => t.id === grupoInicial) ?? visibles.find(t => t.group === grupoInicial))?.id ?? '');

  // Mientras el asistente no se cerró, es lo primero que se ve; después, la primera pestaña "de trabajo".
  const asistentePendiente = !!config && config.inicial_cerrada_at == null;
  const primeraDelGrupo = (group?: Grupo) => visibles.find(t => t.group === group && !(t.id === 'inicial' && !asistentePendiente))
    ?? visibles.find(t => t.group === group);
  const porDefecto = (asistentePendiente && visibles.find(t => t.id === 'inicial'))
    || visibles.find(t => t.id !== 'inicial') || visibles[0];

  const tabActual = visibles.find(t => t.id === tabId) ?? porDefecto;
  const grupoActivo = tabActual?.group;

  function selectGroup(group: Grupo) {
    const primera = primeraDelGrupo(group);
    if (primera) setTabId(primera.id);
  }

  // Al estar mirando las sugerencias, lo que llegue ya está visto.
  const mirandoSugerencias = tabActual?.id === 'sugerencias';
  useEffect(() => { if (mirandoSugerencias && sugerenciasNuevas > 0) marcarSugerenciasVistas(); }, [mirandoSugerencias, sugerenciasNuevas, marcarSugerenciasVistas]);

  if (!listo) return <div className="loading-screen">Cargando...</div>;
  if (!tabActual) return null;

  return (
    <>
      <div className="admin-group-tabs">
        {GRUPOS.filter(g => visibles.some(t => t.group === g.id)).map(g => (
          <button key={g.id} className={`admin-group-tab${grupoActivo === g.id ? ' active' : ''}`} onClick={() => selectGroup(g.id)}>
            {g.icon} <span className="admin-group-tab-label">{g.label}</span>
            {g.id === 'general' && grupoActivo !== 'general' && sugerenciasNuevas > 0 && <span className="aviso-numero">{textoDeAviso(sugerenciasNuevas)}</span>}
          </button>
        ))}
      </div>
      <div className="admin-subnav">
        {visibles.filter(t => t.group === grupoActivo).map(t => (
          <button key={t.id} className={`admin-subtab${tabId === t.id ? ' active' : ''}`} onClick={() => setTabId(t.id)}>
            {t.label}
            {t.id === 'sugerencias' && sugerenciasNuevas > 0 && <span className="aviso-numero">{textoDeAviso(sugerenciasNuevas)}</span>}
          </button>
        ))}
      </div>

      {/* lo de la pestaña Depósito es de un depósito (menos la lista de depósitos): se ve y se elige en cuál */}
      {grupoActivo === 'deposito' && tabActual.id !== 'depositos' && selectorDeDeposito && (
        <div className="config-deposito-actual">Estás trabajando en el depósito: {selectorDeDeposito}</div>
      )}
      <tabActual.Pane key={grupoActivo === 'deposito' ? depositoActual ?? '' : ''} />
    </>
  );
}
