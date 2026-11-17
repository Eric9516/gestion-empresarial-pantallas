import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { Icono } from '@/components/Icono';

interface Props {
  /** Lo que se copia (por ejemplo, el código o la descripción). */
  texto: string;
  /** Qué es, para el botón: "código", "descripción"… */
  que: string;
  /** Lo que se muestra; si no se pasa, el mismo texto. */
  children?: ReactNode;
}

async function copiarAlPortapapeles(texto: string) {
  try {
    await navigator.clipboard.writeText(texto);
  } catch {
    // Sin permiso o fuera de https (algunos navegadores): se copia a la vieja usanza.
    const area = document.createElement('textarea');
    area.value = texto;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
}

// Un texto con un botón chiquito para copiarlo. El botón casi no se ve: aparece al pasar el mouse por la fila o la tarjeta
// (en el celular queda tenue). No abre la fila al tocarlo, y al copiar muestra una tilde un momento.
export default function Copiable({ texto, que, children }: Props) {
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!copiado) return;
    const t = setTimeout(() => setCopiado(false), 1500);
    return () => clearTimeout(t);
  }, [copiado]);

  async function alCopiar(e: MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    await copiarAlPortapapeles(texto);
    setCopiado(true);
  }

  if (!texto) return <>{children}</>;
  return (
    <span className="copiable">
      {children ?? texto}
      <button type="button" className={`copiar${copiado ? ' copiado' : ''}`} onClick={e => void alCopiar(e)} onKeyDown={e => e.stopPropagation()}
        aria-label={copiado ? `${que} copiado` : `Copiar ${que}`} title={copiado ? 'Copiado' : `Copiar ${que}`}>
        <Icono n={copiado ? 'ok' : 'copiar'} />
      </button>
    </span>
  );
}
