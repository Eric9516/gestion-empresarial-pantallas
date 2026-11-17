import Link from 'next/link';
import { Icono } from '@/components/Icono';
import { botonVariantes } from '@/components/ui/botonVariantes';

export default function NoEncontrada() {
  return (
    <main className="empty-state seccion-pendiente">
      <div className="empty-icon"><Icono n="buscar" /></div>
      <h2>No existe esta página</h2>
      <p>Puede que la dirección esté mal escrita o que la sección no esté disponible para vos.</p>
      <p><Link href="/" className={botonVariantes({ variant: 'ghost' })}>Ir al inicio</Link></p>
    </main>
  );
}
