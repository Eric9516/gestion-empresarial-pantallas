import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import type { Database } from '../../lib/database.types';
import { useAuth } from '../../auth/AuthContext';
import { useModulos } from '../config/useModulos';
import { iconoDeDeposito } from './iconos';

export type Deposito = Database['public']['Tables']['depositos']['Row'];

/** Cómo se llama el depósito mientras no se sabe cuál es (o si la base todavía no tiene la tabla). */
export const NOMBRE_DEPOSITO_POR_DEFECTO = 'Depósito';

const CLAVE = ['depositos'] as const;

// Todos los depósitos y cuáles son de la persona que mira. Si la base todavía no los tiene, queda sin datos y las pantallas usan los valores por defecto.
export function useDepositos() {
  const { profile } = useAuth();
  const { modulos, listo } = useModulos();
  return useQuery({
    queryKey: CLAVE,
    enabled: !!profile && listo && modulos.deposito,
    retry: false,
    queryFn: async () => {
      const [lista, mios] = await Promise.all([
        supabase.from('depositos').select('*').order('codigo'),
        supabase.rpc('depositos_del_usuario'),
      ]);
      if (lista.error) throw lista.error;
      if (mios.error) throw mios.error;
      const ids = new Set(mios.data);
      return { todos: lista.data, mios: lista.data.filter(d => d.activo && ids.has(d.id)) };
    },
  });
}

/** El depósito en el que trabaja la persona: el principal si es suyo, o el primero que tenga. (Con varios, acá va el selector.) */
export function useDepositoActual(): Deposito | undefined {
  const { data } = useDepositos();
  const mios = data?.mios ?? [];
  return mios.find(d => d.es_principal) ?? mios[0];
}

/** Lo que las pantallas muestran del depósito actual: su nombre y su ícono (con valores por defecto mientras no se sabe). */
export function useDepositoVisible() {
  const deposito = useDepositoActual();
  return { nombre: deposito?.nombre ?? NOMBRE_DEPOSITO_POR_DEFECTO, icono: iconoDeDeposito(deposito?.icono), color: deposito?.color ?? null };
}

/** Cuántos depósitos activos permite la licencia (lo fija quien vende). Sin dato, 1. */
export function useTopeDepositos() {
  return useQuery({
    queryKey: ['licencia', 'max_depositos'],
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.from('licencia').select('max_depositos').eq('id', 1).maybeSingle();
      if (error) throw error;
      return data?.max_depositos ?? 1;
    },
  });
}

export interface DatosDeposito { nombre: string; color: string | null; icono: string }

export function useCrearDeposito() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (v: DatosDeposito & { prefijo: string }) => {
      const { data, error } = await supabase.rpc('crear_deposito', { p_nombre: v.nombre, p_prefijo: v.prefijo, p_color: v.color, p_icono: v.icono });
      if (error) throw error;
      return data;
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: CLAVE }); },
  });
}

export function useEditarDeposito() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (v: DatosDeposito & { id: string; activo: boolean; prefijo?: string }) => {
      const { data, error } = await supabase.rpc('editar_deposito', { p_id: v.id, p_nombre: v.nombre, p_color: v.color, p_icono: v.icono, p_activo: v.activo, p_prefijo: v.prefijo ?? null });
      if (error) throw error;
      return data;
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: CLAVE }); },
  });
}
