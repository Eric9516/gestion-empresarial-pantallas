import { useId } from 'react';
import { nuevoId } from './almacenDemo';
import { horasDeTecnico, numeroCorto, totalHorasHombre } from './preventivo';
import type { FechaISO, TrabajoTecnico } from './tipos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icono } from '@/components/Icono';

interface Props {
  tecnicos: TrabajoTecnico[];
  onChange: (t: TrabajoTecnico[]) => void;
  personas: string[];
  /** Fecha que se pone a un técnico nuevo. */
  fecha: FechaISO;
}

// Técnicos que trabajaron en la OT: nombre, fecha de término, hora de inicio y de término.
// Las horas hombre de cada uno y el total se calculan solos.
export default function TecnicosEditor({ tecnicos, onChange, personas, fecha }: Props) {
  const uid = useId();
  const total = totalHorasHombre(tecnicos);
  const cambiar = (id: string, c: Partial<TrabajoTecnico>) => onChange(tecnicos.map(t => (t.id === id ? { ...t, ...c } : t)));

  return (
    <div className="mt-repuestos">
      {tecnicos.map((t, i) => {
        const hh = horasDeTecnico(t);
        return (
          <div key={t.id} className="mt-rep">
            <div className="mt-rep-fila">
              <div className="mt-rep-campo" style={{ flex: 2 }}>
                <label htmlFor={`${uid}-n${i}`}>Técnico</label>
                <Input id={`${uid}-n${i}`} list={`${uid}-p`} value={t.nombre} onChange={e => cambiar(t.id, { nombre: e.target.value })} />
              </div>
              <div className="mt-rep-campo" style={{ flex: 1 }}>
                <label htmlFor={`${uid}-f${i}`}>Fecha de término</label>
                <Input id={`${uid}-f${i}`} type="date" value={t.fecha} onChange={e => cambiar(t.id, { fecha: e.target.value })} />
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label={`Quitar técnico ${i + 1}`} onClick={() => onChange(tecnicos.filter(x => x.id !== t.id))} style={{ alignSelf: 'flex-end' }}><Icono n="borrar" /></Button>
            </div>
            <div className="mt-rep-fila" style={{ alignItems: 'flex-end' }}>
              <div className="mt-rep-campo" style={{ flex: 1, minWidth: 110 }}>
                <label htmlFor={`${uid}-i${i}`}>Hora de inicio</label>
                <Input id={`${uid}-i${i}`} type="time" value={t.inicio} onChange={e => cambiar(t.id, { inicio: e.target.value })} />
              </div>
              <div className="mt-rep-campo" style={{ flex: 1, minWidth: 110 }}>
                <label htmlFor={`${uid}-t${i}`}>Hora de término</label>
                <Input id={`${uid}-t${i}`} type="time" value={t.fin} onChange={e => cambiar(t.id, { fin: e.target.value })} />
              </div>
              <div className="mt-hh">{hh != null ? `${numeroCorto(hh)} HH` : '— HH'}</div>
            </div>
          </div>
        );
      })}
      <datalist id={`${uid}-p`}>{personas.map(p => <option key={p} value={p} />)}</datalist>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange([...tecnicos, { id: nuevoId(), nombre: '', fecha, inicio: '', fin: '' }])}><Icono n="mas" /> Agregar técnico</Button>
        {total != null && <strong style={{ fontSize: 13 }}>Total: {numeroCorto(total)} horas hombre</strong>}
      </div>
    </div>
  );
}
