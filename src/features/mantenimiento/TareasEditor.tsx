import { useEffect, useId, useRef, useState } from 'react';
import { filaNueva, type FilaTarea } from './tareas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icono } from '@/components/Icono';

interface Props {
  filas: FilaTarea[];
  onChange: (filas: FilaTarea[]) => void;
}

// Lista de tareas para editar (planillas y rutinas): una tarea por fila. Cada tarea se tilda o, si se
// marca "Anotar valor", pide un número con su unidad y su rango normal (avisa si queda fuera).
// Enter en una tarea agrega otra abajo, para cargar rápido.
export default function TareasEditor({ filas, onChange }: Props) {
  const uid = useId();
  const [enfocar, setEnfocar] = useState<string | null>(null);
  const refs = useRef(new Map<string, HTMLInputElement>());

  useEffect(() => {
    if (!enfocar) return;
    refs.current.get(enfocar)?.focus();
  }, [enfocar, filas]);

  function cambiar(id: string, c: Partial<FilaTarea>) {
    onChange(filas.map(f => (f.id === id ? { ...f, ...c } : f)));
  }
  function agregarDespues(i: number) {
    const nueva = filaNueva();
    onChange([...filas.slice(0, i + 1), nueva, ...filas.slice(i + 1)]);
    setEnfocar(nueva.id);
  }
  function mover(i: number, delta: number) {
    const j = i + delta;
    if (j < 0 || j >= filas.length) return;
    const copia = [...filas];
    [copia[i], copia[j]] = [copia[j], copia[i]];
    onChange(copia);
  }

  return (
    <div className="mt-tareas-ed">
      {filas.map((f, i) => (
        <div key={f.id} className="mt-tarea-ed">
          <div className="mt-tarea-ed-fila">
            <span className="mt-orden-num">{i + 1}</span>
            <Input
              ref={el => { if (el) refs.current.set(f.id, el); else refs.current.delete(f.id); }}
              aria-label={`Tarea ${i + 1}`} value={f.texto} placeholder={f.conValor ? 'Ej.: Medir vibración del motor' : 'Ej.: Engrasar rodamientos'}
              onChange={e => cambiar(f.id, { texto: e.target.value })}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregarDespues(i); } }}
            />
            <div className="mt-tarea-ed-botones">
              <Button type="button" variant="ghost" size="icon" title="Subir" aria-label={`Subir tarea ${i + 1}`} disabled={i === 0} onClick={() => mover(i, -1)}><Icono n="arriba" /></Button>
              <Button type="button" variant="ghost" size="icon" title="Bajar" aria-label={`Bajar tarea ${i + 1}`} disabled={i === filas.length - 1} onClick={() => mover(i, 1)}><Icono n="abajo" /></Button>
              <Button type="button" variant="dangerGhost" size="icon" title="Quitar" aria-label={`Quitar tarea ${i + 1}`} onClick={() => onChange(filas.filter(x => x.id !== f.id))}><Icono n="borrar" /></Button>
            </div>
          </div>
          <label className="mt-tarea-ed-check">
            <input type="checkbox" checked={f.conValor} onChange={e => cambiar(f.id, { conValor: e.target.checked })} />
            Anotar un valor (medición)
          </label>
          {f.conValor && (
            <div className="mt-rep-fila">
              <div className="mt-rep-campo" style={{ flex: 1 }}>
                <label htmlFor={`${uid}-u${i}`}>Unidad</label>
                <Input id={`${uid}-u${i}`} value={f.unidad} onChange={e => cambiar(f.id, { unidad: e.target.value })} placeholder="mm/s, °C, bar, A..." />
              </div>
              <div className="mt-rep-campo" style={{ flex: 1 }}>
                <label htmlFor={`${uid}-mi${i}`}>Mínimo normal</label>
                <Input id={`${uid}-mi${i}`} inputMode="decimal" value={f.minimo} onChange={e => cambiar(f.id, { minimo: e.target.value })} placeholder="Opcional" />
              </div>
              <div className="mt-rep-campo" style={{ flex: 1 }}>
                <label htmlFor={`${uid}-ma${i}`}>Máximo normal</label>
                <Input id={`${uid}-ma${i}`} inputMode="decimal" value={f.maximo} onChange={e => cambiar(f.id, { maximo: e.target.value })} placeholder="Opcional" />
              </div>
            </div>
          )}
        </div>
      ))}
      {!filas.length && <div className="mt-vacio" style={{ padding: '6px 0' }}>Sin tareas todavía.</div>}
      <Button type="button" variant="ghost" size="sm" onClick={() => agregarDespues(filas.length - 1)}><Icono n="mas" /> Agregar tarea</Button>
    </div>
  );
}
