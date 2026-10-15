import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import type { Database } from '../../lib/database.types';
import type { Item } from '../items/useItems';
import type { Proveedor } from '../proveedores/useProveedores';

export type Reparacion = Database['public']['Tables']['reparaciones']['Row'];
export type ReparacionItem = Database['public']['Tables']['reparacion_items']['Row'];
export type ReparacionEntrega = Database['public']['Tables']['reparacion_entregas']['Row'];

export type ReparacionItemConDetalle = ReparacionItem & {
  items: Pick<Item, 'id' | 'codigo' | 'descripcion'> | null;
  reparacion_entregas: ReparacionEntrega[];
};

export type ReparacionConDetalle = Reparacion & {
  proveedores: Pick<Proveedor, 'id' | 'nombre'> | null;
  rotulos_generados: { numero_documento: string | null } | null;
  reparacion_items: ReparacionItemConDetalle[];
};

const QUERY_KEY = ['reparaciones'] as const;
const SELECT = '*, proveedores(id,nombre), rotulos_generados(numero_documento), reparacion_items(*, items(id,codigo,descripcion), reparacion_entregas(*))';

export function cantidadDevuelta(linea: Pick<ReparacionItemConDetalle, 'reparacion_entregas'>): number {
  return linea.reparacion_entregas.reduce((acc, e) => acc + Number(e.cantidad_devuelta), 0);
}

export function cantidadPendiente(linea: Pick<ReparacionItemConDetalle, 'cantidad' | 'reparacion_entregas'>): number {
  return Number(linea.cantidad) - cantidadDevuelta(linea);
}

// Estado de una línea: si algo se dio de baja sin reponerse, igual cuenta
// como "resuelta" — lo que importa es si queda algo afuera, no el resultado.
export type EstadoLinea = 'pendiente' | 'parcial' | 'cerrada';
export function estadoLinea(linea: Pick<ReparacionItemConDetalle, 'cantidad' | 'reparacion_entregas'>): EstadoLinea {
  const devuelta = cantidadDevuelta(linea);
  if (devuelta <= 0) return 'pendiente';
  if (devuelta < Number(linea.cantidad)) return 'parcial';
  return 'cerrada';
}

export type EstadoReparacion = 'pendiente' | 'parcial' | 'cerrada';
export function estadoReparacion(rep: Pick<ReparacionConDetalle, 'reparacion_items'>): EstadoReparacion {
  const estados = rep.reparacion_items.map(estadoLinea);
  if (estados.every(e => e === 'cerrada')) return 'cerrada';
  if (estados.every(e => e === 'pendiente')) return 'pendiente';
  return 'parcial';
}

export interface LineaPendientePorItem {
  reparacion: ReparacionConDetalle;
  linea: ReparacionItemConDetalle;
  pendiente: number;
}

// Para el "N en reparación" del detalle de un artículo: reusa la misma
// consulta que la pantalla de Reparaciones (misma queryKey → un solo
// pedido a la red aunque las dos partes de la app la usen a la vez).
export function useLineasPendientesPorItem(itemId: string | undefined) {
  const { data: reparaciones, ...rest } = useReparacionesQuery(true);
  const lineas: LineaPendientePorItem[] = [];
  if (itemId) {
    for (const reparacion of reparaciones ?? []) {
      for (const linea of reparacion.reparacion_items) {
        if (linea.item_id !== itemId) continue;
        const pendiente = cantidadPendiente(linea);
        if (pendiente > 0) lineas.push({ reparacion, linea, pendiente });
      }
    }
  }
  return { lineas, ...rest };
}

export function useReparacionesQuery(activo: boolean) {
  return useQuery({
    queryKey: [...QUERY_KEY, activo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reparaciones')
        .select(SELECT)
        .eq('activo', activo)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as unknown as ReparacionConDetalle[];
    },
  });
}

// Qué envíos (notas de despacho) ya tienen asignados las reparaciones activas: grupo del envío (todas sus versiones) -> id de la reparación.
// Una reparación eliminada deja libre su envío.
export function useEnviosAsignadosQuery() {
  return useQuery({
    queryKey: [...QUERY_KEY, 'envios-asignados'],
    queryFn: async () => {
      const { data, error } = await supabase.from('reparaciones').select('id, rotulos_generados(grupo_id)').eq('activo', true).not('envio_id', 'is', null);
      if (error) throw error;
      const asignados = new Map<string, string>();
      for (const r of data as unknown as { id: string; rotulos_generados: { grupo_id: string } | null }[]) {
        if (r.rotulos_generados?.grupo_id) asignados.set(r.rotulos_generados.grupo_id, r.id);
      }
      return asignados;
    },
  });
}

export interface NuevaReparacionInput {
  proveedor_id: string;
  motivo: string;
  fecha_salida: string;
  envio_id: string | null;
  items: { item_id: string; cantidad: number; descuenta_stock: boolean }[];
}

export function useCrearReparacion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: NuevaReparacionInput) => {
      const { data, error } = await supabase.rpc('crear_reparacion', {
        p_proveedor_id: input.proveedor_id,
        p_motivo: input.motivo,
        p_fecha_salida: input.fecha_salida,
        // El tipo generado marca esto como `string` no-nulable, pero la función
        // SQL acepta NULL sin problema (envío opcional) — es una imprecisión
        // conocida del generador de tipos con parámetros uuid sin default.
        p_envio_id: input.envio_id as unknown as string,
        p_items: input.items,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

export interface EditarReparacionInput {
  id: string;
  proveedor_id: string;
  motivo: string;
  fecha_salida: string;
  envio_id: string | null;
  orden_compra_numero: string | null;
  orden_compra_fecha: string | null;
}

export function useEditarReparacion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: EditarReparacionInput) => {
      const { id, ...body } = input;
      const { error } = await supabase.from('reparaciones').update(body).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: QUERY_KEY }); },
  });
}

export function useAgregarLineaReparacion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ reparacion_id, item_id, cantidad, descuenta_stock }: { reparacion_id: string; item_id: string; cantidad: number; descuenta_stock: boolean }) => {
      const { error } = await supabase.from('reparacion_items').insert({ reparacion_id, item_id, cantidad, descuenta_stock });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

export function useQuitarLineaReparacion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (reparacion_item_id: string) => {
      const { error } = await supabase.from('reparacion_items').delete().eq('id', reparacion_item_id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

export interface RegistrarEntregaInput {
  reparacion_item_id: string;
  cantidad_devuelta: number;
  resultado: 'reparado' | 'baja';
  remito_punto_venta: string | null;
  remito_numero: string | null;
  remito_fecha: string | null;
  fecha_entrega: string;
  registrado_por: string;
  repone_stock: boolean;
}

export function useRegistrarEntrega() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RegistrarEntregaInput) => {
      const { error } = await supabase.from('reparacion_entregas').insert(input);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

export function useEliminarReparacion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('eliminar_reparacion', { p_reparacion_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

export function useRestaurarReparacion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('restaurar_reparacion', { p_reparacion_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });
}
