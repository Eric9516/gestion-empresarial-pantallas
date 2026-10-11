import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { isDirectorioAdmin, isMantenimientoAdmin, isOwner, puedeResetearContrasenas, puedeVerErrores, puedeVerSugerencias, tieneAccesoAdmin, type Profile } from '../lib/types';
import UserMenu from '../components/UserMenu';
import MobileMenu from '../components/MobileMenu';
import type { ModuloId } from '../lib/modulos';
import { useConfiguracionQuery } from '../features/config/useConfiguracion';
import { useModulos } from '../features/config/useModulos';
import ConfiguracionInicial from '../features/inicial/ConfiguracionInicial';
import EmpresaPane from '../features/admin/EmpresaPane';
import RotuloDesignPane from '../features/admin/RotuloDesignPane';
import ComisionistasCamposPane from '../features/admin/ComisionistasCamposPane';
import RepuestosPane from '../features/admin/RepuestosPane';
import SectoresPanel from '../features/sectores/SectoresPanel';
import FamiliasPane from '../features/admin/FamiliasPane';
import UsuariosPane from '../features/admin/UsuariosPane';
import HistorialPane from '../features/admin/HistorialPane';
import ErroresPane from '../features/admin/ErroresPane';
import PapeleraPane from '../features/admin/PapeleraPane';
import FotosPendientesPane from '../features/admin/FotosPendientesPane';
import SugerenciasPane from '../features/admin/SugerenciasPane';
import ModulosPane from '../features/admin/ModulosPane';
import { Icono } from '@/components/Icono';
import type { ReactNode } from 'react';

type Grupo = 'directorio' | 'mantenimiento' | 'general';

interface AdminTab {
  id: string;
  group: Grupo;
  label: ReactNode;
  check: (profile: Profile | null) => boolean;
  // Si el módulo está desactivado, la pestaña no aparece (la configuración de algo que no se usa no sirve).
  modulo?: ModuloId;
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
  { id: 'repuestos', group: 'mantenimiento', label: <><Icono n="herramienta" /> Repuestos</>, check: isMantenimientoAdmin, modulo: 'deposito', Pane: RepuestosPane },
  { id: 'sectores', group: 'mantenimiento', label: <><Icono n="fabrica" /> Sectores</>, check: isMantenimientoAdmin, modulo: 'deposito', Pane: SectoresPanel },
  { id: 'fotos-pendientes', group: 'mantenimiento', label: <><Icono n="camara" /> Fotos pendientes</>, check: isOwner, modulo: 'deposito', Pane: FotosPendientesPane },
  { id: 'familias', group: 'mantenimiento', label: <><Icono n="etiqueta" /> Familias</>, check: isOwner, modulo: 'deposito', Pane: FamiliasPane },
  // Solo el dueño: apaga o prende, dentro de su plan, los módulos que usa (lo que el plan incluye lo define quien vende).
  { id: 'modulos', group: 'general', label: <><Icono n="modulos" /> Módulos</>, check: isOwner, Pane: ModulosPane },
  { id: 'usuarios', group: 'general', label: <><Icono n="usuarios" /> Usuarios</>, check: p => isOwner(p) || puedeResetearContrasenas(p), Pane: UsuariosPane },
  { id: 'historial', group: 'general', label: <><Icono n="historial" /> Historial</>, check: isOwner, Pane: HistorialPane },
  { id: 'errores', group: 'general', label: <><Icono n="error" /> Errores</>, check: puedeVerErrores, Pane: ErroresPane },
  { id: 'papelera', group: 'general', label: <><Icono n="borrar" /> Papelera</>, check: isOwner, Pane: PapeleraPane },
  { id: 'sugerencias', group: 'general', label: <><Icono n="mensaje" /> Sugerencias</>, check: puedeVerSugerencias, Pane: SugerenciasPane },
];

const GRUPOS: { id: Grupo; icon: ReactNode; label: string }[] = [
  { id: 'directorio', icon: <Icono n="tabla" />, label: 'Directorio' },
  { id: 'mantenimiento', icon: <Icono n="herramienta" />, label: 'Depósito' },
  { id: 'general', icon: <Icono n="config" />, label: 'General' },
];

function AdminContent() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { data: config } = useConfiguracionQuery();
  const [menuOpen, setMenuOpen] = useState(false);

  const { modulos, listo } = useModulos();

  const nombreEmpresa = config?.empresa_nombre || 'Mi Empresa';
  useEffect(() => { document.title = `Configuración — ${nombreEmpresa}`; }, [nombreEmpresa]);

  const visibles = useMemo(
    () => ADMIN_TABS.filter(t => t.check(profile) && (!t.modulo || modulos[t.modulo])),
    [profile, modulos],
  );
  const [tabId, setTabId] = useState<string>('');

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

  const navItems = [{ icon: <><Icono n="volver" /> </>, label: 'Volver', onClick: () => navigate(-1) }];

  if (!listo) return <div className="loading-screen">Cargando...</div>;
  if (!tabActual) return null;

  return (
    <div className="admin-screen">
      <header className="app-header">
        <div className="header-logo">
          {config?.logo_base64 && <img src={config.logo_base64} alt={nombreEmpresa} />}
          <div>
            <div className="header-logo-fallback">{nombreEmpresa}</div>
            <div className="header-title">Configuración</div>
          </div>
        </div>
        <div className="header-right">
          <button onClick={() => navigate(-1)} className="btn-volver-directorio" style={{ display: 'flex' }}><Icono n="volver" /> <span className="hide-mobile">Volver</span></button>
          <UserMenu />
          <button className="hamburger-btn" onClick={() => setMenuOpen(true)} aria-label="Menú">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>
      </header>

      <main className="app-main">
        <div className="admin-group-tabs">
          {GRUPOS.filter(g => visibles.some(t => t.group === g.id)).map(g => (
            <button key={g.id} className={`admin-group-tab${grupoActivo === g.id ? ' active' : ''}`} onClick={() => selectGroup(g.id)}>
              {g.icon} <span className="admin-group-tab-label">{g.label}</span>
            </button>
          ))}
        </div>
        <div className="admin-subnav">
          {visibles.filter(t => t.group === grupoActivo).map(t => (
            <button key={t.id} className={`admin-subtab${tabId === t.id ? ' active' : ''}`} onClick={() => setTabId(t.id)}>{t.label}</button>
          ))}
        </div>

        <tabActual.Pane />
      </main>

      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} navItems={navItems} />
    </div>
  );
}

export default function AdminPage() {
  const { profile } = useAuth();
  if (!tieneAccesoAdmin(profile)) return <Navigate to="/" replace />;
  return <AdminContent />;
}
