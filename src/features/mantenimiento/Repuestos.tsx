import { useId, useMemo, useState } from 'react';
import BuscadorRepuesto from './BuscadorRepuesto';
import { leerMonto } from './costos';
import { lineaNueva, type ModoRepuestos } from './lineasDeRepuestos';
import type { RepuestoLinea } from './tipos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icono } from '@/components/Icono';

// Los repuestos de una OT o una rutina (del diseño del socio: RepuestosEditor y ListaRepuestos): en qué componente van, qué repuesto
// (del Depósito, o escrito a mano: ese no descuenta stock) y cuántos, con el stock del Depósito al lado.
// En modo "cierre" se anota cuánto se usó de verdad (0 = no se cambió): es lo que se descuenta del stock.

const cantidadDe = (l: RepuestoLinea, modo: ModoRepuestos) => (modo === 'cierre' ? (l.usado ?? l.cantidad) : l.cantidad);

interface PropsEditor {
  lineas: RepuestoLinea[];
  onChange: (lineas: RepuestoLinea[]) => void;
  /** Sugerencias para "Componente" (sub-equipos del equipo). */
  componentes: string[];
  modo?: ModoRepuestos;
  /** Pedir también el precio por unidad (al terminar una OT: suma a los costos del equipo). */
  conPrecio?: boolean;
}

function aNumero(txt: string): number {
  const n = Number(txt.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function RepuestosEditor({ lineas, onChange, componentes, modo = 'previsto', conPrecio = false }: PropsEditor) {
  const uid = useId();
  // lo que se va escribiendo en cada precio (para no borrar la coma o el punto mientras se escribe)
  const [precios, setPrecios] = useState<Record<string, string>>({});
  // renglones que se están escribiendo a mano (código y descripción libres: no descuentan stock)
  const [aMano, setAMano] = useState<Set<string>>(() => new Set(lineas.filter(l => !l.itemId && (l.codigo || l.descripcion)).map(l => l.id)));
  // si el mismo repuesto está en varios renglones, el stock tiene que alcanzar para todos juntos
  const totalPorItem = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lineas) if (l.itemId) m.set(l.itemId, (m.get(l.itemId) ?? 0) + cantidadDe(l, modo));
    return m;
  }, [lineas, modo]);

  const cambiar = (id: string, cambios: Partial<RepuestoLinea>) => onChange(lineas.map(l => (l.id === id ? { ...l, ...cambios } : l)));
  const ponerAMano = (id: string, si: boolean) => setAMano(prev => {
    const n = new Set(prev);
    if (si) n.add(id); else n.delete(id);
    return n;
  });

  return (
    <div className="mt-repuestos">
      {lineas.length === 0 && <div className="mt-vacio" style={{ padding: '6px 0' }}>Sin repuestos.</div>}
      {lineas.map((l, i) => {
        const manual = aMano.has(l.id);
        const necesita = l.itemId ? totalPorItem.get(l.itemId) ?? 0 : 0;
        const cant = cantidadDe(l, modo);
        return (
          <div key={l.id} className="mt-rep">
            <div className="mt-rep-fila">
              <div className="mt-rep-campo" style={{ flex: 2 }}>
                <label htmlFor={`${uid}-c${i}`}>Componente</label>
                <Input id={`${uid}-c${i}`} list={`${uid}-comp`} value={l.componente} onChange={e => cambiar(l.id, { componente: e.target.value })} placeholder="Ej.: Motor lado acople" maxLength={160} />
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
                    onChange={e => { const txt = e.target.value; setPrecios(p => ({ ...p, [l.id]: txt })); cambiar(l.id, { precio: leerMonto(txt) }); }}
                  />
                </div>
              )}
              <Button type="button" variant="ghost" size="icon" aria-label={`Quitar el repuesto ${i + 1}`} onClick={() => onChange(lineas.filter(x => x.id !== l.id))} style={{ alignSelf: 'flex-end' }}><Icono n="borrar" /></Button>
            </div>
            {!manual && l.itemId ? (
              <div className="mt-rep-campo">
                <span className="mt-rep-elegido"><strong>{l.codigo}</strong>{l.descripcion && <span>— {l.descripcion}</span>}</span>
                <button type="button" className="mt-link" onClick={() => cambiar(l.id, { itemId: null, codigo: '', descripcion: '', stock: null })}>Cambiar repuesto</button>
              </div>
            ) : !manual ? (
              <div className="mt-rep-campo">
                <label htmlFor={`${uid}-r${i}`}>Repuesto del Depósito</label>
                <BuscadorRepuesto id={`${uid}-r${i}`} onElegir={r => cambiar(l.id, { itemId: r.id, codigo: r.codigo, descripcion: r.descripcion, stock: r.stock })} />
                <button type="button" className="mt-link" onClick={() => ponerAMano(l.id, true)}>No está en el Depósito: escribirlo a mano</button>
              </div>
            ) : (
              <div className="mt-rep-fila">
                <div className="mt-rep-campo" style={{ flex: 1 }}>
                  <label htmlFor={`${uid}-k${i}`}>Código</label>
                  <Input id={`${uid}-k${i}`} value={l.codigo} onChange={e => cambiar(l.id, { codigo: e.target.value })} maxLength={60} />
                </div>
                <div className="mt-rep-campo" style={{ flex: 2 }}>
                  <label htmlFor={`${uid}-d${i}`}>Descripción</label>
                  <Input id={`${uid}-d${i}`} value={l.descripcion} onChange={e => cambiar(l.id, { descripcion: e.target.value })} placeholder="Ej.: Manguera de 1/2" maxLength={300} />
                </div>
              </div>
            )}
            {manual && <button type="button" className="mt-link" onClick={() => { ponerAMano(l.id, false); cambiar(l.id, { codigo: '', descripcion: '' }); }}>Buscarlo en el Depósito</button>}
            <div className="mt-rep-info">
              {modo === 'cierre' && l.cantidad > 0 && <span>Previsto: {l.cantidad}{l.usado === 0 ? ' · no se cambió, no se descuenta' : ''}</span>}
              {cant > 0 && (manual || (!l.itemId && l.codigo)
                ? <span className="mt-rep-stock">Escrito a mano: no se descuenta stock</span>
                : l.itemId && l.stock != null && (l.stock < necesita
                  ? <span className="mt-rep-stock falta"><Icono n="alerta" /> Falta: hay {l.stock} en el Depósito y hacen falta {necesita}</span>
                  : <span className="mt-rep-stock ok"><Icono n="ok" /> Hay {l.stock} en el Depósito{l.ubicacion ? ` (${l.ubicacion})` : ''}</span>))}
            </div>
          </div>
        );
      })}
      <datalist id={`${uid}-comp`}>{componentes.map(c => <option key={c} value={c} />)}</datalist>
      <Button type="button" variant="ghost" size="sm" onClick={() => onChange([...lineas, lineaNueva(modo)])}><Icono n="mas" /> Agregar repuesto</Button>
    </div>
  );
}

