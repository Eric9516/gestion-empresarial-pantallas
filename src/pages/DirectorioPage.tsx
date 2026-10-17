import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { isDirectorioDesactivado, tieneAccesoAdmin, tieneAccesoDeposito } from '../lib/types';
import UserMenu from '../components/UserMenu';
import MobileMenu from '../components/MobileMenu';
import MenuLateral from '../components/MenuLateral';
import type { SeccionMenu } from '../components/MenuLateral';
import BotonHamburguesa from '../components/BotonHamburguesa';
import { useMenuFijo } from '../lib/useMenuFijo';
import { useAvisos } from '../features/avisos/useAvisos';
import SinModulos from '../components/SinModulos';
import { useConfiguracionQuery } from '../features/config/useConfiguracion';
import { useModulos } from '../features/config/useModulos';
import { useDepositoVisible } from '../features/depositos/useDepositos';
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
  if (isDirectorioDesactivado(profile)) return <Navigate to="/deposito" replace />;
  return <DirectorioContent />;
}

function DirectorioContent() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { data: config } = useConfiguracionQuery();
  const { modulos, listo } = useModulos();
  const depositoVisible = useDepositoVisible();
  const [tabElegida, setTabElegida] = useState<Tab>('proveedores');
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuFijo, alternarMenuFijo] = useMenuFijo();
  const { sugerencias: sugerenciasNuevas, total: avisosTotal } = useAvisos();

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
  const puedeIrAlDeposito = modulos.deposito && tieneAccesoDeposito(profile);

  if (!listo) return <div className="loading-screen">Cargando...</div>;
  if (!tab) return puedeIrAlDeposito ? <Navigate to="/deposito" replace /> : <SinModulos />;

  const itemDe = (p: (typeof pestañas)[number]) => ({ clave: p.id, icono: p.icon, titulo: p.label, onClick: () => setTabElegida(p.id), activo: tab === p.id });
  const secciones: SeccionMenu[] = [
    { titulo: 'Directorio', items: pestañas.filter(p => p.id !== 'tareas').map(itemDe) },
    { titulo: 'Gestión', items: pestañas.filter(p => p.id === 'tareas').map(itemDe) },
  ].filter(s => s.items.length > 0);
  // Las áreas a las que puede ir esta persona (si tiene una sola, no hace falta mostrarlas).
  const areas: SeccionMenu[] = puedeIrAlDeposito ? [{ titulo: 'Áreas', items: [
    { clave: 'area-directorio', icono: <Icono n="directorio" />, titulo: 'Directorio', onClick: () => setTabElegida(pestañas[0].id), activo: true },
    { clave: 'area-deposito', icono: <Icono n={depositoVisible.icono} />, titulo: depositoVisible.nombre, onClick: () => navigate('/deposito') },
  ] }] : [];
  const pie = tieneAccesoAdmin(profile) ? [{ clave: 'config', icono: <Icono n="config" />, titulo: 'Configuración', cantidad: sugerenciasNuevas, onClick: () => navigate('/admin') }] : [];

  const navItems = [
    ...pestañas.map(p => ({ icon: p.icon, label: p.label, onClick: () => setTabElegida(p.id), active: tab === p.id })),
    ...(puedeIrAlDeposito ? [{ icon: <Icono n={depositoVisible.icono} />, label: depositoVisible.nombre, onClick: () => navigate('/deposito') }] : []),
  ];

  return (
    <div className={`app-screen con-menu-lateral${menuFijo ? ' menu-fijo' : ''}`}>
      <header className="app-header">
        <div className="header-logo">
          {config?.logo_base64 && <img src={config.logo_base64} alt={nombreEmpresa} />}
          <div>
            <div className="header-logo-fallback">{nombreEmpresa}</div>
            <h1 className="header-title">Directorio</h1>
          </div>
        </div>
        <div className="header-right">
          <UserMenu />
          <BotonHamburguesa onClick={() => setMenuOpen(true)} aviso={avisosTotal > 0} />
        </div>
      </header>

      <MenuLateral secciones={[...areas, ...secciones]} pie={pie} fijo={menuFijo} onAlternarFijo={alternarMenuFijo} />

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
