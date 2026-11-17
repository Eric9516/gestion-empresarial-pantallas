import { redirect } from 'next/navigation';
import { INICIO_MANTENIMIENTO } from './secciones';

// /mantenimiento a secas lleva a su primera sección (ver next.config.ts: los navegadores recuerdan que antes llevaba al Depósito).
export default function Mantenimiento() {
  redirect(INICIO_MANTENIMIENTO);
}
