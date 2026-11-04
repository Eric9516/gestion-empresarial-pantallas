import { useMemo, useState } from 'react';
import { fechaHoyISO, formatearFechaSola } from '../../lib/fechaHoy';
import { normalizar, palabrasDeBusqueda } from './buscador';
import { avanceTareas, diasDeAviso, estadoAviso, resumenTareas } from './preventivo';
import { useImprimirOrdenes } from './useImprimirOrdenes';
import { useEquiposQuery, usePersonasSugeridas } from './useEquipos';
import { useOrdenesQuery, useRutinasQuery } from './usePreventivo';
import { useFaltantes } from './useStockRepuestos';
import OrdenDetalleModal from './OrdenDetalleModal';
import OrdenCorrectivaForm from './OrdenCorrectivaForm';
import FormatoOTModal from './FormatoOTModal';
import EstadoOT from './EstadoOT';
import { useAuth } from '../../auth/AuthContext';
import { isDepositoAdmin } from '../../lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Icono } from '@/components/Icono';

export type FiltroOrdenes = 'abiertas' | 'falta' | 'terminadas' | 'todas';
type Filtro = FiltroOrdenes;

// Lista de todas las órdenes de trabajo (preventivas y correctivas), con buscador.
export default function OrdenesScreen({ onVerEquipo, filtroInicial = 'abiertas' }: { onVerEquipo: (equipoId: string) => void; filtroInicial?: Filtro }) {
  const { profile } = useAuth();
  const esAdmin = isDepositoAdmin(profile);
  const { data: ordenes } = useOrdenesQuery();
  const { data: rutinas } = useRutinasQuery();
  const { data: equipos } = useEquiposQuery();
  const personas = usePersonasSugeridas();
  const hoy = fechaHoyISO();
  const [filtro, setFiltro] = useState<Filtro>(filtroInicial);
  const faltantes = useFaltantes();
  const [consulta, setConsulta] = useState('');
  const [otAbierta, setOtAbierta] = useState<string | null>(null);
  const [correctivaOpen, setCorrectivaOpen] = useState(false);
  const [formatoOpen, setFormatoOpen] = useState(false);
  const imprimir = useImprimirOrdenes();

  const equipoPorId = useMemo(() => new Map(equipos.map(e => [e.id, e])), [equipos]);

  const filas = useMemo(() => {
    const palabras = palabrasDeBusqueda(consulta);
    return ordenes
      .filter(o => filtro === 'todas' || (filtro === 'terminadas' ? o.estado === 'terminada' : o.estado !== 'terminada'))
      .filter(o => filtro !== 'falta' || faltantes(o.repuestos).length > 0)
      .filter(o => {
        if (!palabras.length) return true;
        const e = equipoPorId.get(o.equipoId);
        const texto = normalizar([
          o.numero, o.tareas, o.asignadoA, o.observaciones, o.tipo, e?.codigo, e?.nombre, e?.sector, o.correctivo?.falla, o.correctivo?.causa,
          ...o.repuestos.flatMap(r => [r.componente, r.codigo, r.descripcion]),
        ].join(' '));
        return palabras.every(p => texto.includes(p));
      })
      .sort((a, b) => filtro === 'terminadas'
        ? (b.fechaCierre ?? '').localeCompare(a.fechaCierre ?? '')
        : a.fechaProgramada.localeCompare(b.fechaProgramada));
  }, [ordenes, filtro, consulta, equipoPorId, faltantes]);

  return (
    <div>
      <div className="section-header">
        <div className="section-title"><Icono n="lista" /> Órdenes de trabajo</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {filas.length > 0 && <Button variant="ghost" size="sm" onClick={() => void imprimir(filas)} title="Un PDF con una hoja por OT"><Icono n="imprimir" /> Imprimir las {filas.length} de la lista</Button>}
          {esAdmin && <Button variant="ghost" size="sm" onClick={() => setFormatoOpen(true)}><Icono n="config" /> Formato de la OT</Button>}
          <Button variant="primary" size="sm" onClick={() => setCorrectivaOpen(true)}><Icono n="mas" /> OT correctiva</Button>
        </div>
      </div>
      <div className="toolbar">
        <div className="search-wrap">
          <Input type="search" placeholder="Número, equipo, tarea, persona..." value={consulta} onChange={e => setConsulta(e.target.value)} />
        </div>
        <Select className="filter-select" value={filtro} onChange={e => setFiltro(e.target.value as Filtro)}>
          <option value="abiertas">Abiertas</option>
          <option value="falta">Abiertas con repuesto faltante</option>
          <option value="terminadas">Terminadas</option>
          <option value="todas">Todas</option>
        </Select>
      </div>

      {!filas.length ? (
        <div className="empty-state">
          <div className="empty-icon"><Icono n="lista" /></div>
          <h3>No hay órdenes</h3>
          <p>{filtro === 'abiertas' ? 'No hay órdenes abiertas.' : filtro === 'falta' ? 'A ninguna OT abierta le falta stock de repuestos.' : 'Probá con otro filtro o búsqueda.'}</p>
        </div>
      ) : (
        <div className="mt-lista">
          {filas.map(o => {
            const e = equipoPorId.get(o.equipoId);
            return (
              <button key={o.id} type="button" className="mt-card" onClick={() => setOtAbierta(o.id)}>
                <div className="mt-card-top">
                  <span className="mt-card-nombre">{o.numero} · {e ? `${e.codigo} — ${e.nombre}` : 'Equipo eliminado'}</span>
                </div>
                <div className="mt-tags">
                  <EstadoOT ot={o} estado={estadoAviso(o, hoy, diasDeAviso(o, rutinas))} conFecha />
                  <span className={`mt-tag ${o.tipo === 'preventiva' ? 'prev' : 'corr'}`}>{o.tipo === 'preventiva' ? 'Preventiva' : 'Correctiva'}</span>
                </div>
                <div className="mt-card-linea">{resumenTareas(o.tareas)}{avanceTareas(o) && <span className="mt-tag">{avanceTareas(o)}</span>}</div>
                <div className="mt-card-linea">
                  {o.asignadoA && <span><Icono n="usuario" /> {o.asignadoA}</span>}
                  {o.estado === 'terminada' && o.fechaCierre && <span><Icono n="exito" /> Terminada el {formatearFechaSola(o.fechaCierre)}</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <OrdenDetalleModal ordenId={otAbierta} onClose={() => setOtAbierta(null)} onVerEquipo={onVerEquipo} esAdmin={esAdmin} personas={personas} />
      <FormatoOTModal open={formatoOpen} onClose={() => setFormatoOpen(false)} />
      <OrdenCorrectivaForm open={correctivaOpen} onClose={() => setCorrectivaOpen(false)} personas={personas} />
    </div>
  );
}