/** Lista corta (solo lectura) de repuestos con su componente. Abierta: el stock al lado. Terminada: lo usado y lo que faltó descontar. */
export function ListaRepuestos({ lineas, modo }: { lineas: RepuestoLinea[]; modo: 'previsto' | 'usado' }) {
  if (!lineas.length) return null;
  const total = new Map<string, number>();
  for (const l of lineas) if (l.itemId) total.set(l.itemId, (total.get(l.itemId) ?? 0) + l.cantidad);
  return (
    <ul className="mt-lineas-rep">
      {lineas.map(l => {
        const cantidad = modo === 'usado' && l.usado != null ? l.usado : l.cantidad;
        const falta = modo === 'previsto' && l.itemId && l.stock != null && (total.get(l.itemId) ?? 0) > l.stock;
        return (
          <li key={l.id}>
            {l.componente && <span className="comp">{l.componente}:</span>}
            <span>{cantidad} ×</span>
            {l.codigo && <span className="cod">{l.codigo}</span>}
            {l.descripcion && <span>{l.descripcion}</span>}
            {modo === 'usado' && l.usado != null && l.usado !== l.cantidad && l.cantidad > 0 && (
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{l.usado === 0 ? '(no se cambió)' : `(previstos ${l.cantidad})`}</span>
            )}
            {modo === 'usado' && (l.faltante ?? 0) > 0 && <span className="mt-tag falta"><Icono n="alerta" /> Faltó descontar {l.faltante}</span>}
            {modo === 'previsto' && l.itemId && l.stock != null && (falta
              ? <span className="mt-tag falta"><Icono n="alerta" /> Falta: hay {l.stock}</span>
              : <span className="mt-rep-stock ok" style={{ fontSize: 12 }}>hay {l.stock}</span>)}
            {!l.itemId && l.codigo && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>(escrito a mano)</span>}
          </li>
        );
      })}
    </ul>
  );
}
