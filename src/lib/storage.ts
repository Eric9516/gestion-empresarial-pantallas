import { supabase } from './supabaseClient';

// URL pública de un archivo en Storage — evita repetir `.storage.from(bucket)
// .getPublicUrl(path).data.publicUrl` en cada pantalla que muestra una foto o un PDF.
export function publicUrl(bucket: string, path: string): string {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
