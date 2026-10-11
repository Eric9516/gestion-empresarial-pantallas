import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { isOwner, puedeResetearContrasenas } from '../../lib/types';
import ResponsiveList, { type Column } from '../../components/ResponsiveList';
import { useUsuariosQuery, type Usuario } from './useUsuarios';
import UsuarioForm from './UsuarioForm';
import ResetPasswordModal from './ResetPasswordModal';
import { Button } from '@/components/ui/button';
import { useModulos } from '../config/useModulos';
import { Icono } from '@/components/Icono';

const MANT_LABELS: Record<string, string> = { admin: 'Admin', comun: 'Usuario' };
const ROL_BADGE: Record<string, { cls: string; label: string }> = {
  admin: { cls: 'badge-rubro', label: 'Admin' },
  user: { cls: 'badge-active', label: 'Usuario' },
  disabled: { cls: 'badge-inactive', label: 'Desactivado' },
};

export default function UsuariosPane() {
  const { profile } = useAuth();
  const { data: usuarios, isLoading, isError } = useUsuariosQuery();
  const { modulos } = useModulos();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Usuario | null>(null);
  const [resetPasswordUsuario, setResetPasswordUsuario] = useState<Usuario | null>(null);

  const owner = isOwner(profile);
  const puedeResetear = puedeResetearContrasenas(profile);

  function abrirEditar(u: Usuario) {
    setEditing(u);
    setFormOpen(true);
  }

  function badges(u: Usuario) {
    return (
      <>
        {modulos.deposito && (u.mantenimiento_rol ? <span className="badge badge-rubro">{MANT_LABELS[u.mantenimiento_rol]}</span> : <span className="badge badge-inactive">Desactivado</span>)}
        {modulos.deposito && u.mantenimiento_rol && u.puede_ver_retiros &&<span className="badge badge-active" title="Puede ver los retiros de todos">  <Icono n="ver" /> Retiros</span>}
        {u.puede_ver_errores && <span className="badge badge-active" title="Puede ver el log de errores">  <Icono n="error" /></span>}
      </>
    );
  }

  function acciones(u: Usuario) {
    const esUnoMismo = u.id === profile?.id;
    return (
      <div className="td-actions">
        {owner && <Button variant="ghost" size="sm" onClick={() => abrirEditar(u)}>Editar</Button>}
        {/* El botón de fila solo hace falta para quien tiene el permiso pero NO
            es owner — no puede abrir "Editar", así que sin esto no tendría
            ningún otro camino. Al owner ya se lo mostramos adentro de Editar
            (ver UsuarioForm), para no duplicar el botón en su propia fila. */}
        {puedeResetear && !owner && !esUnoMismo && <Button variant="ghost" size="sm" onClick={() => setResetPasswordUsuario(u)}><Icono n="clave" /> Contraseña</Button>}
        {!owner && esUnoMismo && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Editá tu nombre desde "Mi perfil"</span>}
      </div>
    );
  }

  const columns: Column<Usuario>[] = [
    { header: 'Nombre', render: u => <strong>{u.nombre} {u.apellido}</strong> },
    { header: 'Email', render: u => u.email },
    { header: 'Directorio', render: u => { const r = ROL_BADGE[u.rol ?? 'user'] ?? ROL_BADGE.user; return <><span className={`badge ${r.cls}`}>{r.label}</span>{u.es_owner && <span className="badge badge-rubro" title="Dueño del sistema">  <Icono n="corona" /> Dueño</span>}</>; } },
    { header: modulos.deposito ? 'Depósito' : 'Permisos', render: badges },
    { header: 'Estado', render: u => <span className={`badge ${u.activo !== false ? 'badge-active' : 'badge-inactive'}`}>{u.activo !== false ? 'Activo' : 'Inactivo'}</span> },
    { header: '', render: acciones },
  ];

  function renderCard(u: Usuario) {
    const r = ROL_BADGE[u.rol ?? 'user'] ?? ROL_BADGE.user;
    return (
      <div className="prov-card">
        <div className="prov-card-header">
          <div>
            <div className="prov-card-name">{u.nombre} {u.apellido}</div>
            <div style={{ fontSize: 12, color: 'var(--text-mid)', marginTop: 2 }}>{u.email}</div>
            <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <span className={`badge ${r.cls}`}>{r.label}</span>
              {u.es_owner && <span className="badge badge-rubro" title="Dueño del sistema"><Icono n="corona" /> Dueño</span>}
              <span className={`badge ${u.activo !== false ? 'badge-active' : 'badge-inactive'}`}>{u.activo !== false ? 'Activo' : 'Inactivo'}</span>
              {badges(u)}
            </div>
          </div>
        </div>
        <div className="prov-card-actions">{acciones(u)}</div>
      </div>
    );
  }

  return (
    <div className="admin-card">
      <div className="admin-card-header" style={{ justifyContent: 'space-between' }}>
        <span><Icono n="usuarios" /> Usuarios</span>
        {owner && (
          <Button size="sm" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', fontSize: 12 }} onClick={() => { setEditing(null); setFormOpen(true); }}>+ Nuevo usuario</Button>
        )}
      </div>
      <div className="admin-card-body" style={{ padding: usuarios?.length ? 0 : 18 }}>
        {isLoading && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Cargando...</p>}
        {isError && <p style={{ color: 'var(--danger)', fontSize: 13 }}>Error al cargar usuarios</p>}
        {!isLoading && !isError && (
          <ResponsiveList
            columns={columns}
            data={usuarios ?? []}
            renderCard={renderCard}
            keyField={u => u.id}
            emptyIcon={<Icono n="usuarios" />}
            emptyTitle="Sin usuarios registrados"
            emptyDescription=""
          />
        )}
      </div>
      <UsuarioForm open={formOpen} onClose={() => setFormOpen(false)} usuario={editing} />
      <ResetPasswordModal open={!!resetPasswordUsuario} onClose={() => setResetPasswordUsuario(null)} usuario={resetPasswordUsuario} />
    </div>
  );
}
