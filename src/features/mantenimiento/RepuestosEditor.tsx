import { useId, useMemo, useState } from 'react';
import { cantidadDeLinea, lineaNueva, type ModoRepuestos } from './repuestos';
import { useStockRepuestos } from './useStockRepuestos';
import BuscadorRepuesto from './BuscadorRepuesto';
import { leerMonto } from './costos';
import type { RepuestoLinea } from './tipos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icono } from '@/components/Icono';

// Lista de repuestos de una OT, rutina o registro del historial: en qué componente va, qué repuesto
// (del Depósito o escrito a mano) y cuántos. Muestra al lado si hay stock.
// En modo "cierre" se anota cuánto se usó de verdad (0 = no se cambió): es lo que se descuenta del stock.

interface Props {
  lineas: RepuestoLinea[];
  onChange: (lineas: RepuestoLinea[]) => void;
  /** Sugerencias para "Componente" (sub-equipos y partes ya usadas). */
  componentes: string[];
  modo?: ModoRepuestos;
  /** Pedir también el precio por unidad (al terminar una OT o registrar un mantenimiento: suma a los costos del equipo). */
  conPrecio?: boolean;
}

function aNumero(txt: string): number {
  const n = Number(txt.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export default function RepuestosEditor({ lineas, onChange, componentes, modo = 'previsto', conPrecio = false }: Props) {
  const uid = useId();
  // El stock se pide también para los códigos que todavía no se guardaron.
  const codigos = useMemo(() => lineas.map(l => l.codigo).filter(Boolean), [lineas]);
  const { stockDeLinea } = useStockRepuestos(codigos);
  // Renglones que se están escribiendo a mano (código y descripción libres).
  const [aMano, setAMano] = useState<Set<string>>(() => new Set());
  // Lo que se va escribiendo en cada precio (para no borrar la coma o el punto mientras se escribe).
  const [precios, setPrecios] = useState<Record<string, string>>({});
  // Si el mismo repuesto está en varios renglones, el stock tiene que alcanzar para todos juntos.
  const totalPorCodigo = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lineas) {
      const k = l.codigo.trim().toLowerCase();
      if (k) m.set(k, (m.get(k) ?? 0) + cantidadDeLinea(l, modo));
    }
    return m;
  }, [lineas, modo]);

  function cambiar(id: string, cambios: Partial<RepuestoLinea>) {
    onChange(lineas.map(l => (l.id === id ? { ...l, ...cambios } : l)));
  }
  function quitar(id: string) {
    onChange(lineas.filter(l => l.id !== id));
  }
  function ponerAMano(id: string, si: boolean) {
    setAMano(prev => {
      const s = new Set(prev);
      if (si) s.add(id); else s.delete(id);
      return s;
    });
  }

  return (
    <div className="mt-repuestos">
      {lineas.length === 0 && <div className="mt-vacio" style={{ padding: '6px 0' }}>Sin repuestos.</div>}
      {lineas.map((l, i) => {
        const manual = aMano.has(l.id);
        const necesita = totalPorCodigo.get(l.codigo.trim().toLowerCase()) ?? 0;
        const s = stockDeLinea({ codigo: l.codigo, cantidad: necesita });
        const cant = cantidadDeLinea(l, modo);
        return (
          <div key={l.id} className="mt-rep">
            <div className="mt-rep-fila">
              <div className="mt-rep-campo" style={{ flex: 2 }}>
                <label htmlFor={`${uid}-c${i}`}>Componente</label>
                <Input id={`${uid}-c${i}`} list={`${uid}-comp`} value={l.componente} onChange={e => cambiar(l.id, { componente: e.target.value })} placeholder="Ej.: Motor lado acople" />
              </div>
              <div className="mt-rep-campo" style={{ flex: 1, minWidth: 90 }}>
                <label htmlFor={`${uid}-q${i}`}>{modo === 'cierre' ? 'Se usaron' : 'Cantidad'}</label>
                <Input
                  id={`${uid}-q${i}`} type="number" min={0} step="any" inputMode="decimal"
                  value={modo === 'cierre' ? String(l.usado ?? '') : String(l.cantidad)}
                  onChange={e => cambiar(l.id, modo === 'cierre' ? { usado: aNumero(e.target.value) } : { cantidad: aNumero(e.target.value) })}
                />
              </div>
              {conPrecio && (
                <div className="mt-rep-campo" style={{ flex: 1, minWidth: 110 }}>
                  <label htmlFor={`${uid}-p${i}`}>Precio x unidad $</label>
                  <Input
                    id={`${uid}-p${i}`} inputMode="decimal" placeholder="Opcional"
                    value={precios[l.id] ?? (l.precio != null ? String(l.precio).replace('.', ',') : '')}
                    onChange={e => {
                      const txt = e.target.value;
                      setPrecios(p => ({ ...p, [l.id]: txt }));
                      cambiar(l.id, { precio: leerMonto(txt) });
                    }}
                  />
                </div>
              )}
              <Button type="button" variant="ghost" size="icon" aria-label="Quitar repuesto" onClick={() => quitar(l.id)} style={{ alignSelf: 'flex-end' }}><Icono n="borrar" /></Button>
            </div>
            {!manual && l.codigo ? (
              <div className="mt-rep-campo">
                <span className="mt-rep-elegido"><strong>{l.codigo}</strong>{l.descripcion && <span>— {l.descripcion}</span>}</span>
                <span style={{ display: 'flex', gap: 12 }}>
                  <button type="button" className="mt-link" onClick={() => cambiar(l.id, { codigo: '', descripcion: '' })}>Cambiar repuesto</button>
                  <button type="button" className="mt-link" onClick={() => ponerAMano(l.id, true)}>Corregir a mano</button>
                </span>
              </div>
            ) : !manual ? (
              <div className="mt-rep-campo">
                <label htmlFor={`${uid}-r${i}`}>Repuesto del Depósito</label>
                <BuscadorRepuesto id={`${uid}-r${i}`} onElegir={r => cambiar(l.id, { codigo: r.codigo, descripcion: r.descripcion })} />
                <button type="button" className="mt-link" onClick={() => ponerAMano(l.id, true)}>No está en el Depósito: escribirlo a mano</button>
              </div>
            ) : (
              <div className="mt-rep-fila">
                <div className="mt-rep-campo" style={{ flex: 1 }}>
                  <label htmlFor={`${uid}-k${i}`}>Código</label>
                  <Input id={`${uid}-k${i}`} value={l.codigo} onChange={e => cambiar(l.id, { codigo: e.target.value })} />
                </div>
                <div className="mt-rep-campo" style={{ flex: 2 }}>
                  <label htmlFor={`${uid}-d${i}`}>Descripción</label>
                  <Input id={`${uid}-d${i}`} value={l.descripcion} onChange={e => cambiar(l.id, { descripcion: e.target.value })} placeholder="Ej.: Rodamiento YAR 206" />
                </div>
              </div>
            )}
            {manual && <button type="button" className="mt-link" onClick={() => ponerAMano(l.id, false)}>Buscarlo en el Depósito</button>}
            <div className="mt-rep-info">
              {modo === 'cierre' && <span>Previsto: {l.cantidad}{l.usado === 0 ? ' · no se cambió, no se descuenta' : ''}</span>}
              {l.codigo.trim() && cant > 0 && (
                !s.enDeposito
                  ? <span className="mt-rep-stock">No está en el Depósito: no se descuenta stock</span>
                  : s.falta
                    ? <span className="mt-rep-stock falta"><Icono n="alerta" /> Falta: hay {s.stock} en el Depósito y hacen falta {necesita}</span>
                    : <span className="mt-rep-stock ok"><Icono n="ok" /> Hay {s.stock} en el Depósito{s.ubicacion ? ` (${s.ubicacion})` : ''}</span>
              )}
            </div>
          </div>
        );
      })}
      <datalist id={`${uid}-comp`}>{componentes.map(c => <option key={c} value={c} />)}</datalist>
      <Button type="button" variant="ghost" size="sm" onClick={() => onChange([...lineas, lineaNueva(modo)])}><Icono n="mas" /> Agregar repuesto</Button>
    </div>
  );
}
