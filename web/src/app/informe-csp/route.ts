// Los avisos de la política de contenido (CSP): el navegador cuenta qué habría bloqueado. Quedan en el registro de la app (docker logs gestion-web)
// en una línea cada uno, para revisar antes de pasar la política a obligatoria.
export async function POST(pedido: Request) {
  const texto = (await pedido.text()).slice(0, 8000);
  try {
    const aviso = JSON.parse(texto)['csp-report'] ?? {};
    // (desde dónde: el archivo y la línea del código que lo intentó)
    const desde = aviso['source-file'] ? ` desde ${aviso['source-file']}:${aviso['line-number'] ?? '?'}` : '';
    console.warn('[csp]', aviso['effective-directive'] ?? aviso['violated-directive'], aviso['blocked-uri'], 'en', aviso['document-uri'] + desde);
  } catch {
    console.warn('[csp] aviso ilegible');
  }
  return new Response(null, { status: 204 });
}
