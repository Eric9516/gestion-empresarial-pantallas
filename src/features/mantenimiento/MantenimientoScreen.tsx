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
import { useSectoresMantenimiento } from './useEquipos';
import { normalizar } from './buscador';
import EquiposScreen from './EquiposScreen';
import CalendarioScreen from './CalendarioScreen';
import OrdenesScreen, { type FiltroOrdenes } from './OrdenesScreen';
import { useFaltantes } from './useStockRepuestos';
import ExcelScreen from './ExcelScreen';
import InicioScreen from './InicioScreen';
import { cambiarUsuarioDemo, useAhora, useUsuarioMantenimiento } from './usuarioMantenimiento';
import { NOMBRE_ROL, pendientesDe } from './flujo';
import { useConfigMantenimiento } from './usePreventivo';
import { useConfirm } from '@/components/ConfirmProvider';
import { Icono } from '@/components/Icono';
import './mantenimiento.css';

type Tab = 'inicio' | 'equipos' | 'sector' | 'calendario' | 'ordenes' | 'excel';

/** Sector (y sub-sector, si se eligió uno) que se está mirando desde el menú. */
interface VistaSector { sector: string; subsector: string | null }

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
  const [tab, setTab] = useState<Tab>('inicio');
  const [filtroOrdenes, setFiltroOrdenes] = useState<FiltroOrdenes>('abiertas');
  const faltantes = useFaltantes();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuFijo, alternarMenuFijo] = useMenuFijo();
  const { sugerencias: sugerenciasNuevas, total: avisosTotal } = useAvisos();
  const depositoVisible = useDepositoVisible();
  // Equipo a abrir desde otra pestaña (por ejemplo, desde una OT del calendario).
  const [equipoAbrir, setEquipoAbrir] = useState<string | null>(null);
  // Sectores del menú: cuál se está mirando y cuáles tienen el sub-menú de sub-sectores desplegado.
  const listaSectores = useSectoresMantenimiento();
  const [vistaSector, setVistaSector] = useState<VistaSector | null>(null);
  const [desplegados, setDesplegados] = useState<Set<string>>(new Set());
  // Cambia al elegir algo en el menú: así, si había un equipo abierto, se vuelve a la lista.
  const [vuelta, setVuelta] = useState(0);

  const nombreEmpresa = config?.empresa_nombre || 'Mi Empresa';
  useEffect(() => { document.title = `Mantenimiento — ${nombreEmpresa}`; }, [nombreEmpresa]);

  const usuario = useUsuarioMantenimiento();
  const momento = useAhora();
  const configMant = useConfigMantenimiento();
  // PARA ERIC: administrar (equipos, rutinas, planillas, formato) es del responsable de mantenimiento.
  const esAdmin = isDepositoAdmin(profile) && usuario.esResponsable;
  const tareasOT = useMemo(() => pendientesDe(ordenes, usuario.persona, momento, configMant.horarioRecepcion), [ordenes, usuario.persona, momento, configMant.horarioRecepcion]);
  const numOT = tareasOT.paraMandar + tareasOT.paraRevisar + ('asignadas' in tareasOT ? (tareasOT.asignadas ?? 0) : 0);
  const hoy = fechaHoyISO();
  const avisos = useMemo(() => resumenAvisos(ordenes, rutinas, hoy), [ordenes, rutinas, hoy]);
  const totalAvisos = avisos.vencidas + avisos.porVencer;
  const conFaltante = useMemo(() => ordenes.filter(o => o.estado !== 'terminada' && faltantes(o.repuestos).length > 0).length, [ordenes, faltantes]);
  const puedeIrAlDirectorio = !isDirectorioDesactivado(profile) && hayModulosDeDirectorio(modulos);

  function irA(t: Tab) {
    setFiltroOrdenes('abiertas');
    setVistaSector(null);
    setOrigen(null);
    setVuelta(v => v + 1);
    setTab(t);
  }

  function verSector(sector: string, subsector: string | null) {
    setVistaSector({ sector, subsector });
    setVuelta(v => v + 1);
    setTab('sector');
  }

  function alternarDesplegado(sector: string) {
    setDesplegados(prev => {
      const s = new Set(prev);
      if (s.has(sector)) s.delete(sector); else s.add(sector);
      return s;
    });
  }

  const mismo = (a: string | null | undefined, b: string | null | undefined) => normalizar((a ?? '').trim()) === normalizar((b ?? '').trim());
  const sectorActivo = (s: string, sub: string | null) => tab === 'sector' && !!vistaSector && mismo(vistaSector.sector, s) && (sub === null ? vistaSector.subsector === null : mismo(vistaSector.subsector, sub));

  // Pantalla desde la que se abrió un equipo (Inicio, Calendario, OT): "Volver" lleva de nuevo ahí.
  const [origen, setOrigen] = useState<Tab | null>(null);

  function verEquipo(id: string) {
    setOrigen(tab === 'equipos' || tab === 'sector' ? null : tab);
    setEquipoAbrir(id);
    setTab('equipos');
  }

  const pestañas = [
    { id: 'inicio' as const, icono: <Icono n="inicio" />, label: 'Inicio' },
    { id: 'equipos' as const, icono: <Icono n="buscar" />, label: 'Buscar equipo' },
    { id: 'calendario' as const, icono: <Icono n="calendario" />, label: 'Calendario', num: totalAvisos },
    { id: 'ordenes' as const, icono: <Icono n="lista" />, label: usuario.esTecnico ? 'Mis OT' : 'Órdenes de trabajo', num: numOT },
    ...(usuario.esTecnico ? [] : [{ id: 'excel' as const, icono: <Icono n="planilla" />, label: 'Excel' }]),
  ];

  // Mismo menú que Directorio y Depósito: las áreas arriba y las secciones del módulo abajo.
  const puedeIrAlDeposito = modulos.deposito && tieneAccesoDeposito(profile);
  // Los sectores, en el orden de importancia que eligió la empresa. Si un sector tiene sub-sectores, al tocarlo
  // se despliegan (y se elige uno); si no tiene, abre directo la pantalla con sus equipos.
  const itemsSectores = listaSectores.map(s => {
    const tieneSubs = s.subsectores.length > 0;
    return {
      clave: `sector-${s.nombre}`,
      icono: <Icono n="fabrica" />,
      titulo: s.nombre,
      onClick: () => (tieneSubs ? alternarDesplegado(s.nombre) : verSector(s.nombre, null)),
      activo: !tieneSubs && sectorActivo(s.nombre, null),
      desplegado: desplegados.has(s.nombre),
      hijos: tieneSubs ? s.subsectores.map(x => ({ clave: `sub-${s.nombre}-${x.nombre}`, icono: null, titulo: x.nombre, onClick: () => verSector(s.nombre, x.nombre), activo: sectorActivo(s.nombre, x.nombre) })) : undefined,
    };
  });
  const secciones: SeccionMenu[] = [
    { titulo: 'Mantenimiento', items: pestañas.map(p => ({ clave: p.id, icono: p.icono, titulo: p.label, cantidad: p.num, onClick: () => irA(p.id), activo: tab === p.id })) },
    ...(itemsSectores.length ? [{ titulo: 'Sectores', items: itemsSectores }] : []),
  ];
  const areas: SeccionMenu[] = puedeIrAlDirectorio || puedeIrAlDeposito ? [{ titulo: 'Áreas', items: [
    ...(puedeIrAlDirectorio ? [{ clave: 'area-directorio', icono: <Icono n="directorio" />, titulo: 'Directorio', onClick: () => navigate('/') }] : []),
    ...(puedeIrAlDeposito ? [{ clave: 'area-deposito', icono: <Icono n={depositoVisible.icono} />, titulo: depositoVisible.nombre, onClick: () => navigate('/deposito') }] : []),
    { clave: 'area-mantenimiento', icono: <Icono n="herramienta" />, titulo: 'Mantenimiento', onClick: () => irA('inicio'), activo: true },
  ] }] : [];
  const pie = tieneAccesoAdmin(profile) ? [{ clave: 'config', icono: <Icono n="config" />, titulo: 'Configuración', cantidad: sugerenciasNuevas, onClick: () => navigate('/admin') }] : [];

  // El menú de la hamburguesa (celular) usa las mismas secciones, en una sola lista.
  const navItems = [
    ...secciones.flatMap(sec => sec.items).flatMap(i => [
      { icon: i.icono, label: i.titulo, cantidad: i.cantidad, onClick: i.onClick, active: i.activo, desplegable: i.hijos ? (i.desplegado ? 'abierto' as const : 'cerrado' as const) : undefined },
      ...(i.hijos && i.desplegado ? i.hijos.map(h => ({ icon: null, label: h.titulo, onClick: h.onClick, active: h.activo, sub: true })) : []),
    ]),
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
          <label className="mt-ver-como">
            Ver como:
            <select value={usuario.persona.id} onChange={e => { cambiarUsuarioDemo(e.target.value); irA('ordenes'); }}>
              {usuario.personas.map(p => <option key={p.id} value={p.id} title={NOMBRE_ROL[p.rol]}>{p.nombre}</option>)}
            </select>
          </label>
        </div>

        {tab !== 'ordenes' && (tareasOT.paraMandar > 0 || tareasOT.paraRevisar > 0 || ('asignadas' in tareasOT && (tareasOT.asignadas ?? 0) > 0)) && (
          <button type="button" className="mt-aviso verde" onClick={() => irA('ordenes')}>
            <Icono n="lista" />
            <span style={{ flex: 1 }}>
              {[
                tareasOT.paraMandar > 0 && (usuario.esJefe ? `${tareasOT.paraMandar} OT para asignar` : `${tareasOT.paraMandar} OT para derivar al jefe de taller`),
                tareasOT.paraRevisar > 0 && (usuario.esJefe ? `${tareasOT.paraRevisar} para revisar` : `${tareasOT.paraRevisar} para aprobar`),
                'asignadas' in tareasOT && (tareasOT.asignadas ?? 0) > 0 && `${tareasOT.asignadas} OT asignadas a vos`,
              ].filter(Boolean).join(' · ')}
            </span>
            <span style={{ fontSize: 13, textDecoration: 'underline' }}>Ver</span>
          </button>
        )}

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

        {tab === 'inicio' && <InicioScreen onVerEquipo={verEquipo} />}
        {tab === 'equipos' && (
          <EquiposScreen
            key={vuelta}
            esAdmin={esAdmin}
            equipoAbrir={equipoAbrir}
            onEquipoAbierto={() => setEquipoAbrir(null)}
            volverA={origen ? { texto: pestañas.find(x => x.id === origen)?.label ?? 'la pantalla anterior', ir: () => { setEquipoAbrir(null); irA(origen); } } : undefined}
          />
        )}
        {tab === 'sector' && vistaSector && (
          <EquiposScreen
            key={`${vistaSector.sector}|${vistaSector.subsector ?? ''}|${vuelta}`}
            esAdmin={esAdmin}
            equipoAbrir={null}
            onEquipoAbierto={() => {}}
            fijo={vistaSector}
          />
        )}
        {tab === 'calendario' && <CalendarioScreen esAdmin={esAdmin} onVerEquipo={verEquipo} />}
        {tab === 'ordenes' && <OrdenesScreen key={`${filtroOrdenes}|${usuario.persona.id}`} onVerEquipo={verEquipo} filtroInicial={filtroOrdenes} esAdmin={esAdmin} />}
        {tab === 'excel' && <ExcelScreen esAdmin={esAdmin} />}
      </main>

      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} navItems={navItems} />
    </div>
  );
}
