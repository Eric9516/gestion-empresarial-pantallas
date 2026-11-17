'use client';
import EtiquetasQr from '@/features/mantenimiento/EtiquetasQr';
import { datosDeMantenimiento } from './acciones';

// Configuración → Mantenimiento → Etiquetas QR: los equipos y los sectores salen de la misma lectura que la lista de equipos.
const cargar = async () => {
  const d = await datosDeMantenimiento();
  return { equipos: d.equipos, sectores: d.sectores };
};

export default function EtiquetasQrEnNext() {
  return <EtiquetasQr cargar={cargar} />;
}
