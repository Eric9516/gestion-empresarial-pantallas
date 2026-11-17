import { redirect } from 'next/navigation';

// El Excel de Mantenimiento pasó a Configuración → Mantenimiento (pedido del dueño, 12/11/2026): la dirección vieja lleva ahí.
export default function Excel() {
  redirect('/configuracion?grupo=mantenimiento');
}
