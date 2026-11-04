import { useState } from 'react';
import { useRepuestosParaElegir, type RepuestoDeLista } from '../items/useItems';
import { Input } from '@/components/ui/input';

interface Props {
  id?: string;
  onElegir: (r: RepuestoDeLista) => void;
  placeholder?: string;
}

// Buscar un repuesto del Depósito por código o descripción (la búsqueda la hace la base, como en el resto de la app).
export default function BuscadorRepuesto({ id, onElegir, placeholder = 'Buscá por código o descripción (ej.: YAR 206)' }: Props) {
  const [texto, setTexto] = useState('');
  const resultados = useRepuestosParaElegir(texto.trim().length < 2 ? '' : texto, 8);
  return (
    <div className="mt-buscador-rep">
      <Input id={id} type="text" value={texto} onChange={e => setTexto(e.target.value)} placeholder={placeholder} autoComplete="off" />
      {texto.trim().length >= 2 && (
        <ul className="mt-buscador-rep-lista" role="listbox">
          {resultados.length ? resultados.map(r => (
            <li key={r.id}>
              <button type="button" role="option" aria-selected={false} onClick={() => { onElegir(r); setTexto(''); }}>
                <strong>{r.codigo}</strong> — {r.descripcion}
                <span className="mt-buscador-rep-stock">{r.stock != null ? `stock ${r.stock}` : ''}</span>
              </button>
            </li>
          )) : <li className="mt-buscador-rep-vacio">Sin resultados</li>}
        </ul>
      )}
    </div>
  );
}
