import { useState } from 'react';
import { useAlCambiar } from '../lib/useAlCambiar';
import Modal from './Modal';
import { useToast } from './ToastProvider';
import { useAuth } from '../auth/AuthContext';
import { isDirectorioAdmin, isDirectorioDesactivado, isDepositoAdmin, isOwner, tieneAccesoDeposito } from '../lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useModulos } from '../features/config/useModulos';
import { useDepositoVisible } from '../features/depositos/useDepositos';
import { mensajeDeError } from '@/lib/errores';
import { Icono } from '@/components/Icono';
import { permisosDe } from '../features/perfil/permisos';
import { AyudaDelPerfil, DatosDeLaCuenta, PermisosDelPerfil, SeguridadDelPerfil } from '../features/perfil/SeccionesDePerfil';

export default function ProfileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile, user, updateOwnProfile } = useAuth();
  const toast = useToast();
  const { modulos } = useModulos();
  const depositoVisible = useDepositoVisible();
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
      await updateOwnProfile({ nombre: nombre.trim(), apellido: apellido.trim() });
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
  const permisos = permisosDe({ profile, deposito: modulos.deposito });
  const filasRol = [['Directorio', rolDirectorio], ...(modulos.deposito ? [[depositoVisible.nombre, rolDeposito]] : [])];

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
      <DatosDeLaCuenta profile={profile} user={user} />
      <SeguridadDelPerfil email={profile?.email} />
      <AyudaDelPerfil permisos={permisos.filter(p => p.tiene)} />
    </Modal>
  );
}
