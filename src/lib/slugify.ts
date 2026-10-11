// Nombre de carpeta legible dentro del bucket de Storage: "proveedor-name_abcd1234".
export function slugifyProv(nombre: string | null | undefined, id: string): string {
  const slug = String(nombre || 'proveedor')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  return `${slug}_${id.slice(0, 8)}`;
}
