import { useMemo, useState } from 'react';
import ResponsiveList, { type Column } from '../../components/ResponsiveList';
import { useToast } from '../../components/ToastProvider';
import { useConfirm } from '../../components/ConfirmProvider';
import { registrarErrorAccion } from '../../lib/errorLogging';
import { formatearFechaSola } from '../../lib/fechaHoy';
import RotuloBultosModal from '../rotulos/RotuloBultosModal';
import { resolverEnvioVigenteId } from '../rotulos/useRotulos';
import EditarReparacionModal from './EditarReparacionModal';
import EstadoChip from './EstadoChip';
import ReparacionDetalleModal from './ReparacionDetalleModal';
import ReparacionForm from './ReparacionForm';
import RegistrarEntregaModal from './RegistrarEntregaModal';
import {
  cantidadDevuelta, estadoReparacion, useEliminarReparacion, useReparacionesQuery,
  type ReparacionConDetalle, type ReparacionItemConDetalle,
} from './useReparaciones';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { mensajeDeError } from '@/lib/errores';
import { Icono } from '@/components/Icono';

function coincide(rep: ReparacionConDetalle, query: string): boolean {
  const palabras = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!palabras.length) return true;
  const campos = [
    rep.proveedores?.nombre, rep.motivo, rep.orden_compra_numero, rep.rotulos_generados?.numero_documento,
    ...rep.reparacion_items.flatMap(li => [
      li.items?.codigo, li.items?.descripcion,
      ...li.reparacion_entregas.flatMap(e => [e.remito_numero, e.remito_punto_venta]),
    ]),
  ].filter((v): v is string => !!v).map(v => v.toLowerCase());
  return palabras.every(p => campos.some(c => c.includes(p)));
}

function totales(rep: ReparacionConDetalle) {
  const enviado = rep.reparacion_items.reduce((acc, l) => acc + Number(l.cantidad), 0);
  const devuelto = rep.reparacion_items.reduce((acc, l) => acc + cantidadDevuelta(l), 0);
  return { enviado, devuelto };
}

// Primer artículo y, si hay más, un chip "+N más". El detalle completo queda en
// el tooltip y en la ventana "Ver".
function resumenArticulos(rep: ReparacionConDetalle) {
  const lineas = rep.reparacion_items;
  if (!lineas.length) return <>—</>;
  const [primera, ...resto] = lineas;
  const detalle = lineas.map(l => `${l.items?.codigo} — ${l.items?.descripcion}`).join('\n');
  return (
    <span title={detalle} style={{ display: 'flex', alignItems: 'center', gap: 8, maxWidth: 300 }}>
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        <strong>{primera.items?.codigo}</strong> — {primera.items?.descripcion}
      </span>
      {resto.length > 0 && (
        <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#eaf0fb', color: 'var(--blue)', whiteSpace: 'nowrap' }}>
          +{resto.length} más
        </span>
      )}
    </span>
  );
}

