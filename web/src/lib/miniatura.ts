// La dirección de la versión chica de una foto (/miniatura/<bucket>/<ruta>). En las listas la foto se ve de 32 a 44 píxeles: bajar la
// completa (70 a 150 KB) para eso es tirar datos. En el servidor la arma Nginx (de la foto del disco o, si es de antes del pase, de la de
// Supabase) y la guarda ya achicada; en la computadora /miniatura manda a la foto completa.
const DE_LAS_NUESTRAS = /^\/archivos\/(items|rotulos)\/(.+)$/;
const DE_SUPABASE = /^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\/(items|rotulos)\/(.+)$/;

export function miniatura(url: string): string {
  const partes = url.match(DE_LAS_NUESTRAS) ?? url.match(DE_SUPABASE);
  return partes ? `/miniatura/${partes[1]}/${partes[2]}` : url;
}
