import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// Tooltip mínimo: hover en escritorio, tap para abrir/cerrar en mobile (donde
// no hay hover). Se renderiza con un portal a <body> y se posiciona con las
// coordenadas reales del disparador — si no, el navegador lo recorta o lo
// tapa apenas vive dentro de un contenedor con overflow:hidden (como
// .table-wrap, que lo necesita para las esquinas redondeadas de la tabla).
export default function Tooltip({ text, children }: { text: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ bottom: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const idGlobo = useId();

  function show() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({ bottom: window.innerHeight - rect.top + 6, left: rect.left + rect.width / 2 });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (triggerRef.current && !triggerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [open]);

  return (
    <span
      ref={triggerRef}
      className="tooltip-wrap"
      tabIndex={0}
      aria-describedby={open ? idGlobo : undefined}
      onClick={e => { e.stopPropagation(); if (open) setOpen(false); else show(); }}
      onMouseEnter={show}
      onMouseLeave={() => setOpen(false)}
      onFocus={show}
      onBlur={() => setOpen(false)}
      onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}
    >
      {children}
      {open && pos && createPortal(
        <span id={idGlobo} className="tooltip-bubble" role="tooltip" style={{ bottom: pos.bottom, left: pos.left }}>{text}</span>,
        document.body
      )}
    </span>
  );
}
