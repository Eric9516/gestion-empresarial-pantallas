// Las tres fotos de un repuesto y sus columnas. Aparte de useItems (que habla con la base) para poder usarlo en cualquier pantalla, también en la app de Next.

export type FotoSlot = 'foto_url' | 'foto_url_2' | 'foto_url_3';

export const SLOTS_FOTO: FotoSlot[] = ['foto_url', 'foto_url_2', 'foto_url_3'];

// Nombres de las columnas "pendiente"/"quién la subió"/"cuándo" para cada
// slot — se usa en ItemDetail y en el panel de fotos pendientes, en vez de
// repetir el mismo switch en cada lugar.
export const CAMPOS_POR_SLOT: Record<FotoSlot, {
  pendiente: 'foto_pendiente' | 'foto_pendiente_2' | 'foto_pendiente_3';
  subidaPor: 'foto_subida_por' | 'foto_subida_por_2' | 'foto_subida_por_3';
  subidaAt: 'foto_subida_at' | 'foto_subida_at_2' | 'foto_subida_at_3';
}> = {
  foto_url: { pendiente: 'foto_pendiente', subidaPor: 'foto_subida_por', subidaAt: 'foto_subida_at' },
  foto_url_2: { pendiente: 'foto_pendiente_2', subidaPor: 'foto_subida_por_2', subidaAt: 'foto_subida_at_2' },
  foto_url_3: { pendiente: 'foto_pendiente_3', subidaPor: 'foto_subida_por_3', subidaAt: 'foto_subida_at_3' },
};
