import { useState } from 'react';
import { useAlCambiar } from '../../lib/useAlCambiar';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { useConfirm } from '../../components/ConfirmProvider';
import { useAuth } from '../../auth/AuthContext';
import { isOwner } from '../../lib/types';
import ResetPasswordModal from './ResetPasswordModal';
import { useCreateUsuario, useDeleteUsuario, useToggleUsuarioActivo, useAgregarDueno, useQuitarDueno, useUpdateUsuario, type Usuario, type UsuarioInput } from './useUsuarios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useModulos } from '../config/useModulos';
import { mensajeDeError } from '@/lib/errores';
import { LARGO_MINIMO_CLAVE } from '../perfil/permisos';
import { Icono } from '@/components/Icono';

interface Props {
  open: boolean;
  onClose: () => void;
  usuario: Usuario | null;
}

const emptyInput: UsuarioInput = {
  nombre: '', apellido: '', email: '', rol: 'user', mantenimiento_rol: null,
  puede_ver_retiros: false, puede_ver_errores: false, puede_resetear_contrasenas: false,
  puede_ver_sugerencias: false, puede_ajustar_inventario: false, puede_gestionar_depositos: false,
};

export default function UsuarioForm({ open, onClose, usuario }: Props) {
  const toast = useToast();
  const confirmar = useConfirm();
  const { profile } = useAuth();
  const { modulos } = useModulos();
  const createUsuario = useCreateUsuario();
  const updateUsuario = useUpdateUsuario();
  const toggleActivo = useToggleUsuarioActivo();
  const deleteUsuario = useDeleteUsuario();
  const agregarDueno = useAgregarDueno();
  const quitarDueno = useQuitarDueno();

  const [input, setInput] = useState<UsuarioInput>(emptyInput);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);

  const esUnoMismo = usuario?.id === profile?.id;

  useAlCambiar([open, usuario], () => {
    if (!open) return;
    setPassword('');
    setInput(usuario
      ? {
        nombre: usuario.nombre ?? '', apellido: usuario.apellido ?? '', email: usuario.email ?? '',
        rol: usuario.rol ?? 'user', mantenimiento_rol: usuario.mantenimiento_rol,
        puede_ver_retiros: usuario.puede_ver_retiros === true,
        puede_ver_errores: usuario.puede_ver_errores === true,
        puede_resetear_contrasenas: usuario.puede_resetear_contrasenas === true,
        puede_ver_sugerencias: usuario.puede_ver_sugerencias === true,
        puede_ajustar_inventario: usuario.puede_ajustar_inventario === true,
        puede_gestionar_depositos: usuario.puede_gestionar_depositos === true,
      }
      : emptyInput);
  });

  // Al subir a Administrador del Depósito se tilda "ver los retiros de todos"
  // (se puede destildar); al desactivar o bajar a Usuario, se destilda.
  function cambiarRolMantenimiento(valor: string) {
    // El permiso de ajustar el inventario es solo de administradores del Depósito: al cambiar el rol, se saca.
    setInput(v => ({ ...v, mantenimiento_rol: valor || null, puede_ver_retiros: valor === 'admin', puede_ajustar_inventario: valor === 'admin' ? v.puede_ajustar_inventario : false }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.nombre.trim() || !input.email.trim()) { toast('Nombre y email son obligatorios', 'error'); return; }
    if (input.rol === 'disabled' && input.mantenimiento_rol === null) {
      toast('No puede quedar sin acceso a Directorio y al Depósito a la vez', 'error');
      return;
    }

    setSaving(true);
    // Sin acceso al Depósito no hay retiros que ver: nunca queda tildado.
    const datos = { ...input, puede_ver_retiros: input.mantenimiento_rol !== null && input.puede_ver_retiros };
    try {
      if (!usuario) {
        if (!password || password.length < LARGO_MINIMO_CLAVE) { toast(`La contraseña debe tener al menos ${LARGO_MINIMO_CLAVE} caracteres`, 'error'); setSaving(false); return; }
        await createUsuario.mutateAsync({ input: datos, password });
        toast('Usuario creado', 'success');
      } else {
        await updateUsuario.mutateAsync({ id: usuario.id, input: datos });
        toast('Usuario actualizado', 'success');
      }
      onClose();
    } catch (e) {
      toast('Error: ' + mensajeDeError(e), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActivo() {
    if (!usuario) return;
    try {
      await toggleActivo.mutateAsync({ id: usuario.id, activo: !(usuario.activo !== false) });
      toast(usuario.activo !== false ? 'Usuario bloqueado' : 'Usuario desbloqueado', 'success');
      onClose();
    } catch {
      toast('Error al actualizar usuario', 'error');
    }
  }

  async function handleAgregarDueno() {
    if (!usuario) return;
    const nombre = usuario.nombre || usuario.email;
    if (!(await confirmar(`¿Agregar a ${nombre} como dueño del sistema? Va a tener los mismos poderes que vos: ver el historial completo, administrar usuarios y quitarte el cargo. Vos seguís siendo dueño.`, { textoConfirmar: 'Agregar como dueño', peligroso: true }))) return;
    try {
      await agregarDueno.mutateAsync(usuario.id);
      toast(`${nombre} ahora es dueño del sistema`, 'success');
      onClose();
    } catch (e) {
      toast('Error: ' + mensajeDeError(e), 'error');
    }
  }

  async function handleQuitarDueno() {
    if (!usuario) return;
    const nombre = usuario.nombre || usuario.email;
    if (!(await confirmar(`¿Quitarle el cargo de dueño a ${nombre}? Va a seguir siendo usuario, con los roles que tenga asignados.`, { textoConfirmar: 'Quitar como dueño', peligroso: true }))) return;
    try {
      await quitarDueno.mutateAsync(usuario.id);
      toast(`${nombre} ya no es dueño del sistema`, 'success');
      onClose();
    } catch (e) {
      toast('Error: ' + mensajeDeError(e), 'error');
    }
  }

  async function handleDelete() {
    if (!usuario) return;
    if (!(await confirmar('¿Eliminar este usuario definitivamente? Esta acción no se puede deshacer.', { textoConfirmar: 'Eliminar definitivamente', peligroso: true }))) return;
    try {
      await deleteUsuario.mutateAsync(usuario.id);
      toast('Usuario eliminado', 'error');
      onClose();
    } catch (e) {
      toast('Error: ' + mensajeDeError(e), 'error');
    }
  }

  return (
    <>
      <Modal open={open} onClose={onClose} title={usuario ? 'Editar Usuario' : 'Nuevo Usuario'}>
        <form onSubmit={e => void handleSubmit(e)}>
          <div className="form-grid">
            <div className="form-group"><label htmlFor="usuario-form-1">Nombre</label><Input id="usuario-form-1" value={input.nombre} onChange={e => setInput(v => ({ ...v, nombre: e.target.value }))} /></div>
            <div className="form-group"><label htmlFor="usuario-form-2">Apellido</label><Input id="usuario-form-2" value={input.apellido} onChange={e => setInput(v => ({ ...v, apellido: e.target.value }))} /></div>
            <div className={`form-group${usuario ? ' full' : ''}`}><label htmlFor="usuario-form-3">Email</label><Input id="usuario-form-3" type="email" value={input.email} disabled={!!usuario} onChange={e => setInput(v => ({ ...v, email: e.target.value }))} /></div>
            {!usuario && (
              <div className="form-group"><label htmlFor="usuario-form-4">Contraseña</label><Input id="usuario-form-4" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={`Mínimo ${LARGO_MINIMO_CLAVE} caracteres`} /></div>
            )}
            <div className="form-group">
              <label htmlFor="usuario-form-5">Rol en Directorio</label>
              <Select id="usuario-form-5" value={input.rol} disabled={esUnoMismo} onChange={e => setInput(v => ({ ...v, rol: e.target.value }))}>
                <option value="user">Usuario</option>
                <option value="admin">Administrador</option>
                <option value="disabled">Desactivado</option>
              </Select>
            </div>
            {modulos.deposito && <div className="form-group">
              <label htmlFor="usuario-form-6">Rol en Depósito</label>
              <Select id="usuario-form-6" value={input.mantenimiento_rol ?? ''} disabled={esUnoMismo} onChange={e => cambiarRolMantenimiento(e.target.value)}>
                <option value="comun">Usuario</option>
                <option value="admin">Administrador</option>
                <option value="">Desactivado</option>
              </Select>
            </div>}
          </div>
          {esUnoMismo && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: -8, marginBottom: 16 }}>
              No podés cambiar tu propio rol ni tus propios permisos desde acá — es a propósito, para que nunca te bloquees tu propia cuenta sin querer.
            </p>
          )}
          {modulos.deposito && input.mantenimiento_rol !== null && (
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400 }}>
                <input type="checkbox" checked={input.puede_ver_retiros} disabled={esUnoMismo} onChange={e => setInput(v => ({ ...v, puede_ver_retiros: e.target.checked }))} />
                Puede ver los retiros de todos (Depósito)
              </label>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0 24px' }}>
                {input.mantenimiento_rol === 'admin'
                  ? 'Los administradores lo tienen tildado por defecto. Si lo destildás, solo ve sus propios retiros.'
                  : 'Si no está tildado, solo ve sus propios retiros.'}
                {' '}Quien puede ver los retiros de todos también puede corregirlos y borrarlos; queda registrado en el Historial.
              </p>
            </div>
          )}
          {modulos.deposito && input.mantenimiento_rol === 'admin' && (
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400 }}>
                <input type="checkbox" checked={input.puede_ajustar_inventario} disabled={esUnoMismo} onChange={e => setInput(v => ({ ...v, puede_ajustar_inventario: e.target.checked }))} />
                Puede ajustar el inventario (Depósito)
              </label>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0 24px' }}>
                Puede sumar o restar stock de varios repuestos a la vez, para corregir lo que salió o entró sin anotarse.
                Cada ajuste queda registrado en el Historial y en el historial de cada repuesto; solo un dueño puede anularlo.
              </p>
            </div>
          )}
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-mid)', textTransform: 'uppercase', letterSpacing: '0.8px', margin: '4px 0 10px' }}>Permisos del panel de Configuración</div>
          {modulos.deposito && (
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400 }}>
                <input type="checkbox" checked={input.puede_gestionar_depositos} disabled={esUnoMismo} onChange={e => setInput(v => ({ ...v, puede_gestionar_depositos: e.target.checked }))} />
                Puede crear y editar depósitos
              </label>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0 24px' }}>
                Configuración → Depósito → Depósitos: crear depósitos (hasta el tope del plan) y cambiarles el nombre, el color, el ícono o la letra. Solo un dueño da este permiso.
              </p>
            </div>
          )}
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400 }}>
              <input type="checkbox" checked={input.puede_ver_errores} disabled={esUnoMismo} onChange={e => setInput(v => ({ ...v, puede_ver_errores: e.target.checked }))} />
              Puede ver el log de errores
            </label>
          </div>
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400 }}>
              <input type="checkbox" checked={input.puede_resetear_contrasenas} disabled={esUnoMismo} onChange={e => setInput(v => ({ ...v, puede_resetear_contrasenas: e.target.checked }))} />
              Puede resetear la contraseña de otros usuarios
            </label>
          </div>
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400 }}>
              <input type="checkbox" checked={input.puede_ver_sugerencias} disabled={esUnoMismo} onChange={e => setInput(v => ({ ...v, puede_ver_sugerencias: e.target.checked }))} />
              Puede ver las sugerencias de los usuarios
            </label>
          </div>
          <Button type="submit" variant="primary" style={{ width: '100%', justifyContent: 'center' }} disabled={saving}>Guardar</Button>
        </form>

        {usuario && !esUnoMismo && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16, paddingTop: 16, borderTop: '1.5px solid var(--border)' }}>
            <Button type="button" variant="ghost" size="sm" onClick={() => setResetPasswordOpen(true)}><Icono n="clave" /> Contraseña</Button>
            {isOwner(profile) && usuario.es_owner !== true && (
              <Button type="button" variant="ghost" size="sm" onClick={() => void handleAgregarDueno()}><Icono n="corona" /> Agregar como dueño</Button>
            )}
            {isOwner(profile) && usuario.es_owner === true && (
              <Button type="button" variant="ghost" size="sm" onClick={() => void handleQuitarDueno()}><Icono n="corona" /> Quitar como dueño</Button>
            )}
            {usuario.es_owner !== true && (
              <>
                <Button type="button" variant="dangerGhost" size="sm" onClick={() => void handleToggleActivo()}>
                  {usuario.activo !== false ? 'Bloquear' : 'Desbloquear'}
                </Button>
                <Button type="button" variant="dangerGhost" size="sm" onClick={() => void handleDelete()}>Eliminar</Button>
              </>
            )}
            {usuario.es_owner === true && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', width: '100%' }}>
                A un dueño no se lo puede bloquear ni eliminar. Para hacerlo, quitale primero el cargo de dueño.
              </p>
            )}
          </div>
        )}
      </Modal>
      <ResetPasswordModal open={resetPasswordOpen} onClose={() => setResetPasswordOpen(false)} usuario={usuario} />
    </>
  );
}
