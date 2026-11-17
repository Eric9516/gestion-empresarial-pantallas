import type { CSSProperties, ReactNode } from 'react';
import { variablesDeMarca } from '@/lib/marca';
import { clasesDelMenu, type PosicionMenu } from '@/lib/preferencias';
import type { Avisos } from '~/lib/avisos';
import type { Empresa } from '~/lib/empresa';
import { ProveedorDeAvisos } from './avisos/ProveedorDeAvisos';
import MenuDeUsuario, { type DatosDeUsuario } from './MenuDeUsuario';

interface Props {
  /** La clase de la pantalla (los colores de la cabecera: app-screen para el Directorio, deposito-screen para el Depósito). */
  clase: string;
  titulo: ReactNode;
  empresa: Empresa;
  usuario: DatosDeUsuario;
  posicion: PosicionMenu;
  fijo: boolean;
  /** Los números rojos del menú (ver ~/lib/avisos). */
  avisos: Avisos;
  /** El color del depósito en el que se está (si eligió uno); sin él, el de la empresa o el azul. */
  colorDeposito?: string | null;
  /** El menú de secciones de la computadora y la hamburguesa del celular (cada área los arma con lo suyo). */
  menu: ReactNode;
  menuCelular: ReactNode;
  children: ReactNode;
}

// Lo que comparten las áreas: cabecera con el logo, el nombre del área y la persona, el menú y el contenido. Mismas clases que la app de Vite.
export default function Area({ clase, titulo, empresa, usuario, posicion, fijo, avisos, colorDeposito, menu, menuCelular, children }: Props) {
  // los colores elegidos (de la empresa y del depósito), como variables CSS de esta pantalla
  const colores = variablesDeMarca({ primario: empresa.colorPrimario, deposito: colorDeposito }) as CSSProperties;
  return (
    <ProveedorDeAvisos iniciales={avisos}>
      <div className={`${clase} ${clasesDelMenu(posicion, fijo)}`} style={colores}>
        <header className="app-header">
          <div className="header-logo">
            {empresa.logo && <img src={empresa.logo} alt={empresa.nombre} />}
            <div>
              <div className="header-logo-fallback">{empresa.nombre}</div>
              <h1 className="header-title">{titulo}</h1>
            </div>
          </div>
          <div className="header-right">
            <MenuDeUsuario usuario={usuario} />
            {menuCelular}
          </div>
        </header>
        {menu}
        <main className="app-main">{children}</main>
      </div>
    </ProveedorDeAvisos>
  );
}
