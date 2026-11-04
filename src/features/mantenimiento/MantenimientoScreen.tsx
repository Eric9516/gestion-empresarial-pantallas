import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { isDepositoAdmin, isDirectorioDesactivado, tieneAccesoAdmin, tieneAccesoDeposito } from '../../lib/types';
import { hayModulosDeDirectorio } from '../../lib/modulos';
import { fechaHoyISO } from '../../lib/fechaHoy';
import UserMenu from '../../components/UserMenu';
import MobileMenu from '../../components/MobileMenu';
import MenuLateral, { type SeccionMenu } from '../../components/MenuLateral';
import BotonHamburguesa from '../../components/BotonHamburguesa';
import { useMenuFijo } from '../../lib/useMenuFijo';
import { useAvisos } from '../avisos/useAvisos';
import { useDepositoVisible } from '../depositos/useDepositos';
import { useConfiguracionQuery } from '../config/useConfiguracion';
import { useModulos } from '../config/useModulos';
import { restablecerDatosDemo, vaciarDatosDemo } from './almacenDemo';
import { resumenAvisos } from './preventivo';
import { mantenimientoVisible } from './visible';
import { useOrdenesQuery, useRutinasQuery } from './usePreventivo';
import EquiposScreen from './EquiposScreen';
import CalendarioScreen from './CalendarioScreen';
import OrdenesScreen, { type FiltroOrdenes } from './OrdenesScreen';
import { useFaltantes } from './useStockRepuestos';
import ExcelScreen from './ExcelScreen';
import { useConfirm } from '@/components/ConfirmProvider';
import { Icono } from '@/components/Icono';
import './mantenimiento.css';

type Tab = 'equipos' | 'calendario' | 'ordenes' | 'excel';

// Sección "Mantenimiento": equipos (con buscador), calendario preventivo con avisos,
// órdenes de trabajo e importar/exportar Excel. Va aparte del Depósito.
export default function MantenimientoScreen() {
  const { profile } = useAuth();
  const { modulos, listo } = useModulos();
  if (!listo) return <div className="loading-screen">Cargando...</div>;
  // PARA ERIC: el módulo todavía no tiene roles propios; mientras tanto usa los del Depósito (ver NOTAS-PARA-ERIC.md).
  if (!tieneAccesoDeposito(profile) && !isDirectorioDesactivado(profile)) return <Navigate to="/" replace />;
  if (!mantenimientoVisible(modulos)) return <Navigate to="/" replace />;
  return <Contenido />;
}

