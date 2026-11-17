import type { ReactNode } from 'react';
import { Icono } from '@/components/Icono';
import { headers } from 'next/headers';
import { trabajaEnEquipos } from '@/lib/types';
import ActivarAvisos from '~/componentes/avisos/ActivarAvisos';
import RegistroDeErrores from '~/componentes/errores/RegistroDeErrores';
import { clavesDeAvisos } from '~/lib/avisosAlCelular';
import { contexto } from '~/lib/contexto';

// Mientras la base del servidor sea una copia de Cremac que se rehace cada noche, todo lo que se haga acá se pierde: se avisa siempre, arriba.
// (Lo enciende MODO_ENSAYO=1 en /etc/gestion/web.env; el día del pase se saca.)
const EN_ENSAYO = process.env.MODO_ENSAYO === '1';

// Todo lo de adentro pide sesión: contexto() manda a /entrar si no hay. Cada área (Depósito, Directorio…) arma su propia cabecera y menú.
export default async function LayoutAdentro({ children }: { children: ReactNode }) {
  const { perfil, modulos } = await contexto();
  const clave = modulos.mantenimiento && trabajaEnEquipos(perfil) ? await claveDeAvisos() : null;
  return (
    <>
      {EN_ENSAYO && (
        <div className="aviso-ensayo" role="note">
          <Icono n="alerta" /> Versión de prueba: los datos son una copia de Cremac de cada noche y lo que hagas acá se borra. Para trabajar, usá la app de siempre.
        </div>
      )}
      {children}
      <RegistroDeErrores />
      {clave && <ActivarAvisos clave={clave} />}
    </>
  );
}

/** La clave pública para los avisos al celular (la primera vez se crean las del servidor, con la dirección de la app). Si falla, sin cartel. */
async function claveDeAvisos(): Promise<string | null> {
  try {
    const h = await headers();
    const host = h.get('x-forwarded-host') ?? h.get('host');
    return (await clavesDeAvisos(host ? `https://${host}` : undefined))?.publica ?? null;
  } catch {
    return null;
  }
}
