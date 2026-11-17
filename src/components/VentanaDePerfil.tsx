import { useState } from 'react';
import { useAlCambiar } from '../lib/useAlCambiar';
import Modal from './Modal';
import { useToast } from './ToastProvider';
import { isDirectorioAdmin, isDirectorioDesactivado, isDepositoAdmin, isOwner, tieneAccesoDeposito } from '../lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { mensajeDeError } from '@/lib/errores';
import { Icono } from '@/components/Icono';
import { permisosDe } from '../features/perfil/permisos';
import { AyudaDelPerfil, DatosDeLaCuenta, PermisosDelPerfil, SeguridadDelPerfil, type AccionesDeSeguridad, type DatosDeSesion } from '../features/perfil/SeccionesDePerfil';
import type { Profile } from '../lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  profile: Profile | null;
  user: DatosDeSesion | null;
  /** Si la empresa usa el Depósito, y cómo se llama el de la persona. */
  conDeposito: boolean;
  nombreDeposito: string;
  /** El módulo Mantenimiento está prendido (si no, su rol no se muestra). */
  conMantenimiento?: boolean;
  /** Guarda el nombre y el apellido propios. */
  guardar: (datos: { nombre: string; apellido: string }) => Promise<void>;
  seguridad: AccionesDeSeguridad;
  /** Cuenta de administración de la plataforma (app de Next): no es de una empresa, así que no tiene roles ni permisos de empresa. */
  deLaPlataforma?: boolean;
}

// "Mi perfil": nombre y apellido, los roles y permisos (con su explicación), la cuenta y la seguridad. La comparten la app de Vite y la de Next.
export default function VentanaDePerfil({ open, onClose, profile, user, conDeposito, nombreDeposito, conMantenimiento = false, guardar, seguridad, deLaPlataforma = false }: Props) {
  const toast = useToast();
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [saving, setSaving] = useState(false);

  useAlCambiar([open, profile], () => {
    if (open) {
      setNombre(profile?.nombre ?? '');
      setApellido(profile?.apellido ?? '');
    }
  });

  async function handleSave() {
    if (!nombre.trim()) { toast('El nombre es obligatorio', 'error'); return; }
    setSaving(true);
    try {
      await guardar({ nombre: nombre.trim(), apellido: apellido.trim() });
      toast('Perfil actualizado', 'success');
      onClose();
    } catch (e) {
      toast('Error al guardar: ' + mensajeDeError(e), 'error');
    } finally {
      setSaving(false);
    }
  }

  const rolDirectorio = isDirectorioDesactivado(profile) ? 'Sin acceso' : isDirectorioAdmin(profile) ? 'Administrador' : 'Usuario';
  const rolDeposito = !tieneAccesoDeposito(profile) ? 'Sin acceso' : isDepositoAdmin(profile) ? 'Administrador' : 'Usuario';
  const permisos = permisosDe({ profile, deposito: conDeposito });
  const rolMantenimiento = isOwner(profile) || profile?.rol_equipos === 'admin' ? 'Responsable (administrador)' : profile?.rol_equipos === 'jefe' ? 'Jefe de taller'
    : profile?.rol_equipos === 'tecnico' ? 'Técnico' : profile?.rol_equipos === 'consulta' ? 'Solo consulta' : 'Sin acceso';
  const filasRol = [['Directorio', rolDirectorio], ...(conDeposito ? [[nombreDeposito, rolDeposito]] : []), ...(conMantenimiento ? [['Mantenimiento', rolMantenimiento]] : [])];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={<><Icono n="usuario" /> Mi perfil</>}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="success" onClick={() => void handleSave()} disabled={saving}>Guardar</Button>
        </>
      }
    >
      <div className="form-group"><label>Email</label><div style={{ fontSize: 14, color: 'var(--text-mid)', padding: '8px 0' }}>{profile?.email}</div></div>
      <div className="form-grid">
        <div className="form-group"><label htmlFor="profile-modal-1">Nombre</label><Input id="profile-modal-1" value={nombre} onChange={e => setNombre(e.target.value)} /></div>
        <div className="form-group"><label htmlFor="profile-modal-2">Apellido</label><Input id="profile-modal-2" value={apellido} onChange={e => setApellido(e.target.value)} /></div>
      </div>
      {deLaPlataforma ? (
        <div style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 12, marginTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-mid)' }}>Rol</span>
          <span className="badge badge-rubro"><Icono n="empresa" /> Administrador de la plataforma</span>
        </div>
      ) : (<>
      <div style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 12, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {isOwner(profile) && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-mid)' }}>Rol</span>
            <span className="badge badge-rubro"><Icono n="corona" /> Dueño del sistema</span>
          </div>
        )}
        {filasRol.map(([area, rol]) => (
          <div key={area} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-mid)' }}>Rol en {area}</span>
            <span className={`badge ${rol === 'Sin acceso' ? 'badge-inactive' : 'badge-rubro'}`}>{rol}</span>
          </div>
        ))}
      </div>
      <PermisosDelPerfil permisos={permisos} />
      </>)}
      <DatosDeLaCuenta profile={profile} user={user} />
      <SeguridadDelPerfil email={profile?.email} acciones={seguridad} />
      {!deLaPlataforma && <AyudaDelPerfil permisos={permisos.filter(p => p.tiene)} />}
    </Modal>
  );
}
