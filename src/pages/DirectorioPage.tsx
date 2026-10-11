import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { isDirectorioDesactivado, tieneAccesoMantenimiento } from '../lib/types';
import UserMenu from '../components/UserMenu';
import MobileMenu from '../components/MobileMenu';
import SinModulos from '../components/SinModulos';
import { useConfiguracionQuery } from '../features/config/useConfiguracion';
import { useModulos } from '../features/config/useModulos';
import ProveedoresList from '../features/proveedores/ProveedoresList';
import ComisionistasList from '../features/comisionistas/ComisionistasList';
import RotulosScreen from '../features/rotulos/RotulosScreen';
import TareasScreen from '../features/tareas/TareasScreen';
import { Icono } from '@/components/Icono';
import type { ReactNode } from 'react';

type Tab = 'proveedores' | 'comisionistas' | 'rotulos' | 'tareas';

// Un usuario con Directorio desactivado (rol='disabled', no owner) no debe ver
// esta pantalla en absoluto.
export default function DirectorioPage() {
  const { profile } = useAuth();
  if (isDirectorioDesactivado(profile)) return <Navigate to="/mantenimiento" replace />;
  return <DirectorioContent />;
}

function DirectorioContent() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { data: config } = useConfiguracionQuery();
  const { modulos, listo } = useModulos();
  const [tabElegida, setTabElegida] = useState<Tab>('proveedores');
  const [menuOpen, setMenuOpen] = useState(false);

  const nombreEmpresa = config?.empresa_nombre || 'Mi Empresa';

  useEffect(() => {
    document.title = `Directorio — ${nombreEmpresa}`;
  }, [nombreEmpresa]);

  // Solo las pestañas de los módulos activos; si la elegida se desactivó, se usa la primera.
  const pestañas: { id: Tab; icon: ReactNode; label: string }[] = [
    ...(modulos.proveedores ? [{ id: 'proveedores' as const, icon: <Icono n="fabrica" />, label: 'Proveedores' }] : []),
    ...(modulos.comisionistas ? [{ id: 'comisionistas' as const, icon: <Icono n="acuerdo" />, label: 'Comisionistas' }] : []),
    ...(modulos.envios ? [{ id: 'rotulos' as const, icon: <Icono n="paquete" />, label: 'Envíos' }] : []),
    ...(modulos.tareas ? [{ id: 'tareas' as const, icon: <Icono n="exito" />, label: 'Tareas' }] : []),
  ];
  const tab = pestañas.some(p => p.id === tabElegida) ? tabElegida : pestañas[0]?.id;
  const puedeIrAlDeposito = modulos.deposito && tieneAccesoMantenimiento(profile);

  if (!listo) return <div className="loading-screen">Cargando...</div>;
  if (!tab) return puedeIrAlDeposito ? <Navigate to="/mantenimiento" replace /> : <SinModulos />;

  const navItems = [
    ...pestañas.map(p => ({ icon: p.icon, label: p.label, onClick: () => setTabElegida(p.id), active: tab === p.id })),
    ...(puedeIrAlDeposito ? [{ icon: <Icono n="herramienta" />, label: 'Depósito', onClick: () => navigate('/mantenimiento') }] : []),
  ];

  return (
    <div className="app-screen">
      <header className="app-header">
        <div className="header-logo">
          {config?.logo_base64 && <img src={config.logo_base64} alt={nombreEmpresa} />}
          <div>
            <div className="header-logo-fallback">{nombreEmpresa}</div>
            <div className="header-title">Directorio</div>
          </div>
        </div>
        <div className="header-right">
          {puedeIrAlDeposito && (
            <Link to="/mantenimiento" className="btn-mantenimiento" title="Depósito de mantenimiento" style={{ display: 'flex' }}><Icono n="herramienta" /> <span className="hide-mobile">Depósito</span></Link>
          )}
          <UserMenu />
          <button className="hamburger-btn" onClick={() => setMenuOpen(true)} aria-label="Menú">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>
      </header>

      <nav className="app-nav">
        {pestañas.map(p => (
          <button key={p.id} className={`nav-tab${tab === p.id ? ' active' : ''}`} onClick={() => setTabElegida(p.id)}>{p.icon} {p.label}</button>
        ))}
      </nav>

      <main className="app-main">
        {tab === 'proveedores' && <ProveedoresList />}
        {tab === 'comisionistas' && <ComisionistasList />}
        {tab === 'rotulos' && <RotulosScreen />}
        {tab === 'tareas' && <TareasScreen />}
      </main>

      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} navItems={navItems} />
    </div>
  );
}
