import { useMemo, useState } from 'react';
import { formatearFechaSola } from '../../lib/fechaHoy';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { usePedido } from '../../lib/usePedido';
import { palabrasDeBusqueda } from './buscador';
import { sectoresConCantidad } from './sectores';
import { useMantenimiento } from './servicio';
import EquipoForm from './EquipoForm';
import { FichaEquipoPantalla } from './FichaEquipoModal';
import EscanerEquipoModal from './EscanerEquipoModal';
import SectoresModal from './SectoresModal';
import type { EquipoDeLista } from './tipos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icono } from '@/components/Icono';

// Equipos (del diseño del socio): un buscador grande que busca también en el historial, los repuestos y los manuales; filtros rápidos con un
// toque; tarjetas con lo importante de cada equipo y su ficha completa al tocarla. Se llega a un equipo buscando o escaneando su QR, no
// navegando carpetas. Del socio (05/11/2026): cada sector del menú abre esta pantalla con solo sus equipos (`fijo`), y el equipo se abre como
// pantalla en lugar de la lista, con "Volver" (a la lista, al equipo principal o a la página de donde se vino).

type Filtro = 'criticos' | 'correctivo30' | 'faltaRepuesto';

const FILTROS: { id: Filtro; label: string; alerta?: boolean }[] = [
  { id: 'criticos', label: 'Críticos' },
  { id: 'correctivo30', label: 'Correctivo últimos 30 días' },
  { id: 'faltaRepuesto', label: 'Falta repuesto crítico', alerta: true },
];

interface Props {
  /** Equipo a mostrar abierto al llegar (por ejemplo, desde un enlace con ?equipo=). */
  abrir: string | null;
  /** La pantalla de un sector (o un sub-sector) elegido en el menú: solo sus equipos, con su nombre arriba y sin los botones de sector. */
  fijo?: { sectorId: string } | null;
  /** Al cerrar el equipo que llegó abierto (?equipo=): volver a la página de donde se vino. */
  alVolver?: () => void;
}

