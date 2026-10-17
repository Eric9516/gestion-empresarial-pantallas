import { useEffect, useState } from 'react';
import { Icono } from '@/components/Icono';

// Aparece abajo a la derecha cuando se bajó bastante y vuelve arriba de todo. Escucha el desplazamiento sin cargar a la pantalla: el aviso es
// "pasivo" (no frena el scroll), se revisa como mucho una vez por cuadro y solo se vuelve a dibujar cuando el botón tiene que aparecer o desaparecer.
const BAJADA_MINIMA = 500;

export default function BotonSubir() {
  const [visible, setVisible] = useState(() => typeof window !== 'undefined' && window.scrollY > BAJADA_MINIMA);

  useEffect(() => {
    let pendiente = false;
    const revisar = () => { pendiente = false; setVisible(window.scrollY > BAJADA_MINIMA); };
    const alDesplazar = () => { if (!pendiente) { pendiente = true; requestAnimationFrame(revisar); } };
    window.addEventListener('scroll', alDesplazar, { passive: true });
    return () => window.removeEventListener('scroll', alDesplazar);
  }, []);

  if (!visible) return null;
  const sinAnimacion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return (
    <button type="button" className="boton-subir" aria-label="Volver arriba" title="Volver arriba" onClick={() => window.scrollTo({ top: 0, behavior: sinAnimacion ? 'auto' : 'smooth' })}>
      <Icono n="arriba" />
    </button>
  );
}
