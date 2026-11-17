import { useId } from 'react';
import { formatearFechaSola } from '../../lib/fechaHoy';
import { horasDeTecnico, numeroCorto, totalHorasHombre } from './preventivo';
import { useMantenimiento } from './servicio';
import type { FechaISO, TrabajoTecnico } from './tipos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Icono } from '@/components/Icono';

interface Props {
  tecnicos: TrabajoTecnico[];
  onChange: (t: TrabajoTecnico[]) => void;
  /** Fecha que se pone a un técnico nuevo. */
  fecha: FechaISO;
}

// Técnicos que trabajaron en la OT (del diseño del socio): cada uno se elige de los técnicos de Mantenimiento, con su fecha de término y
// su hora de inicio y de término. Las horas hombre de cada uno y el total se calculan solos.
export default function TecnicosEditor({ tecnicos, onChange, fecha }: Props) {
  const uid = useId();
  const s = useMantenimiento();
  const total = totalHorasHombre(tecnicos);
  const cambiar = (i: number, c: Partial<TrabajoTecnico>) => onChange(tecnicos.map((t, j) => (j === i ? { ...t, ...c } : t)));
  const libres = s.tecnicos.filter(t => !tecnicos.some(x => x.usuarioId === t.id));

  return (
    <div className="mt-repuestos">
      {tecnicos.map((t, i) => {
        const hh = horasDeTecnico(t);
        return (
          <div key={`${t.usuarioId}-${i}`} className="mt-rep">
            <div className="mt-rep-fila">
              <div className="mt-rep-campo" style={{ flex: 2 }}>
                <label htmlFor={`${uid}-n${i}`}>Técnico</label>
                <Select id={`${uid}-n${i}`} value={t.usuarioId ?? ''} onChange={e => cambiar(i, { usuarioId: e.target.value, nombre: s.tecnicos.find(x => x.id === e.target.value)?.nombre ?? '' })}>
                  {!t.usuarioId && <option value="">Elegí el técnico</option>}
                  {[...(t.usuarioId && !s.tecnicos.some(x => x.id === t.usuarioId) ? [{ id: t.usuarioId, nombre: t.nombre }] : []), ...s.tecnicos]
                    .filter(x => x.id === t.usuarioId || !tecnicos.some(y => y.usuarioId === x.id))
                    .map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                </Select>
              </div>
              <div className="mt-rep-campo" style={{ flex: 1 }}>
                <label htmlFor={`${uid}-f${i}`}>Fecha de término</label>
                <Input id={`${uid}-f${i}`} type="date" value={t.fecha} onChange={e => cambiar(i, { fecha: e.target.value })} />
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label={`Quitar el técnico ${i + 1}`} onClick={() => onChange(tecnicos.filter((_, j) => j !== i))} style={{ alignSelf: 'flex-end' }}><Icono n="borrar" /></Button>
            </div>
            <div className="mt-rep-fila" style={{ alignItems: 'flex-end' }}>
              <div className="mt-rep-campo" style={{ flex: 1, minWidth: 110 }}>
                <label htmlFor={`${uid}-i${i}`}>Hora de inicio</label>
                <Input id={`${uid}-i${i}`} type="time" value={t.inicio} onChange={e => cambiar(i, { inicio: e.target.value })} />
              </div>
              <div className="mt-rep-campo" style={{ flex: 1, minWidth: 110 }}>
                <label htmlFor={`${uid}-t${i}`}>Hora de término</label>
                <Input id={`${uid}-t${i}`} type="time" value={t.fin} onChange={e => cambiar(i, { fin: e.target.value })} />
              </div>
              <div className="mt-hh">{hh != null ? `${numeroCorto(hh)} HH` : '— HH'}</div>
            </div>
          </div>
        );
      })}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {libres.length > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange([...tecnicos, { usuarioId: libres[0].id, nombre: libres[0].nombre, fecha, inicio: '', fin: '' }])}>
            <Icono n="mas" /> Agregar técnico
          </Button>
        )}
        {!s.tecnicos.length && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Todavía no hay técnicos: un dueño les da el rol en Configuración → Usuarios.</span>}
        {total != null && <strong style={{ fontSize: 13 }}>Total: {numeroCorto(total)} horas hombre</strong>}
      </div>
    </div>
  );
}

/** Los técnicos de una OT terminada o de un registro del historial, con su horario y sus horas hombre. */
export function DetalleTecnicos({ tecnicos }: { tecnicos: Pick<TrabajoTecnico, 'nombre' | 'fecha' | 'inicio' | 'fin'>[] }) {
  if (!tecnicos.some(t => t.inicio || t.fin || t.fecha)) return null;
  const total = totalHorasHombre(tecnicos);
  return (
    <div>
      <h4>Técnicos</h4>
      <table className="mt-tabla-chica">
        <thead><tr><th>Técnico</th><th>Fecha</th><th>Inicio</th><th>Término</th><th>HH</th></tr></thead>
        <tbody>
          {tecnicos.map((t, i) => {
            const hh = horasDeTecnico(t);
            return <tr key={i}><td>{t.nombre}</td><td>{t.fecha ? formatearFechaSola(t.fecha) : '—'}</td><td>{t.inicio || '—'}</td><td>{t.fin || '—'}</td><td>{hh != null ? numeroCorto(hh) : '—'}</td></tr>;
          })}
        </tbody>
      </table>
      {total != null && tecnicos.length > 1 && <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4 }}>Total: {numeroCorto(total)} horas hombre</div>}
    </div>
  );
}
