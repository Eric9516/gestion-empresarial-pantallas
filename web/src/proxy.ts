import { NextResponse, type NextRequest } from 'next/server';

// Política de contenido (CSP): el navegador solo corre los scripts de la app (cada pantalla lleva un "nonce" nuevo, una clave que un
// atacante no puede adivinar), y no carga nada de otros sitios. Es la defensa más fuerte si alguna vez se cuela código ajeno en una página.
// Por ahora va EN MODO INFORME: no bloquea nada, solo avisa a /informe-csp lo que habría bloqueado. Cuando pasen unos días sin avisos
// de cosas legítimas, se cambia a la versión obligatoria (CSP_OBLIGATORIA).
const CSP_OBLIGATORIA = false;
const EN_DESARROLLO = process.env.NODE_ENV === 'development';

export function proxy(pedido: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const politica = [
    "default-src 'self'",
    // en desarrollo React usa eval para mostrar mejor los errores; en producción no
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${EN_DESARROLLO ? " 'unsafe-eval'" : ''}`,
    // los estilos sueltos en los elementos (style="…") los necesita la app; no ejecutan código
    "style-src 'self' 'unsafe-inline'",
    // fotos: las propias, las de antes del pase (Supabase) y las vistas previas que arma el navegador
    "img-src 'self' data: blob: https://*.supabase.co",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'report-uri /informe-csp',
  ].join('; ');
  const cabecera = CSP_OBLIGATORIA ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only';

  // La app instalada arranca con su empresa en la dirección (/?e=…, app/manifest.webmanifest): se recuerda en la cookie de la empresa, así la
  // pantalla de entrada muestra su nombre y su logo aunque en ese celular nunca haya entrado nadie. Solo cambia qué nombre y qué logo se ven
  // antes de entrar (los dos son públicos): no da acceso a nada.
  const pedida = pedido.nextUrl.searchParams.get('e');
  const recordar = pedida && ES_ID.test(pedida) && pedido.cookies.get(COOKIE_EMPRESA)?.value !== pedida ? pedida : null;
  if (recordar) pedido.cookies.set(COOKIE_EMPRESA, recordar);

  // Next lee el nonce del pedido y se lo pone a sus propios scripts
  const encabezados = new Headers(pedido.headers);
  encabezados.set(cabecera, politica);
  // (con la cookie nueva, este mismo pedido ya la ve)
  if (recordar) encabezados.set('cookie', pedido.cookies.toString());
  const respuesta = NextResponse.next({ request: { headers: encabezados } });
  respuesta.headers.set(cabecera, politica);
  if (recordar) {
    respuesta.cookies.set(COOKIE_EMPRESA, recordar, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 365 * 24 * 3600,
    });
  }
  return respuesta;
}

// (la misma cookie que pone la entrada: ~/lib/empresa; acá no se importa porque esa usa la base y el proxy no)
const COOKIE_EMPRESA = 'empresa';
const ES_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const config = {
  // solo las pantallas: no los archivos fijos, las fotos, el logo, los manuales (un PDF que se sube puede pasar el tope de lo que el proxy
  // lee de cada pedido) ni las precargas de los enlaces
  matcher: [{
    source: '/((?!_next/static|_next/image|archivos/|miniatura/|logo|icono|sw.js|manifest.webmanifest|informe-csp|favicon.ico|mantenimiento/manuales).*)',
    missing: [{ type: 'header', key: 'next-router-prefetch' }, { type: 'header', key: 'purpose', value: 'prefetch' }],
  }],
};
