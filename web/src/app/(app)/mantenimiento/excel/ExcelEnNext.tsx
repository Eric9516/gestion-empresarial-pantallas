'use client';
import PantallaDeExcel from '@/features/mantenimiento/PantallaDeExcel';
import { analizarImportacion, exportarMantenimiento, importarMantenimiento } from '../acciones';

export default function ExcelEnNext() {
  return <PantallaDeExcel exportar={exportarMantenimiento} analizar={analizarImportacion} importar={importarMantenimiento} />;
}
