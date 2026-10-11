import { useEffect, useState } from 'react';
import { Navigate, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { isDirectorioDesactivado, isMantenimientoAdmin, puedeAjustarInventario, tieneAccesoMantenimiento } from '../lib/types';
import UserMenu from '../components/UserMenu';
import MobileMenu from '../components/MobileMenu';
import SinModulos from '../components/SinModulos';
import { hayModulosDeDirectorio } from '../lib/modulos';
import { useConfiguracionQuery } from '../features/config/useConfiguracion';
import { useModulos } from '../features/config/useModulos';
import { RetiroCartProvider, useRetiroCart } from '../features/retiros/RetiroCartContext';
import ItemsList from '../features/items/ItemsList';
import InformeReposicion from '../features/items/InformeReposicion';
import RetiroCartPanel from '../features/retiros/RetiroCartPanel';
import HistorialRetiros from '../features/retiros/HistorialRetiros';
import QrScannerModal from '../features/scanner/QrScannerModal';
import TareasScreen from '../features/tareas/TareasScreen';
import ReparacionesScreen from '../features/reparaciones/ReparacionesScreen';
import AjustesScreen from '../features/ajustes/AjustesScreen';
import { Icono } from '@/components/Icono';

type Tab = 'buscar' | 'carrito' | 'retiros' | 'tareas' | 'reparaciones' | 'informe' | 'ajustes';

function MantenimientoContent() {
  const { profile } = useAuth();
  const { cart } = useRetiroCart();
  const { data: config } = useConfiguracionQuery();
  const { modulos, integ } = useModulos();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('buscar');
  const [menuOpen, setMenuOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);

  const nombreEmpresa = config?.empresa_nombre || 'Mi Empresa';
  useEffect(() => { document.title = `Depósito — ${nombreEmpresa}`; }, [nombreEmpresa]);
  // Reparaciones toca stock igual que retiros/edición de repuestos — se
  // reserva a admin de Mantenimiento, no satura la navegación del común.
  const esAdmin = isMantenimientoAdmin(profile);
  const verReparaciones = esAdmin && integ.reparaciones;
  // Ajuste de inventario: solo quien tiene el permiso (la base lo impone igual).
  const verAjustes = puedeAjustarInventario(profile);

  // Un usuario con Directorio desactivado queda encerrado en Mantenimiento —
  // sin botón de "Volver", igual que exitMantenimiento() en la app vieja.
  // (o si la empresa no usa ningún módulo del Directorio: no hay a dónde volver).
  const canExit = !isDirectorioDesactivado(profile) && hayModulosDeDirectorio(modulos);

  const navItems = [
    { icon: <Icono n="buscar" />, label: 'Buscar', onClick: () => setTab('buscar'), active: tab === 'buscar' },
    { icon: <Icono n="carrito" />, label: `A retirar${cart.length ? ` (${cart.length})` : ''}`, onClick: () => setTab('carrito'), active: tab === 'carrito' },
    { icon: <Icono n="lista" />, label: 'Retiros', onClick: () => setTab('retiros'), active: tab === 'retiros' },
    ...(verReparaciones ? [{ icon: <Icono n="herramienta" />, label: 'Reparaciones', onClick: () => setTab('reparaciones'), active: tab === 'reparaciones' }] : []),
    ...(modulos.tareas ? [{ icon: <Icono n="exito" />, label: 'Tareas', onClick: () => setTab('tareas'), active: tab === 'tareas' }] : []),
    ...(esAdmin ? [{ icon: <Icono n="informe" />, label: 'Informe', onClick: () => setTab('informe'), active: tab === 'informe' }] : []),
    ...(verAjustes ? [{ icon: <Icono n="balanza" />, label: 'Ajustes', onClick: () => setTab('ajustes'), active: tab === 'ajustes' }] : []),
    ...(canExit ? [{ icon: <><Icono n="volver" /> </>, label: 'Volver a Directorio', onClick: () => navigate('/') }] : []),
  ];

  return (
    <div className="mantenimiento-screen">
      <header className="app-header">
        <div className="header-logo">
          {config?.logo_base64 && <img src={config.logo_base64} alt={nombreEmpresa} />}
          <div>
            <div className="header-logo-fallback">{nombreEmpresa}</div>
            <div className="header-title">Depósito de mantenimiento</div>
          </div>
        </div>
        <div className="header-right">
          {canExit && (
            <Link to="/" className="btn-volver-directorio" style={{ display: 'flex' }}><Icono n="volver" /> <span className="hide-mobile">Directorio</span></Link>
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
        <button className={`nav-tab${tab === 'buscar' ? ' active' : ''}`} onClick={() => setTab('buscar')}><Icono n="buscar" /> Buscar</button>
        <button className={`nav-tab${tab === 'carrito' ? ' active' : ''}`} onClick={() => setTab('carrito')}>
          
          <Icono n="carrito" /> A retirar {cart.length > 0 && <span className="badge badge-rubro">{cart.length}</span>}
        </button>
        <button className={`nav-tab${tab === 'retiros' ? ' active' : ''}`} onClick={() => setTab('retiros')}><Icono n="lista" /> Retiros</button>
        {modulos.tareas && (
          <button className={`nav-tab${tab === 'tareas' ? ' active' : ''}`} onClick={() => setTab('tareas')}><Icono n="exito" /> Tareas</button>
        )}
        {verReparaciones && (
          <button className={`nav-tab${tab === 'reparaciones' ? ' active' : ''}`} onClick={() => setTab('reparaciones')}><Icono n="herramienta" /> Reparaciones</button>
        )}
        {esAdmin && (
          <button className={`nav-tab${tab === 'informe' ? ' active' : ''}`} onClick={() => setTab('informe')}><Icono n="informe" /> Informe</button>
        )}
        {verAjustes && (
          <button className={`nav-tab${tab === 'ajustes' ? ' active' : ''}`} onClick={() => setTab('ajustes')}><Icono n="balanza" /> Ajustes</button>
        )}
      </nav>

      <main className="app-main">
        {tab === 'buscar' && (
          <div id="paneMantBuscar">
            <ItemsList />
            <button className="fab-scan" onClick={() => setScannerOpen(true)} aria-label="Escanear QR">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="3" height="3" /><rect x="18" y="14" width="3" height="3" /><rect x="14" y="18" width="3" height="3" /><rect x="18" y="18" width="3" height="3" /></svg>
            </button>
          </div>
        )}
        {tab === 'carrito' && <RetiroCartPanel />}
        {tab === 'retiros' && <HistorialRetiros />}
        {tab === 'tareas' && modulos.tareas && <TareasScreen />}
        {tab === 'reparaciones' && verReparaciones && <ReparacionesScreen />}
        {tab === 'informe' && esAdmin && <InformeReposicion />}
        {tab === 'ajustes' && verAjustes && <AjustesScreen />}
      </main>

      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} navItems={navItems} />
      <QrScannerModal open={scannerOpen} onClose={() => setScannerOpen(false)} onListo={() => { setScannerOpen(false); setTab('carrito'); }} />
    </div>
  );
}

export default function MantenimientoPage() {
  const { profile } = useAuth();
  const { modulos, listo } = useModulos();
  if (!listo) return <div className="loading-screen">Cargando...</div>;
  // Con Directorio desactivado, esta pantalla es la única a la que puede
  // entrar, tenga o no un rol de Mantenimiento propio asignado.
  if (!tieneAccesoMantenimiento(profile) && !isDirectorioDesactivado(profile)) return <Navigate to="/" replace />;
  // Si la empresa no usa el Depósito, no hay pantalla: se vuelve al Directorio, salvo que la
  // persona no pueda entrar allí (entonces se le explica en vez de rebotarla en círculo).
  if (!modulos.deposito) return isDirectorioDesactivado(profile) ? <SinModulos /> : <Navigate to="/" replace />;

  return (
    <RetiroCartProvider>
      <MantenimientoContent />
    </RetiroCartProvider>
  );
}
