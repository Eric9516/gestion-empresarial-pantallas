import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Icono } from '@/components/Icono';
import { datosDeUsuario } from '~/componentes/areas';
import MenuDeUsuario from '~/componentes/MenuDeUsuario';
import { contexto } from '~/lib/contexto';
import { comoUsuario } from '~/lib/db';
import { empresa } from '~/lib/empresa';
import ProveedoresDelDirectorio from '../directorio/ProveedoresDelDirectorio';
import PanelDePlataforma, { type EmpresaDeLaPlataforma } from './PanelDePlataforma';

// La plataforma: las empresas del servidor, para quien lo administra (plataforma.administradores). El resto no sabe que existe.
export default async function Plataforma() {
  const ctx = await contexto();
  if (!ctx.esPlataforma) notFound();
  const emp = await empresa(ctx.empresaId);
  const empresas = await comoUsuario(ctx.perfil.id, async c =>
    (await c.query<EmpresaDeLaPlataforma>(`select id, nombre, activa, creada_at, usuarios::int, duenos, modulos, componentes, max_depositos,
                                                  ultimo_uso, mia from plataforma.empresas()`)).rows);
  // (los avisos y confirmaciones de las ventanas de Mi perfil)
  return (
    <ProveedoresDelDirectorio>
      <div className="admin-screen">
        <header className="app-header">
          <div className="header-logo">
            {emp.logo && <img src={emp.logo} alt={emp.nombre} />}
            <div>
              <div className="header-logo-fallback">{emp.nombre}</div>
              <h1 className="header-title">Plataforma</h1>
            </div>
          </div>
          <div className="header-right">
            <Link href="/" className="btn-volver-directorio" style={{ display: 'flex' }}><Icono n="volver" /> <span className="hide-mobile">Volver</span></Link>
            <MenuDeUsuario usuario={datosDeUsuario(ctx)} />
          </div>
        </header>
        <main className="app-main">
          <PanelDePlataforma empresas={empresas} />
        </main>
      </div>
    </ProveedoresDelDirectorio>
  );
}
