import { useEffect } from 'react';
import { useConfiguracionQuery } from '../features/config/useConfiguracion';
import { aplicarMarca } from '../lib/marca';
import { useDepositoActual } from '../features/depositos/useDepositos';

// No dibuja nada: aplica los colores y el logo de marca de la empresa a toda la app (también
// al login, porque la configuración se puede leer antes de iniciar sesión). El logo hace de
// ícono de la pestaña del navegador; sin logo, la pestaña queda sin ícono propio.
export default function AplicarMarca() {
  const { data: config } = useConfiguracionQuery();
  const primario = config?.color_primario;
  // El color del encabezado del Depósito es el de su depósito; sin depósito (o si la base todavía no los tiene), el que la empresa tenía elegido.
  const deposito = useDepositoActual()?.color ?? config?.color_deposito;
  const logo = config?.logo_base64;

  useEffect(() => {
    aplicarMarca(document.documentElement, { primario, deposito });
  }, [primario, deposito]);

  useEffect(() => {
    const actual = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!logo) { actual?.remove(); return; }
    const link = actual ?? Object.assign(document.createElement('link'), { rel: 'icon' });
    link.href = logo;
    if (!actual) document.head.appendChild(link);
  }, [logo]);

  return null;
}
