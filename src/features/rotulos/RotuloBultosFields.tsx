import { useEffect, useId, useState } from 'react';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import type { ArticuloParaRotulo } from './servicioDeEnvios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Icono } from '@/components/Icono';

interface Props {
  detalles: string[];
  onChange: (detalles: string[]) => void;
  /** Buscar artículos del stock para agregarlos a la descripción (sin esto, solo se escribe a mano). */
  buscarArticulos?: (texto: string) => Promise<ArticuloParaRotulo[]>;
}

/** El renglón que se agrega a la descripción: "2 × Válvula esférica 1/2"" (sin el código: el rótulo lo lee otra empresa). */
function renglonDeArticulo(a: Pick<ArticuloParaRotulo, 'descripcion'>, cantidad: number): string {
  return `${cantidad.toLocaleString('es-AR', { maximumFractionDigits: 3 })} × ${a.descripcion}`;
}

// Un textarea de descripción por bulto — la cantidad la controla el padre (ver "¿Cuántos bultos tiene este envío?" en RotuloForm).
// Debajo de cada uno, "Agregar artículo del stock" (pedido del dueño, 12/11/2026): se busca por código o descripción, se elige la cantidad y
// se agrega un renglón al texto, que sigue siendo libre (se puede corregir o escribir a mano). No toca el stock.
export default function RotuloBultosFields({ detalles, onChange, buscarArticulos }: Props) {
  const [buscandoEn, setBuscandoEn] = useState<number | null>(null);

  function setLinea(i: number, value: string) {
    onChange(detalles.map((d, idx) => (idx === i ? value : d)));
  }

  function agregar(i: number, renglon: string) {
    const actual = detalles[i] ?? '';
    setLinea(i, actual.trim() ? `${actual.replace(/\s+$/, '')}\n${renglon}` : renglon);
    setBuscandoEn(null);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {detalles.map((d, i) => (
        <div className="form-group" style={{ marginBottom: 0 }} key={i}>
          <label htmlFor={`bulto-detalle-${i}`}>{detalles.length > 1 ? `Descripción — Bulto ${i + 1} de ${detalles.length}` : 'Detalle / Descripción'}</label>
          <Textarea
            id={`bulto-detalle-${i}`}
            placeholder="Ej: Motor eléctrico para reparación — N° interno 0452"
            rows={3}
            value={d}
            onChange={e => setLinea(i, e.target.value)}
          />
          {buscarArticulos && (buscandoEn === i
            ? <BuscadorDeArticulos buscar={buscarArticulos} onAgregar={r => agregar(i, r)} onCancelar={() => setBuscandoEn(null)} />
            : (
              <Button type="button" variant="ghost" size="sm" style={{ marginTop: 6 }} onClick={() => setBuscandoEn(i)}
                aria-label={detalles.length > 1 ? `Agregar artículo del stock al bulto ${i + 1}` : 'Agregar artículo del stock'}>
                <Icono n="paquete" /> Agregar artículo del stock
              </Button>
            ))}
        </div>
      ))}
    </div>
  );
}

function BuscadorDeArticulos({ buscar, onAgregar, onCancelar }: { buscar: Props['buscarArticulos'] & {}; onAgregar: (renglon: string) => void; onCancelar: () => void }) {
  const uid = useId();
  const [texto, setTexto] = useState('');
  const demorado = useDebouncedValue(texto.trim(), 250);
  const [resultado, setResultado] = useState<{ para: string; lista: ArticuloParaRotulo[] } | null>(null);
  const [elegido, setElegido] = useState<ArticuloParaRotulo | null>(null);
  const [cantidad, setCantidad] = useState('1');

  useEffect(() => {
    if (!demorado) return;
    let vigente = true;
    buscar(demorado).then(lista => { if (vigente) setResultado({ para: demorado, lista }); }, () => { if (vigente) setResultado({ para: demorado, lista: [] }); });
    return () => { vigente = false; };
  }, [demorado, buscar]);

  const lista = demorado && resultado?.para === demorado ? resultado.lista : [];
  const cargando = !!demorado && resultado?.para !== demorado;
  const n = Number(cantidad.replace(',', '.'));
  const cantidadValida = Number.isFinite(n) && n > 0;

  if (elegido) {
    return (
      <div className="rotulo-articulo">
        <div style={{ fontSize: 13 }}><strong>{elegido.codigo}</strong> — {elegido.descripcion}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 8 }}>
          <div>
            <label htmlFor={`${uid}-c`} style={{ fontSize: 12 }}>Cantidad</label>
            <Input id={`${uid}-c`} inputMode="decimal" value={cantidad} onChange={e => setCantidad(e.target.value)} style={{ width: 110 }} autoFocus
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (cantidadValida) onAgregar(renglonDeArticulo(elegido, n)); } }} />
          </div>
          <Button type="button" variant="primary" size="sm" disabled={!cantidadValida} onClick={() => onAgregar(renglonDeArticulo(elegido, n))}><Icono n="mas" /> Agregar</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setElegido(null)}>Elegir otro</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rotulo-articulo">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Input type="search" value={texto} onChange={e => setTexto(e.target.value)} placeholder="Buscá por código o descripción (ej.: válvula)" aria-label="Buscar artículo del stock" autoFocus style={{ flex: 1 }} />
        <Button type="button" variant="ghost" size="sm" onClick={onCancelar}>Cancelar</Button>
      </div>
      {cargando && <div className="rotulo-articulo-vacio">Buscando...</div>}
      {!cargando && demorado && !lista.length && <div className="rotulo-articulo-vacio">No hay artículos que coincidan. Podés escribirlo a mano arriba.</div>}
      {lista.length > 0 && (
        <ul className="rotulo-articulo-lista" aria-label="Artículos encontrados">
          {lista.map(a => (
            <li key={a.id}>
              <button type="button" onClick={() => { setElegido(a); setCantidad('1'); }}>
                <span><strong>{a.codigo}</strong> — {a.descripcion}</span>
                <span className="rotulo-articulo-dato">Stock: {a.stock != null ? a.stock.toLocaleString('es-AR') : '—'} {a.unidad} · {a.deposito}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
