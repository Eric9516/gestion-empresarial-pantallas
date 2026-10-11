import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { fetchUsuariosPorIds, nombreUsuario } from '../../lib/usuarios';
import { purgarRotuloGrupo } from '../rotulos/useRotulos';

export type FilaPapelera = {
  tipo: 'proveedor' | 'repuesto' | 'reparacion' | 'envio';
  id: string;
  titulo: string;
  eliminado_por: string | null;
  eliminado_at: string | null;
  quien: string;
};

const QUERY_KEY = ['papelera'] as const;

export function usePapeleraQuery() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const [{ data: proveedores, error: errProv }, { data: items, error: errItems }, { data: reparaciones, error: errRep }, { data: envios, error: errEnv }] = await Promise.all([
        supabase.from('proveedores').select('id,nombre,eliminado_por,eliminado_at').eq('eliminado', true).order('eliminado_at', { ascending: false }),
        supabase.from('items').select('id,codigo,descripcion,eliminado_por,eliminado_at').eq('activo', false).order('eliminado_at', { ascending: false }),
        supabase.from('reparaciones').select('id,motivo,eliminado_por,eliminado_at,proveedores(nombre)').eq('activo', false).order('eliminado_at', { ascending: false }),
        supabase.from('rotulos_generados').select('grupo_id,tipo_documento,numero_documento,eliminado_por,eliminado_at,proveedores(nombre)').eq('eliminado', true).eq('vigente', true).order('eliminado_at', { ascending: false }),
      ]);
      if (errProv) throw errProv;
      if (errItems) throw errItems;
      if (errRep) throw errRep;
      if (errEnv) throw errEnv;

      const idsUsuarios = [...(proveedores ?? []), ...(items ?? []), ...(reparaciones ?? []), ...(envios ?? [])].map(r => r.eliminado_por).filter((v): v is string => !!v);
      const usuarios = await fetchUsuariosPorIds(idsUsuarios);

      function quienEs(id: string | null) {
        return id ? nombreUsuario(usuarios[id]) : 'Desconocido';
      }

      const filas: FilaPapelera[] = [
        ...(proveedores ?? []).map(p => ({ tipo: 'proveedor' as const, id: p.id, titulo: p.nombre, eliminado_por: p.eliminado_por, eliminado_at: p.eliminado_at, quien: quienEs(p.eliminado_por) })),
        ...(items ?? []).map(it => ({ tipo: 'repuesto' as const, id: it.id, titulo: `${it.codigo} — ${it.descripcion}`, eliminado_por: it.eliminado_por, eliminado_at: it.eliminado_at, quien: quienEs(it.eliminado_por) })),
        ...(reparaciones ?? []).map(r => ({ tipo: 'reparacion' as const, id: r.id, titulo: `Reparación — ${r.proveedores?.nombre ?? '?'} (${r.motivo})`, eliminado_por: r.eliminado_por, eliminado_at: r.eliminado_at, quien: quienEs(r.eliminado_por) })),
        ...(envios ?? []).map(e => ({
          tipo: 'envio' as const,
          id: e.grupo_id,
          titulo: `Envío — ${e.proveedores?.nombre ?? '?'}${e.numero_documento ? ` (${e.tipo_documento === 'remito' ? 'Remito' : 'N. despacho'} ${e.numero_documento})` : ''}`,
          eliminado_por: e.eliminado_por,
          eliminado_at: e.eliminado_at,
          quien: quienEs(e.eliminado_por),
        })),
      ].sort((a, b) => new Date(b.eliminado_at ?? 0).getTime() - new Date(a.eliminado_at ?? 0).getTime());

      return filas;
    },
  });
}

export function useRestaurarDePapelera() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ tipo, id }: { tipo: FilaPapelera['tipo']; id: string }) => {
      if (tipo === 'proveedor') {
        const { error } = await supabase.from('proveedores').update({ eliminado: false, eliminado_por: null, eliminado_at: null }).eq('id', id);
        if (error) throw error;
      } else if (tipo === 'repuesto') {
        const { error } = await supabase.from('items').update({ activo: true, eliminado_por: null, eliminado_at: null }).eq('id', id);
        if (error) throw error;
      } else if (tipo === 'reparacion') {
        const { error } = await supabase.rpc('restaurar_reparacion', { p_reparacion_id: id });
        if (error) throw error;
      } else {
        // Acá `id` es el grupo_id: restaura todas las versiones del envío juntas.
        const { error } = await supabase.from('rotulos_generados').update({ eliminado: false, eliminado_por: null, eliminado_at: null }).eq('grupo_id', id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['proveedores'] });
      void queryClient.invalidateQueries({ queryKey: ['items'] });
      void queryClient.invalidateQueries({ queryKey: ['reparaciones'] });
      void queryClient.invalidateQueries({ queryKey: ['rotulos_generados'] });
    },
  });
}

export function usePurgarDePapelera() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ tipo, id }: { tipo: FilaPapelera['tipo']; id: string }) => {
      if (tipo === 'envio') {
        await purgarRotuloGrupo(id);
        return;
      }
      const tabla = tipo === 'proveedor' ? 'proveedores' : tipo === 'repuesto' ? 'items' : 'reparaciones';
      const { error } = await supabase.from(tabla).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['reparaciones'] });
      void queryClient.invalidateQueries({ queryKey: ['rotulos_generados'] });
    },
  });
}
