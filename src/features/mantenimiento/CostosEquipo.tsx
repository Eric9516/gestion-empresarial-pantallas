import { useId, useMemo, useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { useConfirm } from '../../components/ConfirmProvider';
import { fechaHoyISO, formatearFechaSola } from '../../lib/fechaHoy';
import { calcularCostos, leerMonto, textoPesos, type TipoCosto } from './costos';
import { periodo } from './disponibilidad';
import { useEliminarGastoExterno, useGastosExternosQuery, useGuardarGastoExterno, useIntervencionesQuery } from './useEquipos';
import { useConfigMantenimiento, useGuardarConfigMantenimiento } from './usePreventivo';
import type { Equipo } from './tipos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Icono } from '@/components/Icono';

// Planilla de costos del equipo, en la solapa Datos: repuestos usados (con el precio anotado al terminar
// la OT), mano de obra propia (horas × valor de la hora) y servicios externos (cargados acá).
// Del equipo principal se suman sus sub-equipos.

type PeriodoCostos = 'mes' | 'anio' | 'todo';

const PERIODOS: { id: PeriodoCostos; label: string }[] = [
  { id: 'mes', label: 'Este mes' },
  { id: 'anio', label: 'Este año' },
  { id: 'todo', label: 'Todo' },
];

const NOMBRE: Record<TipoCosto, string> = { repuestos: 'Repuestos', manoDeObra: 'Mano de obra', externo: 'Externo' };

export default function CostosEquipo({ equipo, subEquipos, esAdmin }: { equipo: Equipo; subEquipos: Equipo[]; esAdmin: boolean }) {
  const { data: intervenciones } = useIntervencionesQuery();
  const { data: gastos } = useGastosExternosQuery();
  const config = useConfigMantenimiento();
  const eliminar = useEliminarGastoExterno();
  const toast = useToast();
  const confirmar = useConfirm();
  const [periodoId, setPeriodoId] = useState<PeriodoCostos>('anio');
  const [gastoOpen, setGastoOpen] = useState(false);
  const [horaOpen, setHoraOpen] = useState(false);
  const [verDetalle, setVerDetalle] = useState(false);
  const hoy = fechaHoyISO();

  const c = useMemo(
    () => calcularCostos(equipo, subEquipos, intervenciones, gastos, config.costoHora, periodoId === 'todo' ? null : periodo(periodoId, hoy)),
    [equipo, subEquipos, intervenciones, gastos, config.costoHora, periodoId, hoy],
  );

  async function borrarGasto(id: string, concepto: string) {
    if (!(await confirmar(`¿Borrar el gasto "${concepto}"?`, { textoConfirmar: 'Borrar', peligroso: true }))) return;
    await eliminar.mutateAsync(id);
    toast('Gasto borrado', 'success');
  }

  return (
    <div className="mt-bloque mt-costos">
      <div className="mt-bloque-titulo">
        <span><Icono n="informe" /> Costos{subEquipos.length > 0 && <span className="mt-disp-cant"> (con sus sub-equipos)</span>}</span>
        {esAdmin && <Button variant="ghost" size="sm" onClick={() => setGastoOpen(true)}><Icono n="mas" /> Gasto externo</Button>}
      </div>

      <div className="mt-chips" role="radiogroup" aria-label="Período de los costos" style={{ marginBottom: 8 }}>
        {PERIODOS.map(x => (
          <button key={x.id} type="button" role="radio" aria-checked={periodoId === x.id} className={`mt-chip${periodoId === x.id ? ' activo' : ''}`} onClick={() => setPeriodoId(x.id)}>{x.label}</button>
        ))}
      </div>

      <table className="mt-costos-tabla">
        <tbody>
          <tr><th scope="row">Repuestos</th><td>{textoPesos(c.repuestos)}</td></tr>
          <tr>
            <th scope="row">Mano de obra</th>
            <td>
              {textoPesos(c.manoDeObra)}
              {c.horas > 0 && config.costoHora != null && <span className="mt-costos-aclara">{c.horas.toLocaleString('es-AR', { maximumFractionDigits: 2 })} h × {textoPesos(config.costoHora)}</span>}
            </td>
          </tr>
          <tr><th scope="row">Servicios externos</th><td>{textoPesos(c.externos)}</td></tr>
          <tr className="total"><th scope="row">Total</th><td>{textoPesos(c.total)}</td></tr>
        </tbody>
      </table>

      {(c.faltaCostoHora || c.repuestosSinPrecio > 0) && (
        <div className="mt-costos-avisos">
          {c.faltaCostoHora && (
            <div><Icono n="alerta" /> Falta el valor de la hora: las {c.horas.toLocaleString('es-AR')} h de trabajo no suman.{esAdmin && <> <button type="button" className="mt-link" onClick={() => setHoraOpen(true)}>Cargarlo</button></>}</div>
          )}
          {c.repuestosSinPrecio > 0 && (
            <div><Icono n="alerta" /> {c.repuestosSinPrecio === 1 ? '1 repuesto usado no tiene precio' : `${c.repuestosSinPrecio} repuestos usados no tienen precio`}: se puede anotar editando el registro en el Historial.</div>
          )}
        </div>
      )}

      <div className="mt-costos-pie">
        {c.lineas.length > 0
          ? <button type="button" className="mt-link" onClick={() => setVerDetalle(v => !v)} aria-expanded={verDetalle}>{verDetalle ? 'Ocultar el detalle' : `Ver el detalle (${c.lineas.length})`}</button>
          : <span className="mt-disp-cant">Sin costos en este período.</span>}
        {esAdmin && <button type="button" className="mt-link" onClick={() => setHoraOpen(true)}>Valor de la hora: {config.costoHora != null ? textoPesos(config.costoHora) : 'sin cargar'}</button>}
      </div>

      {verDetalle && c.lineas.length > 0 && (
        <div className="mt-costos-detalle">
          {c.lineas.map(l => (
            <div key={l.id} className="mt-costos-linea">
              <div className="mt-costos-linea-top">
                <span>{formatearFechaSola(l.fecha)} · <span className={`mt-tag ${l.tipo === 'externo' ? '' : l.tipo === 'repuestos' ? 'corr' : 'prev'}`}>{NOMBRE[l.tipo]}</span>{l.ot && ` · ${l.ot}`}</span>
                <strong>{l.monto != null ? textoPesos(l.monto) : <span className="mt-disp-cant">sin {l.tipo === 'repuestos' ? 'precio' : 'valor de hora'}</span>}</strong>
              </div>
              <div className="mt-costos-linea-texto">
                {l.concepto}{l.subEquipo && <span className="mt-disp-cant"> · {l.subEquipo}</span>}
                {esAdmin && l.gastoId && <button type="button" className="mt-link" style={{ marginLeft: 8 }} onClick={() => void borrarGasto(l.gastoId!, l.concepto)}>Borrar</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      <GastoExternoModal open={gastoOpen} onClose={() => setGastoOpen(false)} equipo={equipo} subEquipos={subEquipos} />
      <CostoHoraModal open={horaOpen} onClose={() => setHoraOpen(false)} />
    </div>
  );
}

function GastoExternoModal({ open, onClose, equipo, subEquipos }: { open: boolean; onClose: () => void; equipo: Equipo; subEquipos: Equipo[] }) {
  return (
    <Modal open={open} onClose={onClose} title={<><Icono n="informe" /> Gasto externo</>}>
      {open && <GastoForm equipo={equipo} subEquipos={subEquipos} onClose={onClose} />}
    </Modal>
  );
}

function GastoForm({ equipo, subEquipos, onClose }: { equipo: Equipo; subEquipos: Equipo[]; onClose: () => void }) {
  const uid = useId();
  const toast = useToast();
  const guardar = useGuardarGastoExterno();
  const [fecha, setFecha] = useState(fechaHoyISO());
  const [equipoId, setEquipoId] = useState(equipo.id);
  const [proveedor, setProveedor] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [monto, setMonto] = useState('');

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const m = leerMonto(monto);
    if (!descripcion.trim()) { toast('Contá qué se hizo.', 'error'); return; }
    if (m == null || m <= 0) { toast('El monto tiene que ser un número mayor a 0.', 'error'); return; }
    await guardar.mutateAsync({ equipoId, fecha, proveedor: proveedor.trim(), descripcion: descripcion.trim(), monto: m });
    toast('Gasto guardado', 'success');
    onClose();
  }

  return (
    <form onSubmit={enviar}>
      <div className="form-grid">
        <div className="form-group">
          <label htmlFor={`${uid}-f`}>Fecha</label>
          <Input id={`${uid}-f`} type="date" value={fecha} onChange={e => setFecha(e.target.value)} required />
        </div>
        <div className="form-group">
          <label htmlFor={`${uid}-m`}>Monto $ *</label>
          <Input id={`${uid}-m`} inputMode="decimal" value={monto} onChange={e => setMonto(e.target.value)} placeholder="Ej.: 150.000" />
        </div>
        {subEquipos.length > 0 && (
          <div className="form-group full">
            <label htmlFor={`${uid}-e`}>Equipo</label>
            <Select id={`${uid}-e`} value={equipoId} onChange={e => setEquipoId(e.target.value)}>
              <option value={equipo.id}>{equipo.codigo} — {equipo.nombre}</option>
              {subEquipos.map(s => <option key={s.id} value={s.id}>{s.codigo} — {s.nombre}</option>)}
            </Select>
          </div>
        )}
        <div className="form-group full">
          <label htmlFor={`${uid}-d`}>Qué se hizo *</label>
          <Input id={`${uid}-d`} data-autofocus value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Ej.: Service de las 4000 horas" />
        </div>
        <div className="form-group full">
          <label htmlFor={`${uid}-p`}>Quién lo hizo</label>
          <Input id={`${uid}-p`} value={proveedor} onChange={e => setProveedor(e.target.value)} placeholder="Empresa o persona" />
        </div>
      </div>
      <div className="modal-footer">
        <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button type="submit" variant="primary"><Icono n="guardar" /> Guardar</Button>
      </div>
    </form>
  );
}

function CostoHoraModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={<><Icono n="reloj" /> Valor de la hora</>}>
      {open && <CostoHoraForm onClose={onClose} />}
    </Modal>
  );
}

function CostoHoraForm({ onClose }: { onClose: () => void }) {
  const uid = useId();
  const toast = useToast();
  const config = useConfigMantenimiento();
  const guardar = useGuardarConfigMantenimiento();
  const [valor, setValor] = useState(config.costoHora != null ? String(config.costoHora).replace('.', ',') : '');

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const v = valor.trim() ? leerMonto(valor) : null;
    if (valor.trim() && v == null) { toast('El valor tiene que ser un número.', 'error'); return; }
    await guardar.mutateAsync({ ...config, costoHora: v });
    toast('Valor de la hora guardado', 'success');
    onClose();
  }

  return (
    <form onSubmit={enviar}>
      <p style={{ fontSize: 13, color: 'var(--text-mid)', marginTop: 0 }}>
        Uno solo para todos los técnicos. Se usa para la mano de obra de todos los equipos (horas de trabajo × este valor), también la de trabajos anteriores.
      </p>
      <div className="form-group">
        <label htmlFor={`${uid}-v`}>Valor de la hora hombre $</label>
        <Input id={`${uid}-v`} data-autofocus inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} placeholder="Ej.: 15.000" />
      </div>
      <div className="modal-footer">
        <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button type="submit" variant="primary"><Icono n="guardar" /> Guardar</Button>
      </div>
    </form>
  );
}