export default function ReparacionesScreen() {
  const { data: reparaciones, isLoading, isError } = useReparacionesQuery(true);
  const eliminar = useEliminarReparacion();
  const toast = useToast();
  const confirmar = useConfirm();

  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<'pendientes' | 'cerradas' | 'todas'>('pendientes');
  const [formOpen, setFormOpen] = useState(false);
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [entregaLinea, setEntregaLinea] = useState<ReparacionItemConDetalle | null>(null);
  const [editando, setEditando] = useState<ReparacionConDetalle | null>(null);
  const [envioAbiertoId, setEnvioAbiertoId] = useState<string | null>(null);

  // Se busca en la lista cargada (no se guarda una copia) para que el detalle
  // se actualice solo al registrar una entrega o editar los datos.
  const detalle = useMemo(() => (reparaciones ?? []).find(r => r.id === detalleId) ?? null, [reparaciones, detalleId]);

  async function abrirEnvio(envioId: string) {
    try {
      setEnvioAbiertoId(await resolverEnvioVigenteId(envioId));
    } catch (err) {
      await registrarErrorAccion('Error al abrir el envío de una reparación', err);
      toast('No se pudo abrir el envío', 'error');
    }
  }

  function EnvioLink({ rep }: { rep: ReparacionConDetalle }) {
    const numero = rep.rotulos_generados?.numero_documento;
    if (!rep.envio_id || !numero) return <>{numero ?? '—'}</>;
    return (
      <button
        type="button"
        title="Ver los datos del envío"
        onClick={() => void abrirEnvio(rep.envio_id!)}
        style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'var(--blue)', textDecoration: 'underline', cursor: 'pointer' }}
      >{numero}</button>
    );
  }

  const filas = useMemo(() => (reparaciones ?? []).filter(r => {
    if (!coincide(r, busqueda)) return false;
    if (filtro === 'todas') return true;
    const est = estadoReparacion(r);
    return filtro === 'cerradas' ? est === 'cerrada' : est !== 'cerrada';
  }), [reparaciones, busqueda, filtro]);

  async function handleEliminar(rep: ReparacionConDetalle) {
    if (!(await confirmar(`¿Eliminar la reparación con ${rep.proveedores?.nombre ?? 'este proveedor'}? El stock pendiente vuelve, y queda en la Papelera.`, { textoConfirmar: 'Eliminar', peligroso: true }))) return;
    try {
      await eliminar.mutateAsync(rep.id);
      if (detalleId === rep.id) setDetalleId(null);
      toast('Reparación eliminada', 'success');
    } catch (err) {
      await registrarErrorAccion('Error al eliminar una reparación', err);
      toast('Error al eliminar: ' + mensajeDeError(err), 'error');
    }
  }

  const columns: Column<ReparacionConDetalle>[] = [
    { header: 'Proveedor', render: r => r.proveedores?.nombre ?? '—' },
    { header: 'Motivo', render: r => r.motivo },
    { header: 'Salida', render: r => formatearFechaSola(r.fecha_salida) },
    { header: 'Envío', render: r => <EnvioLink rep={r} /> },
    { header: 'OC', render: r => r.orden_compra_numero || '—' },
    { header: 'Artículos', render: r => resumenArticulos(r) },
    { header: 'Devuelto', render: r => { const t = totales(r); return <span>{t.devuelto} / {t.enviado}</span>; } },
    { header: 'Estado', render: r => <EstadoChip estado={estadoReparacion(r)} /> },
    {
      header: '', render: r => (
        <div className="td-actions">
          <Button variant="primary" size="sm" onClick={() => setDetalleId(r.id)}>Ver</Button>
          <Button variant="ghost" size="icon" title="Editar reparación" onClick={() => setEditando(r)}><Icono n="editar" /></Button>
          <Button variant="dangerGhost" size="icon" title="Eliminar toda la reparación" onClick={() => void handleEliminar(r)}><Icono n="borrar" /></Button>
        </div>
      ),
    },
  ];

  function renderCard(r: ReparacionConDetalle) {
    const t = totales(r);
    return (
      <div className="prov-card">
        <div className="prov-card-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span className="prov-card-name">{r.proveedores?.nombre ?? '—'}</span>
            <EstadoChip estado={estadoReparacion(r)} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-mid)' }}>{r.motivo}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Salida {formatearFechaSola(r.fecha_salida)}
            {r.rotulos_generados?.numero_documento && <> · Envío <EnvioLink rep={r} /></>}
            {r.orden_compra_numero && <> · OC {r.orden_compra_numero}</>}
          </div>
        </div>
        <div className="prov-card-body">
          <div className="prov-card-row">{resumenArticulos(r)}</div>
          <div className="prov-card-row">Devuelto: {t.devuelto} / {t.enviado}</div>
        </div>
        <div className="prov-card-actions">
          <Button variant="primary" size="sm" onClick={() => setDetalleId(r.id)}>Ver</Button>
          <Button variant="ghost" size="sm" onClick={() => setEditando(r)}><Icono n="editar" /> Editar</Button>
          <Button variant="dangerGhost" size="sm" onClick={() => void handleEliminar(r)}><Icono n="borrar" /> Eliminar reparación</Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="section-header">
        <div className="section-title"><Icono n="herramienta" /> Reparaciones</div>
      </div>

      <div className="toolbar">
        <div className="search-wrap">
          <Input type="text" placeholder="Proveedor, artículo, OC, remito..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        </div>
        <Select className="filter-select" value={filtro} onChange={e => setFiltro(e.target.value as typeof filtro)}>
          <option value="pendientes">Pendientes</option>
          <option value="cerradas">Cerradas</option>
          <option value="todas">Todas</option>
        </Select>
        <Button variant="primary" size="sm" onClick={() => setFormOpen(true)}>+ Nueva reparación</Button>
      </div>

      {isLoading && <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>}
      {isError && <p style={{ color: 'var(--danger)' }}>Error al cargar las reparaciones.</p>}

      {!isLoading && !isError && (
        <ResponsiveList
          columns={columns}
          data={filas}
          renderCard={renderCard}
          keyField={r => r.id}
          emptyIcon={<Icono n="herramienta" />}
          emptyTitle="No hay reparaciones"
          emptyDescription={filtro === 'pendientes' ? 'No hay ninguna reparación pendiente en este momento.' : 'Probá con otro filtro o búsqueda.'}
        />
      )}

      <ReparacionForm open={formOpen} onClose={() => setFormOpen(false)} />
      <ReparacionDetalleModal
        reparacion={detalle}
        onClose={() => setDetalleId(null)}
        onEntrega={setEntregaLinea}
        onEditar={setEditando}
        onVerEnvio={envioId => void abrirEnvio(envioId)}
      />
      <RegistrarEntregaModal linea={entregaLinea} onClose={() => setEntregaLinea(null)} />
      <EditarReparacionModal reparacion={editando} onClose={() => setEditando(null)} />
      <RotuloBultosModal open={!!envioAbiertoId} onClose={() => setEnvioAbiertoId(null)} rotuloId={envioAbiertoId} />
    </div>
  );
}
