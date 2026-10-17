import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { isDirectorioDesactivado, isDepositoAdmin, puedeAjustarInventario, tieneAccesoAdmin, tieneAccesoDeposito } from '../lib/types';
import UserMenu from '../components/UserMenu';
import MobileMenu from '../components/MobileMenu';
import MenuLateral from '../components/MenuLateral';
import BotonHamburguesa from '../components/BotonHamburguesa';
import { useMenuFijo } from '../lib/useMenuFijo';
import { useAvisos } from '../features/avisos/useAvisos';
import type { SeccionMenu } from '../components/MenuLateral';
import SinModulos from '../components/SinModulos';
import { hayModulosDeDirectorio } from '../lib/modulos';
import { useConfiguracionQuery } from '../features/config/useConfiguracion';
import { useModulos } from '../features/config/useModulos';
import { useDepositoVisible } from '../features/depositos/useDepositos';
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
  const depositoVisible = useDepositoVisible();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('buscar');
  const [menuOpen, setMenuOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [menuFijo, alternarMenuFijo] = useMenuFijo();
  const { retiros: retirosNuevos, sugerencias: sugerenciasNuevas, total: avisosTotal, marcarVisto } = useAvisos();

  const nombreEmpresa = config?.empresa_nombre || 'Mi Empresa';
  useEffect(() => { document.title = `Depósito — ${nombreEmpresa}`; }, [nombreEmpresa]);
  // Reparaciones toca stock igual que retiros/edición de repuestos — se
  // reserva a admin de Mantenimiento, no satura la navegación del común.
  const esAdmin = isDepositoAdmin(profile);
  const verReparaciones = esAdmin && integ.reparaciones;
  // Ajuste de inventario: solo quien tiene el permiso (la base lo impone igual).
  const verAjustes = puedeAjustarInventario(profile);

  // Un usuario con Directorio desactivado queda encerrado en Mantenimiento —
  // sin botón de "Volver", igual que exitMantenimiento() en la app vieja.
  // (o si la empresa no usa ningún módulo del Directorio: no hay a dónde volver).
  const canExit = !isDirectorioDesactivado(profile) && hayModulosDeDirectorio(modulos);

  // Las secciones se agrupan por para qué se usan. Cuando haya más áreas (Compras, etc.) se suman acá como grupos nuevos.
  const ir = (t: Tab) => () => setTab(t);
  const secciones: SeccionMenu[] = [
    { titulo: 'Día a día', items: [
      { clave: 'buscar', icono: <Icono n="buscar" />, titulo: 'Buscar', onClick: ir('buscar'), activo: tab === 'buscar' },
      { clave: 'carrito', icono: <Icono n="carrito" />, titulo: 'A retirar', cantidad: cart.length, onClick: ir('carrito'), activo: tab === 'carrito' },
      { clave: 'retiros', icono: <Icono n="lista" />, titulo: 'Retiros', cantidad: retirosNuevos, onClick: ir('retiros'), activo: tab === 'retiros' },
    ] },
    { titulo: 'Stock', items: [
      ...(verAjustes ? [{ clave: 'ajustes', icono: <Icono n="balanza" />, titulo: 'Movimientos', onClick: ir('ajustes'), activo: tab === 'ajustes' }] : []),
      ...(esAdmin ? [{ clave: 'informe', icono: <Icono n="informe" />, titulo: 'Informe', onClick: ir('informe'), activo: tab === 'informe' }] : []),
      ...(verReparaciones ? [{ clave: 'reparaciones', icono: <Icono n="herramienta" />, titulo: 'Reparaciones', onClick: ir('reparaciones'), activo: tab === 'reparaciones' }] : []),
    ] },
    { titulo: 'Gestión', items: [
      ...(modulos.tareas ? [{ clave: 'tareas', icono: <Icono n="exito" />, titulo: 'Tareas', onClick: ir('tareas'), activo: tab === 'tareas' }] : []),
    ] },
  ].filter(s => s.items.length > 0);
  // Las áreas a las que puede ir esta persona (si tiene una sola, no hace falta mostrarlas).
  const areas: SeccionMenu[] = canExit ? [{ titulo: 'Áreas', items: [
    { clave: 'area-directorio', icono: <Icono n="directorio" />, titulo: 'Directorio', onClick: () => navigate('/') },
    { clave: 'area-deposito', icono: <Icono n={depositoVisible.icono} />, titulo: depositoVisible.nombre, onClick: ir('buscar'), activo: true },
  ] }] : [];
  const pie = tieneAccesoAdmin(profile) ? [{ clave: 'config', icono: <Icono n="config" />, titulo: 'Configuración', cantidad: sugerenciasNuevas, onClick: () => navigate('/admin') }] : [];

  // El menú de la hamburguesa (celular) usa las mismas secciones, en una sola lista.
  const navItems = [
    ...secciones.flatMap(s => s.items).map(i => ({ icon: i.icono, label: i.titulo, cantidad: i.cantidad, onClick: i.onClick, active: i.activo })),
    ...(canExit ? [{ icon: <><Icono n="volver" /> </>, label: 'Volver a Directorio', onClick: () => navigate('/') }] : []),
  ];

  // Al estar mirando los retiros, lo que llegue ya está visto.
  useEffect(() => { if (tab === 'retiros' && retirosNuevos > 0) marcarVisto('retiros'); }, [tab, retirosNuevos, marcarVisto]);

  return (
    <div className={`deposito-screen con-menu-lateral${menuFijo ? ' menu-fijo' : ''}`}>
      <header className="app-header">
        <div className="header-logo">
          {config?.logo_base64 && <img src={config.logo_base64} alt={nombreEmpresa} />}
          <div>
            <div className="header-logo-fallback">{nombreEmpresa}</div>
            <h1 className="header-title">{depositoVisible.nombre}</h1>
          </div>
        </div>
        <div className="header-right">
          <UserMenu />
          <BotonHamburguesa onClick={() => setMenuOpen(true)} aviso={cart.length + avisosTotal > 0} />
        </div>
      </header>

      <MenuLateral secciones={[...areas, ...secciones]} pie={pie} fijo={menuFijo} onAlternarFijo={alternarMenuFijo} />

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

export default function DepositoPage() {
  const { profile } = useAuth();
  const { modulos, listo } = useModulos();
  if (!listo) return <div className="loading-screen">Cargando...</div>;
  // Con Directorio desactivado, esta pantalla es la única a la que puede
  // entrar, tenga o no un rol de Mantenimiento propio asignado.
  if (!tieneAccesoDeposito(profile) && !isDirectorioDesactivado(profile)) return <Navigate to="/" replace />;
  // Si la empresa no usa el Depósito, no hay pantalla: se vuelve al Directorio, salvo que la
  // persona no pueda entrar allí (entonces se le explica en vez de rebotarla en círculo).
  if (!modulos.deposito) return isDirectorioDesactivado(profile) ? <SinModulos /> : <Navigate to="/" replace />;

  return (
    <RetiroCartProvider>
      <MantenimientoContent />
    </RetiroCartProvider>
  );
}
