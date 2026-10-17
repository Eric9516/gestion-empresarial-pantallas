import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../auth/AuthContext';
import type { Database } from '../../lib/database.types';
import { ConflictoDeEdicion } from '../../lib/conflicto';

export type Contacto = Database['public']['Tables']['contactos']['Row'];
export type Proveedor = Database['public']['Tables']['proveedores']['Row'] & { contactos: Contacto[] };
export type ContactoInput = { id?: string; nombre: string; cargo: string; telefono: string; celular: string; email: string };
export type ProveedorInput = {
  nombre: string;
  rubro: string;
  email: string;
  direccion: string;
  localidad: string;
  provincia: string;
  codigo_postal: string;
  horario: string;
  notas: string;
  activo: boolean;
};

const QUERY_KEY = ['proveedores'] as const;

export function useProveedoresQuery() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proveedores')
        .select('*, contactos(*)')
        .eq('eliminado', false)
        .order('nombre', { ascending: true });
      if (error) throw error;
      return data as Proveedor[];
    },
  });
}

// Guarda el proveedor y sincroniza sus contactos con los del formulario (agrega, actualiza y borra solo lo que cambió).
export function useSaveProveedor() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ id, data, contactos, version }: { id: string | null; data: ProveedorInput; contactos: ContactoInput[]; version?: string | null }) => {
      const body = {
        ...data,
        modificado_por: profile?.nombre || profile?.email || 'Usuario',
        updated_at: new Date().toISOString(),
      };

      let provId = id;
      if (id) {
        // Se guarda solo si nadie lo cambió desde que se abrió (version = su "actualizado el"); si no, avisa en vez de pisar lo del otro.
        let pedido = supabase.from('proveedores').update(body).eq('id', id);
        if (version === null) pedido = pedido.is('updated_at', null);
        else if (version !== undefined) pedido = pedido.eq('updated_at', version);
        const { data: filas, error } = await pedido.select('id');
        if (error) throw error;
        if (version !== undefined && !filas?.length) throw new ConflictoDeEdicion('este proveedor');
      } else {
        const { data: inserted, error } = await supabase.from('proveedores').insert(body).select().single();
        if (error) throw error;
        provId = inserted.id;
      }

      // Se compara con los contactos que ya tiene: los nuevos se agregan, los que siguen se actualizan y solo se borran los que el formulario ya no trae.
      // El orden importa: primero se agrega y se actualiza, y recién al final se borra, así un corte a mitad de camino nunca deja al proveedor sin contactos.
      const { data: actuales, error: errActuales } = await supabase.from('contactos').select('id').eq('proveedor_id', provId!);
      if (errActuales) throw errActuales;
      const idsActuales = new Set((actuales ?? []).map(c => c.id));
      const validos = contactos.filter(c => c.nombre.trim());
      const existentes = validos.filter(c => c.id && idsActuales.has(c.id));
      const nuevos = validos.filter(c => !c.id || !idsActuales.has(c.id));
      const quedan = new Set(existentes.map(c => c.id!));
      const sobran = [...idsActuales].filter(cid => !quedan.has(cid));

      if (nuevos.length) {
        const { error } = await supabase.from('contactos').insert(nuevos.map(({ id: _id, ...c }) => ({ ...c, proveedor_id: provId! })));
        if (error) throw error;
      }
      for (const { id: cid, ...c } of existentes) {
        const { error } = await supabase.from('contactos').update(c).eq('id', cid!);
        if (error) throw error;
      }
      if (sobran.length) {
        const { error } = await supabase.from('contactos').delete().in('id', sobran);
        if (error) throw error;
      }
      return provId!;
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: QUERY_KEY }); },
    onError: e => { if (e instanceof ConflictoDeEdicion) void queryClient.invalidateQueries({ queryKey: QUERY_KEY }); },
  });
}

export function useDeleteProveedor() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!profile) throw new Error('Sesión no disponible');
      const { error } = await supabase
        .from('proveedores')
        .update({ eliminado: true, eliminado_por: profile.id, eliminado_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: QUERY_KEY }); },
  });
}
