// La librería de Excel (SheetJS, instalada desde vendor/xlsx-0.20.3.tgz: la de npm tiene fallas conocidas sin arreglo) tiene que seguir
// leyendo y escribiendo como la usa la app: mismas llamadas, mismas opciones (ver useImportarStock, useImportarFamilias y exportExcel).
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';

const libro = (filas: unknown[][], nombreHoja = 'Hoja1') => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filas), nombreHoja);
  return wb;
};
// Igual que la app: se lee desde un ArrayBuffer, la primera hoja, filas como arreglos, celdas vacías como ''.
const leer = (buffer: ArrayBuffer | Uint8Array, range: number) => {
  const wb = XLSX.read(buffer, { type: 'array' });
  return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]!]!, { header: 1, range, defval: '' });
};
const comoBuffer = (wb: XLSX.WorkBook, bookType: XLSX.BookType) => XLSX.write(wb, { type: 'array', bookType }) as ArrayBuffer;

describe('Excel (la misma librería y las mismas opciones que usa la app)', () => {
  const filas = [['Código', 'Descripción', 'Stock'], ['AA0100001', 'Rodamiento', 12], ['AB0200002', 'Correa ñandú', '3,5'], ['', '', ''], ['AC0300003', 'Filtro', 0]];

  it('lee un .xlsx saltando la fila de títulos (importar stock)', () => {
    const r = leer(comoBuffer(libro(filas), 'xlsx'), 1);
    expect(r[0]).toEqual(['AA0100001', 'Rodamiento', 12]);
    expect(r[1]).toEqual(['AB0200002', 'Correa ñandú', '3,5']);
    expect(r.at(-1)).toEqual(['AC0300003', 'Filtro', 0]);
  });
  it('lee también el formato viejo .xls', () => {
    const r = leer(comoBuffer(libro(filas), 'biff8'), 1);
    expect(r[0]).toEqual(['AA0100001', 'Rodamiento', 12]);
    expect(r).toHaveLength(4);
  });
  it('saltea las primeras filas de encabezado (importar familias: range 5)', () => {
    const encabezado = Array.from({ length: 5 }, (_, i) => [`título ${i}`, '', '']);
    const r = leer(comoBuffer(libro([...encabezado, ['01', 'Rodamientos', 'AA'], ['02', 'Correas', 'AB']]), 'xlsx'), 5);
    expect(r).toEqual([['01', 'Rodamientos', 'AA'], ['02', 'Correas', 'AB']]);
  });
  it('las celdas vacías llegan como texto vacío (no como undefined)', () => {
    const r = leer(comoBuffer(libro([['a', 'b', 'c'], ['x', '', 'z']]), 'xlsx'), 1);
    expect(r[0]).toEqual(['x', '', 'z']);
  });
  it('exportar: una hoja de objetos se escribe y se vuelve a leer igual (como exportExcel)', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ Proveedor: 'Ñ & Cía', Rubro: 'Repuestos' }, { Proveedor: 'Acme', Rubro: '' }]), 'Proveedores');
    const wb2 = XLSX.read(comoBuffer(wb, 'xlsx'), { type: 'array' });
    expect(wb2.SheetNames).toEqual(['Proveedores']);
    expect(XLSX.utils.sheet_to_json(wb2.Sheets['Proveedores']!)).toEqual([{ Proveedor: 'Ñ & Cía', Rubro: 'Repuestos' }, { Proveedor: 'Acme', Rubro: '' }]);
  });
  it('un archivo con una hoja llamada "__proto__" no contamina los objetos de la página (falla corregida respecto de la versión de npm)', () => {
    const wb = libro([['a'], ['b']], '__proto__');
    leer(comoBuffer(wb, 'xlsx'), 0);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.keys(Object.prototype)).toEqual([]);
  });
  it('un archivo que no es Excel se rechaza o queda vacío, sin colgarse', () => {
    const basura = new TextEncoder().encode('esto no es un excel'.repeat(1000));
    const t0 = Date.now();
    let filasLeidas: unknown[][] = [];
    try { filasLeidas = leer(basura, 0); } catch { /* también es válido que falle */ }
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(Array.isArray(filasLeidas)).toBe(true);
  });
  it('la versión instalada es la corregida (0.20.x o mayor)', () => {
    expect(XLSX.version).toMatch(/^0\.(2\d|[3-9]\d)\./);
  });
});