export default function PantallaDeEquipos({ abrir, fijo = null, alVolver }: Props) {
  const s = useMantenimiento();
  const equipos = useMemo(() => s.equipos ?? [], [s.equipos]);
  const [consulta, setConsulta] = useState('');
  const consultaDemorada = useDebouncedValue(consulta, 200);
  const buscando = palabrasDeBusqueda(consultaDemorada).length > 0;
  // la búsqueda la hace el servidor (mira también el historial); mientras llega, se sigue viendo el resultado anterior
  const busqueda = usePedido(buscando ? `buscar|${consultaDemorada}|${s.revision}` : null, () => s.buscar(consultaDemorada), true);
  // un sector fijo: si es un sub-sector, su sector y él; si no, el sector
  const sectorFijo = fijo ? s.sectores.find(x => x.id === fijo.sectorId) ?? null : null;
  const padreFijo = sectorFijo?.padreId ? s.sectores.find(x => x.id === sectorFijo.padreId) ?? null : null;
  const [sector, setSectorElegido] = useState<string | null>(sectorFijo ? (sectorFijo.padreId ?? sectorFijo.id) : null);
  const [subsector, setSubsector] = useState<string | null>(sectorFijo?.padreId ? sectorFijo.id : null);
  const setSector = (id: string | null) => { setSectorElegido(id); setSubsector(null); };
  const [filtros, setFiltros] = useState<Set<Filtro>>(new Set());
  // los equipos abiertos, uno encima del otro (por ejemplo, un equipo y después uno de sus sub-equipos): "Volver" saca el último
  const [pila, setPila] = useState<string[]>(abrir ? [abrir] : []);
  const setAbiertoId = (id: string) => setPila(p => [...p, id]);
  const [formOpen, setFormOpen] = useState(false);
  const [escanerOpen, setEscanerOpen] = useState(false);
  const [sectoresOpen, setSectoresOpen] = useState(false);

  // Todos los sectores (también los que todavía no tienen equipos), para los filtros rápidos.
  const listaSectores = useMemo(() => sectoresConCantidad(s.sectores, equipos), [s.sectores, equipos]);
  const subsectoresDelSector = useMemo(() => listaSectores.find(x => x.id === sector)?.subsectores ?? [], [listaSectores, sector]);
  const delSector = useMemo(() => new Set(sector ? [sector, ...subsectoresDelSector.map(x => x.id)] : []), [sector, subsectoresDelSector]);

  const porId = useMemo(() => new Map(equipos.map(e => [e.id, e])), [equipos]);
  const hijosDe = useMemo(() => {
    const m = new Map<string, EquipoDeLista[]>();
    for (const e of equipos) if (e.padreId) m.set(e.padreId, [...(m.get(e.padreId) ?? []), e]);
    return m;
  }, [equipos]);
  // Sin buscar ni usar los filtros de alerta, la lista muestra solo los equipos principales (los sub-equipos están adentro de cada uno).
  // Elegir un sector o sub-sector no cambia eso.
  const soloPrincipales = !buscando && filtros.size === 0;

  const resultados = useMemo(() => {
    const encontrados: { equipo: EquipoDeLista; motivos: string[] }[] = buscando
      ? (busqueda.data ?? []).flatMap(r => (porId.has(r.id) ? [{ equipo: porId.get(r.id)!, motivos: r.motivos }] : []))
      : equipos.filter(e => !soloPrincipales || !e.padreId).map(equipo => ({ equipo, motivos: [] }));
    return encontrados.filter(({ equipo: e }) => {
      if (sector && !(e.sectorId && delSector.has(e.sectorId))) return false;
      if (subsector && e.sectorId !== subsector) return false;
      if (filtros.has('criticos') && !e.critico) return false;
      if (filtros.has('correctivo30') && !e.resumen.correctivoReciente) return false;
      if (filtros.has('faltaRepuesto') && !e.resumen.faltaRepuesto) return false;
      return true;
    });
  }, [buscando, busqueda.data, porId, equipos, soloPrincipales, sector, delSector, subsector, filtros]);

  function alternar(f: Filtro) {
    setFiltros(prev => {
      const n = new Set(prev);
      if (n.has(f)) n.delete(f); else n.add(f);
      return n;
    });
  }

  const hayFiltros = (!fijo && !!sector) || filtros.size > 0 || !!consulta.trim();
  const lugar = sectorFijo ? [padreFijo?.nombre, sectorFijo.nombre].filter(Boolean).join(' › ') : 'la lista';

  const modales = (
    <>
      <EquipoForm open={formOpen} onClose={() => setFormOpen(false)} equipo={null} onCreado={id => setAbiertoId(id)} />
      <SectoresModal open={sectoresOpen} onClose={() => setSectoresOpen(false)} />
      <EscanerEquipoModal open={escanerOpen} onClose={() => setEscanerOpen(false)} onEncontrado={id => { setEscanerOpen(false); setAbiertoId(id); }} />
    </>
  );

  // el equipo abierto, como pantalla (en lugar de la lista)
  const actual = pila.at(-1);
  if (actual) {
    const anterior = pila.length > 1 ? porId.get(pila[pila.length - 2]) : undefined;
    const llegoAbierto = pila.length === 1 && pila[0] === abrir && !!alVolver;
    return (
      <div>
        <FichaEquipoPantalla
          key={actual}
          equipoId={actual}
          onVolver={() => (llegoAbierto ? alVolver!() : setPila(p => p.slice(0, -1)))}
          textoVolver={anterior ? `Volver a ${anterior.nombre}` : llegoAbierto ? 'Volver' : `Volver a ${lugar}`}
          onAbrir={setAbiertoId}
        />
        {modales}
      </div>
    );
  }

  return (
    <div>
      <div className="section-header">
        <h1 className="section-title">
          {sectorFijo
            ? <><Icono n="fabrica" /> {padreFijo && <>{padreFijo.nombre} <span style={{ color: 'var(--text-muted)', display: 'inline-flex' }}><Icono n="desplegar" /></span> </>}{sectorFijo.nombre}</>
            : <><Icono n="buscar" /> Buscar equipo</>}
        </h1>
        {s.esAdmin && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="ghost" size="sm" onClick={() => setSectoresOpen(true)}><Icono n="lugar" /> Sectores</Button>
            <Button variant="primary" size="sm" onClick={() => setFormOpen(true)}><Icono n="mas" /> Nuevo equipo</Button>
          </div>
        )}
      </div>

      <div className="mt-buscador">
        <div className="mt-buscador-campo">
          <Icono n="buscar" />
          <Input
            type="text"
            placeholder="Buscá por nombre, código, sector, marca, falla, repuesto..."
            value={consulta}
            onChange={e => setConsulta(e.target.value)}
            aria-label="Buscar equipo"
            enterKeyHint="search"
          />
          {consulta && <button type="button" className="mt-buscador-limpiar" onClick={() => setConsulta('')} aria-label="Borrar búsqueda"><Icono n="cerrar" /></button>}
        </div>
        <Button variant="ghost" onClick={() => setEscanerOpen(true)} title="Escanear el QR del equipo" aria-label="Escanear el QR del equipo"><Icono n="camara" /> <span className="hide-mobile">QR</span></Button>
      </div>

      <div className="mt-chips" role="group" aria-label="Filtros rápidos">
        {!fijo && listaSectores.map(x => (
          <button key={x.id} type="button" className={`mt-chip${sector === x.id ? ' activo' : ''}`} aria-pressed={sector === x.id} onClick={() => setSector(sector === x.id ? null : x.id)}>{x.nombre}</button>
        ))}
        {FILTROS.map(f => (
          <button key={f.id} type="button" className={`mt-chip${f.alerta ? ' alerta' : ''}${filtros.has(f.id) ? ' activo' : ''}`} aria-pressed={filtros.has(f.id)} onClick={() => alternar(f.id)}>
            {f.alerta && <Icono n="alerta" />}{f.label}
          </button>
        ))}
      </div>
      {(!fijo || !sectorFijo?.padreId) && sector && subsectoresDelSector.length > 0 && (
        <div className="mt-chips mt-chips-sub" role="group" aria-label={`Sub-sectores de ${listaSectores.find(x => x.id === sector)?.nombre ?? ''}`}>
          <span className="mt-chips-titulo">{listaSectores.find(x => x.id === sector)?.nombre}:</span>
          {subsectoresDelSector.map(x => (
            <button key={x.id} type="button" className={`mt-chip${subsector === x.id ? ' activo' : ''}`} aria-pressed={subsector === x.id} onClick={() => setSubsector(subsector === x.id ? null : x.id)}>
              {x.nombre} <span style={{ opacity: 0.6 }}>{x.equipos}</span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-resumen" aria-live="polite">
        {buscando && busqueda.cargando && !busqueda.data ? 'Buscando...' : <>
          {soloPrincipales
            ? `${resultados.length} ${resultados.length === 1 ? 'equipo principal' : 'equipos principales'} (${resultados.reduce((n, r) => n + (hijosDe.get(r.equipo.id)?.length ?? 0), 0)} sub-equipos adentro)`
            : `${resultados.length} de ${equipos.length} equipos y sub-equipos`}
        </>}
        {hayFiltros && <> · <button type="button" className="mt-link" onClick={() => { setConsulta(''); if (!fijo) setSector(null); setFiltros(new Set()); }}>limpiar</button></>}
      </div>

      {s.equipos === undefined ? (
        <div className="mt-vacio">{s.isError ? 'No se pudieron leer los equipos. Probá de nuevo.' : 'Cargando equipos...'}</div>
      ) : resultados.length === 0 && !(buscando && busqueda.cargando) ? (
        <div className="empty-state">
          <div className="empty-icon"><Icono n="buscar" /></div>
          <h2>{fijo && !hayFiltros ? 'Este sector todavía no tiene equipos' : equipos.length ? 'No hay equipos que coincidan' : 'Todavía no hay equipos'}</h2>
          <p>{fijo && !hayFiltros ? (s.esAdmin ? 'Cargalos con "Nuevo equipo" eligiendo este sector, o importalos desde Excel.' : 'Todavía no se cargó ninguno.')
            : equipos.length ? 'Probá con menos palabras o sacá algún filtro.' : s.esAdmin ? 'Cargalos con "Nuevo equipo".' : 'Todavía no se cargó ninguno.'}</p>
        </div>
      ) : (
        <div className="mt-lista">
          {resultados.map(({ equipo: e, motivos }) => {
            const ult = e.resumen.ultimo;
            const padre = e.padreId ? porId.get(e.padreId) : null;
            return (
              <button key={e.id} type="button" className="mt-card" onClick={() => setAbiertoId(e.id)}>
                <div className="mt-card-top">
                  <span className="mt-card-nombre">{e.nombre}</span>
                  <span className="mt-card-codigo">{e.codigo}</span>
                </div>
                {padre && <div className="mt-card-linea"><Icono n="herramienta" /> Parte de <strong>{padre.codigo}</strong> — {padre.nombre}</div>}
                <div className="mt-tags">
                  {!!hijosDe.get(e.id)?.length && <span className="mt-tag prev">{hijosDe.get(e.id)!.length} sub-equipos</span>}
                  {e.sector && <span className="mt-tag sector">{e.sector}{e.subsector && ` · ${e.subsector}`}</span>}
                  {e.critico && <span className="mt-tag critico">Crítico</span>}
                  {e.resumen.faltaRepuesto && <span className="mt-tag falta"><Icono n="alerta" /> Falta repuesto</span>}
                  {e.etiquetas.slice(0, 4).map(t => <span key={t} className="mt-tag">{t}</span>)}
                </div>
                <div className="mt-card-linea">
                  {ult
                    ? <span><Icono n="historial" /> Último: {formatearFechaSola(ult.fecha)} ({ult.tipo})</span>
                    : <span><Icono n="historial" /> Sin historial</span>}
                </div>
                {motivos.length > 0 && <div className="mt-card-motivo">Coincide en: {motivos.join(', ')}</div>}
              </button>
            );
          })}
        </div>
      )}

      {modales}
    </div>
  );
}
