import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';

// Columnas del Excel que exporta el sistema de la empresa: B=stock mínimo (smin),
// C=punto de pedido (pped), S=stock, V=código, W=descripción. Se lee por posición
// de columna (no por nombre de encabezado) porque así lo indicó el dueño y es más
// robusto que el encabezado, que puede variar entre exportaciones. El stock sale
// de la columna "stock" (S) y no de dep_sac (AM): con el reporte de un solo
// depósito valen lo mismo, y S es la que se llama stock.
const COL_STOCK_MINIMO = 1; // B (0-based)
const COL_PUNTO_PEDIDO = 2; // C
const COL_STOCK = 18; // S
const COL_CODIGO = 21; // V
const COL_DESCRIPCION = 22; // W

// La primera letra es un prefijo de rubro que no se usa para nada acá (puede
// ser "M", "P", cualquiera) — solo importan las 2+2 letras de familia/subfamilia
// y los 5 números.
const PATRON_CODIGO = /^[A-Z]([A-Z]{2})([A-Z]{2})(\d{5})$/;
const PAGE_SIZE = 1000;

function leerNumero(valor: unknown): number {
  const n = typeof valor === 'number' ? valor : Number(valor) || 0;
  return n < 0 ? 0 : n;
}

interface FilaBase {
  codigo: string;
  descripcion: string;
  stock: number;
  stock_minimo: number;
  punto_pedido: number;
  familia_id: string;
  subfamilia_id: string;
  numero: string;
}

export interface FilaNueva extends FilaBase { tipo: 'nuevo' }
export interface FilaModificada extends FilaBase {
  tipo: 'modificado';
  descripcionAnterior: string;
  stockAnterior: number | null;
}
export interface FilaNoProcesada {
  codigoOriginal: string;
  descripcion: string;
  motivo: string;
}

export interface AnalisisImportacion {
  nuevos: FilaNueva[];
  modificados: FilaModificada[];
  sinCambiosCount: number;
  noProcesados: FilaNoProcesada[];
  totalFilas: number;
}

async function fetchTodosLosItems() {
  const all: { codigo: string; descripcion: string; stock: number | null; stock_minimo: number; punto_pedido: number }[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from('items').select('codigo,descripcion,stock,stock_minimo,punto_pedido').range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    all.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

export async function analizarExcelStock(file: File): Promise<AnalisisImportacion> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const filas: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 1, defval: '' });

  const [{ data: familias, error: errF }, { data: subfamilias, error: errS }, existentes] = await Promise.all([
    supabase.from('familias').select('id,codigo'),
    supabase.from('subfamilias').select('id,codigo,familia_id'),
    fetchTodosLosItems(),
  ]);
  if (errF) throw errF;
  if (errS) throw errS;

  const parPorCodigo = new Map<string, { familia_id: string; subfamilia_id: string }>();
  for (const s of subfamilias ?? []) {
    const f = (familias ?? []).find(f => f.id === s.familia_id);
    if (f) parPorCodigo.set(f.codigo + s.codigo, { familia_id: f.id, subfamilia_id: s.id });
  }
  const porCodigo = new Map(existentes.map(it => [it.codigo, it]));

  const nuevos: FilaNueva[] = [];
  const modificados: FilaModificada[] = [];
  const noProcesados: FilaNoProcesada[] = [];
  let sinCambiosCount = 0;
  let totalFilas = 0;

  for (const row of filas) {
    const codigo = String(row[COL_CODIGO] ?? '').trim().toUpperCase();
    const descripcion = String(row[COL_DESCRIPCION] ?? '').trim();
    if (!codigo) continue;
    totalFilas++;

    const m = PATRON_CODIGO.exec(codigo);
    if (!m) {
      noProcesados.push({ codigoOriginal: codigo, descripcion, motivo: 'Formato de código no reconocido' });
      continue;
    }
    const [, famCod, subCod, numero] = m;
    const par = parPorCodigo.get(famCod + subCod);
    if (!par) {
      noProcesados.push({ codigoOriginal: codigo, descripcion, motivo: `La familia/subfamilia "${famCod}${subCod}" no existe en el sistema` });
      continue;
    }

    const stock = leerNumero(row[COL_STOCK]);
    const stock_minimo = leerNumero(row[COL_STOCK_MINIMO]);
    const punto_pedido = leerNumero(row[COL_PUNTO_PEDIDO]);

    const existente = porCodigo.get(codigo);
    if (!existente) {
      nuevos.push({ tipo: 'nuevo', codigo, descripcion, stock, stock_minimo, punto_pedido, familia_id: par.familia_id, subfamilia_id: par.subfamilia_id, numero });
      continue;
    }

    const cambioStock = (existente.stock ?? 0) !== stock;
    const cambioDescripcion = existente.descripcion !== descripcion;
    const cambioReposicion = existente.stock_minimo !== stock_minimo || existente.punto_pedido !== punto_pedido;
    if (cambioStock || cambioDescripcion || cambioReposicion) {
      modificados.push({
        tipo: 'modificado', codigo, descripcion, stock, stock_minimo, punto_pedido, familia_id: par.familia_id, subfamilia_id: par.subfamilia_id, numero,
        descripcionAnterior: existente.descripcion, stockAnterior: existente.stock,
      });
    } else {
      sinCambiosCount++;
    }
  }

  return { nuevos, modificados, sinCambiosCount, noProcesados, totalFilas };
}

export function useAplicarImportacionStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (filas: (FilaNueva | FilaModificada)[]) => {
      if (!filas.length) return;
      const payload = filas.map(f => ({
        codigo: f.codigo,
        descripcion: f.descripcion,
        familia_id: f.familia_id,
        subfamilia_id: f.subfamilia_id,
        numero: f.numero,
        stock: f.stock,
        stock_minimo: f.stock_minimo,
        punto_pedido: f.punto_pedido,
      }));
      const CHUNK = 500;
      for (let i = 0; i < payload.length; i += CHUNK) {
        const { error } = await supabase.from('items').upsert(payload.slice(i, i + CHUNK), { onConflict: 'codigo' });
        if (error) throw error;
      }
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['items'] }); },
  });
}