function Contenido() {
  const { profile } = useAuth();
  const { modulos } = useModulos();
  const { data: config } = useConfiguracionQuery();
  const { data: ordenes } = useOrdenesQuery();
  const { data: rutinas } = useRutinasQuery();
  const navigate = useNavigate();
  const confirmar = useConfirm();
  const [tab, setTab] = useState<Tab>('equipos');
  const [filtroOrdenes, setFiltroOrdenes] = useState<FiltroOrdenes>('abiertas');
  const faltantes = useFaltantes();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuFijo, alternarMenuFijo] = useMenuFijo();
  const { sugerencias: sugerenciasNuevas, total: avisosTotal } = useAvisos();
  const depositoVisible = useDepositoVisible();
  // Equipo a abrir desde otra pestaña (por ejemplo, desde una OT del calendario).
  const [equipoAbrir, setEquipoAbrir] = useState<string | null>(null);

  const nombreEmpresa = config?.empresa_nombre || 'Mi Empresa';
  useEffect(() => { document.title = `Mantenimiento — ${nombreEmpresa}`; }, [nombreEmpresa]);

  const esAdmin = isDepositoAdmin(profile);
  const hoy = fechaHoyISO();
  const avisos = useMemo(() => resumenAvisos(ordenes, rutinas, hoy), [ordenes, rutinas, hoy]);
  const totalAvisos = avisos.vencidas + avisos.porVencer;
  const conFaltante = useMemo(() => ordenes.filter(o => o.estado !== 'terminada' && faltantes(o.repuestos).length > 0).length, [ordenes, faltantes]);
  const puedeIrAlDirectorio = !isDirectorioDesactivado(profile) && hayModulosDeDirectorio(modulos);

  function irA(t: Tab) {
    setFiltroOrdenes('abiertas');
    setTab(t);
  }

  function verEquipo(id: string) {
    setEquipoAbrir(id);
    setTab('equipos');
  }

  const pestañas = [
    { id: 'equipos' as const, icono: <Icono n="herramienta" />, label: 'Equipos' },
    { id: 'calendario' as const, icono: <Icono n="calendario" />, label: 'Calendario', num: totalAvisos },
    { id: 'ordenes' as const, icono: <Icono n="lista" />, label: 'Órdenes de trabajo' },
    { id: 'excel' as const, icono: <Icono n="planilla" />, label: 'Excel' },
  ];

  // Mismo menú que Directorio y Depósito: las áreas arriba y las secciones del módulo abajo.
  const puedeIrAlDeposito = modulos.deposito && tieneAccesoDeposito(profile);
  const secciones: SeccionMenu[] = [{ titulo: 'Mantenimiento', items: pestañas.map(p => ({ clave: p.id, icono: p.icono, titulo: p.label, cantidad: p.num, onClick: () => irA(p.id), activo: tab === p.id })) }];
  const areas: SeccionMenu[] = puedeIrAlDirectorio || puedeIrAlDeposito ? [{ titulo: 'Áreas', items: [
    ...(puedeIrAlDirectorio ? [{ clave: 'area-directorio', icono: <Icono n="directorio" />, titulo: 'Directorio', onClick: () => navigate('/') }] : []),
    ...(puedeIrAlDeposito ? [{ clave: 'area-deposito', icono: <Icono n={depositoVisible.icono} />, titulo: depositoVisible.nombre, onClick: () => navigate('/deposito') }] : []),
    { clave: 'area-mantenimiento', icono: <Icono n="herramienta" />, titulo: 'Mantenimiento', onClick: () => irA('equipos'), activo: true },
  ] }] : [];
  const pie = tieneAccesoAdmin(profile) ? [{ clave: 'config', icono: <Icono n="config" />, titulo: 'Configuración', cantidad: sugerenciasNuevas, onClick: () => navigate('/admin') }] : [];

  // El menú de la hamburguesa (celular) usa las mismas secciones, en una sola lista.
  const navItems = [
    ...secciones.flatMap(sec => sec.items).map(i => ({ icon: i.icono, label: i.titulo, cantidad: i.cantidad, onClick: i.onClick, active: i.activo })),
    ...(puedeIrAlDeposito ? [{ icon: <Icono n={depositoVisible.icono} />, label: depositoVisible.nombre, onClick: () => navigate('/deposito') }] : []),
    ...(puedeIrAlDirectorio ? [{ icon: <Icono n="volver" />, label: 'Volver a Directorio', onClick: () => navigate('/') }] : []),
  ];

  async function vaciar() {
    if (await confirmar('¿Borrar todos los datos (los de ejemplo y lo que cargaste) para empezar vacío e importar los tuyos? Es solo en este navegador.', { textoConfirmar: 'Empezar vacío', peligroso: true })) vaciarDatosDemo();
  }

  async function restablecer() {
    if (await confirmar('¿Volver a los datos de ejemplo del principio? Se borra lo que cargaste o importaste en este navegador.', { textoConfirmar: 'Restablecer', peligroso: true })) restablecerDatosDemo();
  }

  return (
    <div className={`app-screen mt-screen con-menu-lateral${menuFijo ? ' menu-fijo' : ''}`}>
      <header className="app-header">
        <div className="header-logo">
          {config?.logo_base64 && <img src={config.logo_base64} alt={nombreEmpresa} />}
          <div>
            <div className="header-logo-fallback">{nombreEmpresa}</div>
            <h1 className="header-title">Mantenimiento</h1>
          </div>
        </div>
        <div className="header-right">
          <UserMenu />
          <BotonHamburguesa onClick={() => setMenuOpen(true)} aviso={totalAvisos + avisosTotal > 0} />
        </div>
      </header>

      <MenuLateral secciones={[...areas, ...secciones]} pie={pie} fijo={menuFijo} onAlternarFijo={alternarMenuFijo} />

      <main className="app-main">
        <div className="mt-aviso-demo">
          <Icono n="idea" /> Modo de ejemplo: los datos son inventados y se guardan solo en este navegador hasta conectar la base.
          <button type="button" onClick={() => void restablecer()}>Volver a los datos de ejemplo</button>
          <button type="button" onClick={() => void vaciar()}>Empezar vacío</button>
        </div>

        {totalAvisos > 0 && tab !== 'calendario' && (
          <button type="button" className={`mt-aviso ${avisos.vencidas ? 'rojo' : 'amarillo'}`} onClick={() => setTab('calendario')}>
            <Icono n="alerta" />
            <span style={{ flex: 1 }}>
              {avisos.vencidas > 0 && <>{avisos.vencidas} {avisos.vencidas === 1 ? 'orden vencida' : 'órdenes vencidas'}</>}
              {avisos.vencidas > 0 && avisos.porVencer > 0 && ' y '}
              {avisos.porVencer > 0 && <>{avisos.porVencer} por vencer</>}
            </span>
            <span style={{ fontSize: 13, textDecoration: 'underline' }}>Ver calendario</span>
          </button>
        )}

        {conFaltante > 0 && !(tab === 'ordenes' && filtroOrdenes === 'falta') && (
          <button type="button" className="mt-aviso amarillo" onClick={() => { setFiltroOrdenes('falta'); setTab('ordenes'); }}>
            <Icono n="paquete" />
            <span style={{ flex: 1 }}>{conFaltante === 1 ? '1 orden abierta necesita un repuesto' : `${conFaltante} órdenes abiertas necesitan repuestos`} que no hay en el Depósito</span>
            <span style={{ fontSize: 13, textDecoration: 'underline' }}>Ver cuáles</span>
          </button>
        )}

        {tab === 'equipos' && <EquiposScreen esAdmin={esAdmin} equipoAbrir={equipoAbrir} onEquipoAbierto={() => setEquipoAbrir(null)} />}
        {tab === 'calendario' && <CalendarioScreen esAdmin={esAdmin} onVerEquipo={verEquipo} />}
        {tab === 'ordenes' && <OrdenesScreen key={filtroOrdenes} onVerEquipo={verEquipo} filtroInicial={filtroOrdenes} />}
        {tab === 'excel' && <ExcelScreen esAdmin={esAdmin} />}
      </main>

      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} navItems={navItems} />
    </div>
  );
}
