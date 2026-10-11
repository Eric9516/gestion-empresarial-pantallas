import { generarTablaPdf, type ColumnaPdf } from './tablaPdf';

export interface LineaPedido {
  codigo: string;
  descripcion: string;
  cantidad: string;
}

export interface PedidoPdfInput {
  empresa: string;
  logo: string;
  fecha: string; // yyyy-mm-dd
  para: string;
  nota: string;
  incluirCodigo: boolean;
  lineas: LineaPedido[];
}

// Lista de artículos para pasarle a un proveedor. Todo lo que se ve sale de lo
// que se editó en pantalla (nada de esto vuelve a los repuestos del sistema).
export function generarPedidoBlob(input: PedidoPdfInput): Promise<Blob> {
  const columnas: ColumnaPdf[] = [
    ...(input.incluirCodigo ? [{ header: 'CÓDIGO', ancho: 32 }] : []),
    { header: 'DESCRIPCIÓN' },
    { header: 'CANTIDAD', ancho: 24, align: 'right' as const },
  ];
  return generarTablaPdf({
    empresa: input.empresa,
    logo: input.logo,
    titulo: 'Solicitud de presupuesto',
    fecha: input.fecha,
    datos: [{ etiqueta: 'Para', texto: input.para }],
    nota: input.nota,
    columnas,
    secciones: [{
      filas: input.lineas.map(l => [...(input.incluirCodigo ? [l.codigo] : []), l.descripcion, l.cantidad]),
    }],
  });
}
