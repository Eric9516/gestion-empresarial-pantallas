import { useState } from 'react';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { usePedido } from '../../lib/usePedido';
import { useMantenimiento } from './servicio';
import type { RepuestoParaElegir } from './tipos';
import { Input } from '@/components/ui/input';

// Buscar un repuesto del Depósito por código, descripción o palabras clave (la búsqueda la hace la base, como en el resto de la app).
export default function BuscadorRepuesto({ id, onElegir, placeholder = 'Buscá por código o descripción (ej.: YAR 206)' }: { id?: string; onElegir: (r: RepuestoParaElegir) => void; placeholder?: string }) {
  const s = useMantenimiento();
  const [texto, setTexto] = useState('');
  const demorado = useDebouncedValue(texto.trim(), 200);
  const resultados = usePedido(demorado.length >= 2 ? `repuestos|${demorado}` : null, () => s.buscarRepuestos(demorado), true);
  return (
    <div className="mt-buscador-rep">
      <Input id={id} type="text" value={texto} onChange={e => setTexto(e.target.value)} placeholder={placeholder} autoComplete="off" />
      {texto.trim().length >= 2 && (
        <ul className="mt-buscador-rep-lista" role="listbox" aria-label="Repuestos encontrados">
          {resultados.data?.length ? resultados.data.map(r => (
            <li key={r.id}>
              <button type="button" role="option" aria-selected={false} onClick={() => { onElegir(r); setTexto(''); }}>
                <strong>{r.codigo}</strong> — {r.descripcion}
                <span className="mt-buscador-rep-stock">{[r.deposito, r.stock != null && `stock ${r.stock}`].filter(Boolean).join(' · ')}</span>
              </button>
            </li>
          )) : <li className="mt-buscador-rep-vacio">{resultados.cargando ? 'Buscando...' : 'Sin resultados'}</li>}
        </ul>
      )}
    </div>
  );
}
