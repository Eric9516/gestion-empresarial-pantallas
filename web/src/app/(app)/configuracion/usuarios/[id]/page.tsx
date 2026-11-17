import Link from 'next/link';
import type { CSSProperties } from 'react';
import { redirect } from 'next/navigation';
import { variablesDeMarca } from '@/lib/marca';
import { Icono } from '@/components/Icono';
import { isOwner } from '@/lib/types';
import { datosDeUsuario } from '~/componentes/areas';
import MenuDeUsuario from '~/componentes/MenuDeUsuario';
import { contexto } from '~/lib/contexto';
import { empresa } from '~/lib/empresa';
import ProveedoresDelDirectorio from '../../../directorio/ProveedoresDelDirectorio';
import { leerUsuarios } from '../../acciones';
import FichaDeUsuarioEnNext from './FichaDeUsuarioEnNext';

const LISTA = '/configuracion?grupo=usuarios';
const ES_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Configuración → Usuarios → la ficha de una persona, en su propia página (pedido del dueño, 12/11/2026: con tantas opciones, la ventana
// flotante quedaba chica). /configuracion/usuarios/nuevo, para crear una. Solo un dueño edita usuarios (quien solo puede cambiar
// contraseñas lo hace desde la lista).
export default async function PaginaDelUsuario({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await contexto();
  if (!isOwner(ctx.perfil)) redirect(LISTA);
  const { id } = await params;
  const nuevo = id === 'nuevo';
  if (!nuevo && !ES_ID.test(id)) redirect(LISTA);
  const usuario = nuevo ? null : (await leerUsuarios()).find(u => u.id === id) ?? null;
  if (!nuevo && !usuario) redirect(LISTA);
  const emp = await empresa(ctx.empresaId);
  const nombre = usuario ? [usuario.nombre, usuario.apellido].filter(Boolean).join(' ') || usuario.email : 'Nuevo usuario';
  const activo = usuario?.activo !== false;

  return (
    <ProveedoresDelDirectorio>
      <div className="admin-screen" style={variablesDeMarca({ primario: emp.colorPrimario, deposito: ctx.deposito?.color }) as CSSProperties}>
        <header className="app-header">
          <div className="header-logo">
            {emp.logo && <img src={emp.logo} alt={emp.nombre} />}
            <div>
              <div className="header-logo-fallback">{emp.nombre}</div>
              <h1 className="header-title">Configuración</h1>
            </div>
          </div>
          <div className="header-right">
            <MenuDeUsuario usuario={datosDeUsuario(ctx)} />
          </div>
        </header>
        <main className="app-main ficha-usuario-pagina">
          <Link href={LISTA} className="ficha-usuario-volver"><Icono n="volver" /> Volver a Usuarios</Link>
          <div className="ficha-usuario-cabecera">
            <h2 className="ficha-usuario-nombre">{nombre}</h2>
            {usuario && (
              <div className="ficha-usuario-estado">
                <span>{usuario.email}</span>
                <span className={`badge ${activo ? 'badge-active' : 'badge-inactive'}`}>{activo ? 'Activo' : 'Bloqueado'}</span>
                {usuario.es_owner && <span className="badge badge-rubro"><Icono n="corona" /> Dueño</span>}
              </div>
            )}
          </div>
          <FichaDeUsuarioEnNext perfil={ctx.perfil} modulos={ctx.modulos} usuario={usuario} />
        </main>
      </div>
    </ProveedoresDelDirectorio>
  );
}
