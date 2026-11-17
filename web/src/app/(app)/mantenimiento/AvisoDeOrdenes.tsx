'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icono } from '@/components/Icono';
import type { RolMantenimiento } from '@/features/mantenimiento/tipos';
import type { DatosDelMenu } from './secciones';

// El aviso verde de arriba (del socio, 10/11/2026): lo que la persona tiene que hacer con las OT (derivar, asignar, revisar, aprobar o las
// asignadas a ella). Lleva a Órdenes de trabajo; ahí no se muestra.
export default function AvisoDeOrdenes({ pendientes: p, rol }: { pendientes: DatosDelMenu['pendientes']; rol: RolMantenimiento }) {
  const ruta = usePathname();
  if (ruta.startsWith('/mantenimiento/ordenes') || !(p.paraMandar || p.paraRevisar || p.asignadas)) return null;
  const partes = [
    p.paraMandar > 0 && (rol === 'jefe' ? `${p.paraMandar} OT para asignar` : `${p.paraMandar} OT para derivar al jefe de taller`),
    p.paraRevisar > 0 && (rol === 'jefe' ? `${p.paraRevisar} para revisar` : `${p.paraRevisar} para aprobar`),
    p.asignadas > 0 && `${p.asignadas} OT asignadas a vos`,
  ].filter(Boolean);
  return (
    <Link href="/mantenimiento/ordenes" className="mt-aviso verde">
      <Icono n="lista" />
      <span style={{ flex: 1 }}>{partes.join(' · ')}</span>
      <span style={{ fontSize: 13, textDecoration: 'underline' }}>Ver</span>
    </Link>
  );
}
