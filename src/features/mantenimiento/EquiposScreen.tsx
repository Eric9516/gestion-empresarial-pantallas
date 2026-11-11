import { useMemo, useState } from 'react';
import { fechaHoyISO, formatearFechaSola } from '../../lib/fechaHoy';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { buscarEquipos, normalizar } from './buscador';
import { diasEntre } from './fechas';
import { diasDeAviso, estadoAviso } from './preventivo';
import { useEquiposQuery, useIntervencionesQuery, useManualesQuery, useRepuestosCriticosQuery, useSectoresMantenimiento } from './useEquipos';
import { useOrdenesQuery, useRutinasQuery } from './usePreventivo';
import { useStockRepuestos } from './useStockRepuestos';
import EquipoForm from './EquipoForm';
import { FichaEquipoPantalla } from './FichaEquipoModal';
import EscanerEquipoModal from './EscanerEquipoModal';
import SectoresModal from './SectoresModal';
import type { Equipo, Intervencion, Manual, RepuestoCritico } from './tipos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icono } from '@/components/Icono';

type Filtro = 'criticos' | 'vencidas' | 'correctivo30' | 'faltaRepuesto';

const FILTROS: { id: Filtro; label: string; alerta?: boolean }[] = [
  { id: 'criticos', label: 'Críticos' },
  { id: 'vencidas', label: 'Con OT vencida', alerta: true },
  { id: 'correctivo30', label: 'Correctivo últimos 30 días' },
  { id: 'faltaRepuesto', label: 'Falta repuesto crítico', alerta: true },
];

function agrupar<T extends { equipoId: string }>(lista: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of lista) m.set(x.equipoId, [...(m.get(x.equipoId) ?? []), x]);
  return m;
}

interface Props {
  esAdmin: boolean;
  /** Equipo a mostrar abierto al llegar desde otra pestaña (se limpia al cerrar su ficha). */
  equipoAbrir: string | null;
  onEquipoAbierto: () => void;
  /**
   * Pantalla de un sector (o de un sub-sector), elegido en el menú: muestra solo sus equipos, con el nombre
   * del sector arriba y sin los botones para cambiar de sector.
   */
  fijo?: { sector: string; subsector: string | null };
  /** Si el equipo se abrió desde otra pantalla (Inicio, Calendario...), "Volver" lleva ahí. */
  volverA?: { texto: string; ir: () => void };
}

