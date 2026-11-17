import { useState, type ComponentProps } from 'react';
import { Input } from './input';

type Props = Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'type' | 'min' | 'max'> & {
  valor: number;
  onCambio: (n: number) => void;
  min?: number;
  max?: number;
};

// Un campo para escribir una cantidad entera (pedido del dueño, 14/11/2026: en "a retirar" no se podía borrar el 1 para poner 2, porque el
// campo vacío volvía solo a 1). Mientras se escribe se puede dejar vacío; cada número válido se avisa con onCambio (ajustado entre min y max)
// y al salir del campo, si quedó vacío o mal, vuelve a la cantidad que había. Al entrar se selecciona el número, así se escribe encima.
export function CampoDeCantidad({ valor, onCambio, min = 1, max, onFocus, onBlur, ...props }: Props) {
  const [texto, setTexto] = useState(String(valor));
  // si la cantidad cambia desde afuera (por ejemplo, se agrega otra vez el mismo repuesto), el campo la muestra
  const [anterior, setAnterior] = useState(valor);
  if (valor !== anterior) { setAnterior(valor); setTexto(String(valor)); }

  const ajustar = (n: number) => Math.max(min, max == null ? n : Math.min(max, n));
  return (
    <Input {...props} type="number" inputMode="numeric" min={min} max={max} value={texto}
      onFocus={e => { e.currentTarget.select(); onFocus?.(e); }}
      onChange={e => {
        setTexto(e.target.value);
        const n = Math.floor(Number(e.target.value));
        if (e.target.value.trim() !== '' && Number.isFinite(n) && n >= min) { const a = ajustar(n); setAnterior(a); onCambio(a); }
      }}
      onBlur={e => { setTexto(String(valor)); onBlur?.(e); }} />
  );
}
