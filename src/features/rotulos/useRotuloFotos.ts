import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../auth/AuthContext';
import { compressImage } from '../../lib/compressImage';
import { slugifyProv } from '../../lib/slugify';

export const MAX_FOTOS_ROTULO = 5;

export function useRotuloFotosQuery(grupoId: string | null) {
  return useQuery({
    queryKey: ['rotulos_fotos', grupoId],
    enabled: !!grupoId,
    queryFn: async () => {
      const { data, error } = await supabase.from('rotulos_fotos').select('*').eq('grupo_id', grupoId!).order('created_at', { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useSubirRotuloFotos() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async ({ grupoId, proveedorId, proveedorNombre, files }: { grupoId: string; proveedorId: string; proveedorNombre: string; files: File[] }) => {
      for (let i = 0; i < files.length; i++) {
        const blob = await compressImage(files[i], 1600, 0.8);
        const path = `${slugifyProv(proveedorNombre, proveedorId)}/fotos/${Date.now()}_${i}.jpg`;
        const { error: uploadError } = await supabase.storage.from('rotulos').upload(path, blob, { contentType: 'image/jpeg', upsert: true });
        if (uploadError) throw uploadError;
        const { error } = await supabase.from('rotulos_fotos').insert({ grupo_id: grupoId, proveedor_id: proveedorId, storage_path: path, creado_por: profile?.id || null });
        if (error) throw error;
      }
    },
    onSuccess: (_data, vars) => { void queryClient.invalidateQueries({ queryKey: ['rotulos_fotos', vars.grupoId] }); },
  });
}

export function useEliminarRotuloFoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, storagePath, grupoId }: { id: string; storagePath: string; grupoId: string }) => {
      const { error } = await supabase.from('rotulos_fotos').delete().eq('id', id);
      if (error) throw error;
      await supabase.storage.from('rotulos').remove([storagePath]);
      return grupoId;
    },
    onSuccess: (_data, vars) => { void queryClient.invalidateQueries({ queryKey: ['rotulos_fotos', vars.grupoId] }); },
  });
}
