// Una fila de Excel: pares columna→valor, en el orden en que se declaran.
export type FilaExcel = Record<string, string | number>;

// Genera y descarga un .xlsx de una sola hoja — usado por Proveedores,
// Comisionistas y el historial de Retiros, que antes repetían este mismo
// armado de libro/hoja/columnas cada uno por su cuenta. La librería de Excel
// es pesada, así que se descarga recién la primera vez que se exporta algo.
export async function exportarExcel(filas: FilaExcel[], hoja: string, nombreArchivo: string) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(filas);
  ws['!cols'] = Object.keys(filas[0]).map(() => ({ wch: 20 }));
  XLSX.utils.book_append_sheet(wb, ws, hoja);
  XLSX.writeFile(wb, nombreArchivo);
}