export default function EquiposScreen({ esAdmin, equipoAbrir, onEquipoAbierto, fijo, volverA }: Props) {
  const { data: equipos } = useEquiposQuery();
  const { data: intervenciones } = useIntervencionesQuery();
  const { data: repuestos } = useRepuestosCriticosQuery();
  const { data: manuales } = useManualesQuery();
  const { data: ordenes } = useOrdenesQuery();
  const { data: rutinas } = useRutinasQuery();
  const { stockDe } = useStockRepuestos();

  const [consulta, setConsulta] = useState('');
  const consultaDemorada = useDebouncedValue(consulta, 150);
  const [sector, setSectorElegido] = useState<string | null>(fijo?.sector ?? null);
  const [subsector, setSubsector] = useState<string | null>(fijo?.subsector ?? null);
  const setSector = (s: string | null) => { setSectorElegido(s); setSubsector(null); };
  const [filtros, setFiltros] = useState<Set<Filtro>>(new Set());
  // Equipos abiertos, uno encima del otro (por ejemplo, un equipo y después uno de sus sub-equipos):
  // "Volver" saca el último. Con la lista vacía se ve la lista de equipos (o el que llegó de otra pestaña).
  const [pila, setPila] = useState<string[]>([]);
  const setAbiertoId = (id: string) => setPila(p => [...p, id]);
  const [formOpen, setFormOpen] = useState(false);
  const [escanerOpen, setEscanerOpen] = useState(false);
  const [sectoresOpen, setSectoresOpen] = useState(false);

  const hoy = fechaHoyISO();
  const porEquipo = useMemo(() => ({
    intervenciones: agrupar<Intervencion>(intervenciones),
    repuestos: agrupar<RepuestoCritico>(repuestos),
    manuales: agrupar<Manual>(manuales),
  }), [intervenciones, repuestos, manuales]);

  // Todos los sectores (también los creados que todavía no tienen equipos), para los filtros rápidos.
  const listaSectores = useSectoresMantenimiento();
  const sectores = listaSectores.map(s => s.nombre);
  const subsectoresDelSector = listaSectores.find(s => s.nombre === sector)?.subsectores ?? [];

  const conVencida = useMemo(() => new Set(ordenes.filter(o => estadoAviso(o, hoy, diasDeAviso(o, rutinas)) === 'vencida').map(o => o.equipoId)), [ordenes, rutinas, hoy]);

  const porId = useMemo(() => new Map(equipos.map(e => [e.id, e])), [equipos]);
  const hijosDe = useMemo(() => agrupar(equipos.filter(e => e.padreId).map(e => ({ ...e, equipoId: e.padreId! }))), [equipos]);
  // Sin buscar ni usar los filtros de alerta, la lista muestra solo los equipos principales (los sub-equipos
  // están adentro de cada uno). Elegir un sector o sub-sector no cambia eso.
  const soloPrincipales = !consultaDemorada.trim() && filtros.size === 0;

  const resultados = useMemo(() => {
    const encontrados = buscarEquipos(soloPrincipales ? equipos.filter(e => !e.padreId) : equipos, consultaDemorada, id => ({
      intervenciones: porEquipo.intervenciones.get(id) ?? [],
      repuestos: porEquipo.repuestos.get(id) ?? [],
      manuales: porEquipo.manuales.get(id) ?? [],
      padre: porId.get(porId.get(id)?.padreId ?? '') ?? null,
    }));
    return encontrados.filter(({ equipo: e }) => {
      if (sector && normalizar(e.sector.trim()) !== normalizar(sector)) return false;
      if (subsector && normalizar(e.subsector.trim()) !== normalizar(subsector)) return false;
      if (filtros.has('criticos') && !e.critico) return false;
      if (filtros.has('vencidas') && !conVencida.has(e.id)) return false;
      if (filtros.has('correctivo30') && !(porEquipo.intervenciones.get(e.id) ?? []).some(i => i.tipo === 'correctivo' && diasEntre(i.fecha, hoy) <= 30)) return false;
      if (filtros.has('faltaRepuesto') && !(porEquipo.repuestos.get(e.id) ?? []).some(r => stockDe(r).falta)) return false;
      return true;
    });
  }, [equipos, consultaDemorada, porEquipo, sector, subsector, filtros, conVencida, hoy, stockDe, porId, soloPrincipales]);

  function alternar(f: Filtro) {
    setFiltros(prev => {
      const s = new Set(prev);
      if (s.has(f)) s.delete(f); else s.add(f);
      return s;
    });
  }

  function ultimo(e: Equipo) {
    const lista = porEquipo.intervenciones.get(e.id);
    if (!lista?.length) return null;
    return lista.reduce((a, b) => (b.fecha > a.fecha ? b : a));
  }

  function proximaOT(e: Equipo) {
    return ordenes.filter(o => o.equipoId === e.id && o.estado !== 'terminada').sort((a, b) => a.fechaProgramada.localeCompare(b.fechaProgramada))[0] ?? null;
  }

  const hayFiltros = (!fijo && !!sector) || filtros.size > 0 || !!consulta.trim();

  // Pantalla del equipo abierto (en lugar de la lista).
  const anteriores = equipoAbrir ? [equipoAbrir, ...pila] : pila;
  const abiertoActual = anteriores.length ? anteriores[anteriores.length - 1] : null;
  const equipoActual = abiertoActual ? porId.get(abiertoActual) : undefined;
  const anterior = anteriores.length > 1 ? porId.get(anteriores[anteriores.length - 2]) : undefined;
  const lugar = fijo ? `${fijo.sector}${fijo.subsector ? ` › ${fijo.subsector}` : ''}` : 'Equipos';

  function volver() {
    if (pila.length) setPila(p => p.slice(0, -1));
    else onEquipoAbierto();
  }

  function cerrarTodo() {
    setPila([]);
    onEquipoAbierto();
  }

  const modales = (
    <>
      <EquipoForm open={formOpen} onClose={() => setFormOpen(false)} equipo={null} onCreado={id => setAbiertoId(id)} />
      <SectoresModal open={sectoresOpen} onClose={() => setSectoresOpen(false)} />
      <EscanerEquipoModal
        open={escanerOpen}
        onClose={() => setEscanerOpen(false)}
        onEncontrado={id => { setEscanerOpen(false); setAbiertoId(id); }}
      />
    </>
  );

  if (equipoActual) {
    return (
      <div>
        <FichaEquipoPantalla
          key={equipoActual.id}
          equipoId={equipoActual.id}
          onVolver={anterior ? volver : volverA && equipoAbrir ? volverA.ir : cerrarTodo}
          textoVolver={anterior ? `Volver a ${anterior.nombre}` : volverA && equipoAbrir ? `Volver a ${volverA.texto}` : `Volver a ${lugar}`}
          onAbrir={setAbiertoId}
          esAdmin={esAdmin}
        />
        {modales}
      </div>
    );
  }

  return (
    <div>
      <div className="section-header">
        <div className="section-title">
          {fijo
            ? <><Icono n="fabrica" /> {fijo.sector}{fijo.subsector && <> <span style={{ color: 'var(--text-muted)', display: 'inline-flex' }}><Icono n="desplegar" /></span> {fijo.subsector}</>}</>
            : <><Icono n="herramienta" /> Equipos</>}
        </div>
        {esAdmin && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="ghost" size="sm" onClick={() => setSectoresOpen(true)}><Icono n="fabrica" /> Sectores</Button>
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
        <Button variant="ghost" onClick={() => setEscanerOpen(true)} title="Escanear el QR del equipo"><Icono n="camara" /> <span className="hide-mobile">QR</span></Button>
      </div>

      <div className="mt-chips" role="group" aria-label="Filtros rápidos">
        {!fijo && sectores.map(s => (
          <button key={s} type="button" className={`mt-chip${sector === s ? ' activo' : ''}`} aria-pressed={sector === s} onClick={() => setSector(sector === s ? null : s)}>{s}</button>
        ))}
        {FILTROS.map(f => (
          <button key={f.id} type="button" className={`mt-chip${f.alerta ? ' alerta' : ''}${filtros.has(f.id) ? ' activo' : ''}`} aria-pressed={filtros.has(f.id)} onClick={() => alternar(f.id)}>
            {f.alerta && <Icono n="alerta" />}{f.label}
          </button>
        ))}
      </div>
      {!fijo && sector && subsectoresDelSector.length > 0 && (
        <div className="mt-chips mt-chips-sub" role="group" aria-label={`Sub-sectores de ${sector}`}>
          <span className="mt-chips-titulo">{sector}:</span>
          {subsectoresDelSector.map(s => (
            <button key={s.nombre} type="button" className={`mt-chip${subsector === s.nombre ? ' activo' : ''}`} aria-pressed={subsector === s.nombre} onClick={() => setSubsector(subsector === s.nombre ? null : s.nombre)}>
              {s.nombre} <span style={{ opacity: 0.6 }}>{s.equipos}</span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-resumen">
        {resultados.length} {soloPrincipales ? `equipos principales (${resultados.reduce((n, r) => n + (hijosDe.get(r.equipo.id)?.length ?? 0), 0)} sub-equipos adentro)` : `de ${equipos.length} equipos y sub-equipos`}
        {hayFiltros && <> · <button type="button" onClick={() => { setConsulta(''); if (!fijo) setSector(null); setFiltros(new Set()); }} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--blue)', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}>limpiar</button></>}
      </div>

      {resultados.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><Icono n="buscar" /></div>
          <h3>{fijo && !hayFiltros ? 'Este sector todavía no tiene equipos' : equipos.length ? 'No hay equipos que coincidan' : 'Todavía no hay equipos'}</h3>
          <p>{fijo && !hayFiltros ? 'Cargalos con "Nuevo equipo" eligiendo este sector, o importalos desde Excel.' : equipos.length ? 'Probá con menos palabras o sacá algún filtro.' : 'Cargalos con "Nuevo equipo" o importalos desde Excel.'}</p>
        </div>
      ) : (
        <div className="mt-lista">
          {resultados.map(({ equipo: e, motivos }) => {
            const ult = ultimo(e);
            const ot = proximaOT(e);
            const estadoOt = ot ? estadoAviso(ot, hoy, diasDeAviso(ot, rutinas)) : null;
            return (
              <button key={e.id} type="button" className="mt-card" onClick={() => setAbiertoId(e.id)}>
                <div className="mt-card-top">
                  <span className="mt-card-nombre">{e.nombre}</span>
                  <span className="mt-card-codigo">{e.codigo}</span>
                </div>
                {e.padreId && porId.get(e.padreId) && (
                  <div className="mt-card-linea"><Icono n="herramienta" /> Parte de <strong>{porId.get(e.padreId)!.codigo}</strong> — {porId.get(e.padreId)!.nombre}</div>
                )}
                <div className="mt-tags">
                  {!!hijosDe.get(e.id)?.length && <span className="mt-tag prev">{hijosDe.get(e.id)!.length} sub-equipos</span>}
                  {hijosDe.get(e.id)?.some(h => conVencida.has(h.id)) && <span className="mt-tag vencida">Sub-equipo con OT vencida</span>}
                  {e.sector && <span className="mt-tag sector">{e.sector}{e.subsector && ` · ${e.subsector}`}</span>}
                  {e.critico && <span className="mt-tag critico">Crítico</span>}
                  {e.etiquetas.slice(0, 4).map(t => <span key={t} className="mt-tag">{t}</span>)}
                </div>
                <div className="mt-card-linea">
                  {ult
                    ? <span><Icono n="historial" /> Último: {formatearFechaSola(ult.fecha)} ({ult.tipo})</span>
                    : <span><Icono n="historial" /> Sin historial</span>}
                  {ot && estadoOt && (
                    <span className={`mt-tag ${estadoOt}`}>
                      {estadoOt === 'vencida' ? 'OT vencida' : estadoOt === 'por_vencer' ? 'OT por vencer' : 'Próxima OT'} {formatearFechaSola(ot.fechaProgramada)}
                    </span>
                  )}
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
