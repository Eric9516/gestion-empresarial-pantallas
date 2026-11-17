import { useState, type ReactNode } from 'react';
import { usePedido } from '../../lib/usePedido';
import PermisosDeUsuario from './PermisosDeUsuario';
import PermisosEspeciales from './PermisosEspeciales';
import { useAlCambiar } from '../../lib/useAlCambiar';
import { useToast } from '../../components/ToastProvider';
import { useConfirm } from '../../components/ConfirmProvider';
import { isOwner } from '../../lib/types';
import ResetPasswordModal from './ResetPasswordModal';
import { useServicioDeUsuarios } from './servicioDeConfiguracion';
import type { Usuario, UsuarioInput } from './tipos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { mensajeDeError } from '@/lib/errores';
import { LARGO_MINIMO_CLAVE } from '../perfil/permisos';
import { Icono } from '@/components/Icono';

// La ficha de una persona: sus datos, dónde trabaja y con qué rol, sus permisos especiales y lo que se le puede hacer (contraseña, dueño,
// bloquear, eliminar). La usan la ventana flotante de la app de Vite (UsuarioForm) y la página propia de la app de Next
// (/configuracion/usuarios/…, pedido del dueño, 12/11/2026: con tantas opciones, la ventana quedaba chica). En la página, cada parte va en
// su bloque y "Guardar" queda fijo abajo.

interface Props {
  usuario: Usuario | null;
  /** Si está a la vista (la ventana abierta, o la página): al abrirse se cargan los datos de la persona. */
  activa: boolean;
  /**
   * Después de guardar, crear, bloquear, eliminar o cambiar el cargo de dueño: la ventana se cierra; la página se queda (y se actualiza) o,
   * si la persona es nueva o se eliminó, vuelve a la lista.
   */
  alTerminar: (que: 'guardado' | 'creado' | 'cambiado' | 'eliminado') => void;
  enPagina?: boolean;
}

const vacio: UsuarioInput = {
  nombre: '', apellido: '', email: '', rol: 'disabled', mantenimiento_rol: null, rol_equipos: null,
  puede_ver_retiros: false, puede_ver_errores: false, puede_resetear_contrasenas: false,
  puede_ver_sugerencias: false, puede_ajustar_inventario: false, puede_gestionar_depositos: false, puede_ver_auditoria: false, puede_ver_informe: false, puede_ver_calendario: false,
  depositos: [],
};

const TITULO_DE_PARTE = { fontSize: 12, fontWeight: 700, color: 'var(--text-mid)', textTransform: 'uppercase', letterSpacing: '0.8px', margin: '4px 0 10px' } as const;

export default function FichaDeUsuario({ usuario, activa, alTerminar, enPagina = false }: Props) {
  const toast = useToast();
  const confirmar = useConfirm();
  const { perfil: profile, modulos, usuarios, depositos: servicioDeDepositos } = useServicioDeUsuarios();
  // los depósitos, para la lista de permisos (solo con el Depósito prendido)
  const listaDeDepositos = usePedido(activa && modulos.deposito ? 'depositos-para-permisos' : null, servicioDeDepositos.leer, true);

  const [input, setInput] = useState<UsuarioInput>(vacio);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);

  const esUnoMismo = usuario?.id === profile?.id;
  // los dueños no tienen roles ni permisos: pueden todo
  const esDueno = usuario?.es_owner === true;

  useAlCambiar([activa, usuario], () => {
    if (!activa) return;
    setPassword('');
    setInput(usuario
      ? {
        nombre: usuario.nombre ?? '', apellido: usuario.apellido ?? '', email: usuario.email ?? '',
        rol: usuario.rol ?? 'user', mantenimiento_rol: usuario.mantenimiento_rol, rol_equipos: usuario.rol_equipos ?? null,
        puede_ver_retiros: usuario.puede_ver_retiros === true,
        puede_ver_errores: usuario.puede_ver_errores === true,
        puede_resetear_contrasenas: usuario.puede_resetear_contrasenas === true,
        puede_ver_sugerencias: usuario.puede_ver_sugerencias === true,
        puede_ajustar_inventario: usuario.puede_ajustar_inventario === true,
        puede_gestionar_depositos: usuario.puede_gestionar_depositos === true,
        puede_ver_auditoria: usuario.puede_ver_auditoria === true,
        puede_ver_informe: usuario.puede_ver_informe === true,
        puede_ver_calendario: usuario.puede_ver_calendario === true,
        // un dueño no lleva lista (puede todo): no se manda, así no se toca
        depositos: usuario.es_owner === true ? undefined : usuario.depositos ?? [],
      }
      : vacio);
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.nombre.trim() || !input.email.trim()) { toast('Nombre y email son obligatorios', 'error'); return; }
    if (input.rol === 'disabled' && input.mantenimiento_rol === null && input.rol_equipos === null) {
      toast('Dale al menos un permiso: elegí un área o un depósito, el rol, y tocá Agregar.', 'error');
      return;
    }

    setSaving(true);
    // Sin acceso al Depósito no hay retiros que ver: nunca queda tildado.
    const datos = { ...input, puede_ver_retiros: input.mantenimiento_rol !== null && input.puede_ver_retiros };
    try {
      if (!usuario) {
        if (!password || password.length < LARGO_MINIMO_CLAVE) { toast(`La contraseña debe tener al menos ${LARGO_MINIMO_CLAVE} caracteres`, 'error'); setSaving(false); return; }
        await usuarios.crear(datos, password);
        toast('Usuario creado', 'success');
        alTerminar('creado');
      } else {
        await usuarios.editar(usuario.id, datos);
        toast('Usuario actualizado', 'success');
        alTerminar('guardado');
      }
    } catch (e) {
      toast('Error: ' + mensajeDeError(e), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActivo() {
    if (!usuario) return;
    try {
      await usuarios.activar(usuario.id, !(usuario.activo !== false));
      toast(usuario.activo !== false ? 'Usuario bloqueado' : 'Usuario desbloqueado', 'success');
      alTerminar('cambiado');
    } catch {
      toast('Error al actualizar usuario', 'error');
    }
  }

  async function handleAgregarDueno() {
    if (!usuario) return;
    const nombre = usuario.nombre || usuario.email;
    if (!(await confirmar(`¿Agregar a ${nombre} como dueño del sistema? Va a tener los mismos poderes que vos: ver el historial completo, administrar usuarios y quitarte el cargo. Vos seguís siendo dueño.`, { textoConfirmar: 'Agregar como dueño', peligroso: true }))) return;
    try {
      await usuarios.agregarDueno(usuario.id);
      toast(`${nombre} ahora es dueño del sistema`, 'success');
      alTerminar('cambiado');
    } catch (e) {
      toast('Error: ' + mensajeDeError(e), 'error');
    }
  }

  async function handleQuitarDueno() {
    if (!usuario) return;
    const nombre = usuario.nombre || usuario.email;
    if (!(await confirmar(`¿Quitarle el cargo de dueño a ${nombre}? Va a seguir siendo usuario, con los roles que tenga asignados.`, { textoConfirmar: 'Quitar como dueño', peligroso: true }))) return;
    try {
      await usuarios.quitarDueno(usuario.id);
      toast(`${nombre} ya no es dueño del sistema`, 'success');
      alTerminar('cambiado');
    } catch (e) {
      toast('Error: ' + mensajeDeError(e), 'error');
    }
  }

  async function handleDelete() {
    if (!usuario) return;
    if (!(await confirmar('¿Eliminar este usuario definitivamente? Esta acción no se puede deshacer.', { textoConfirmar: 'Eliminar definitivamente', peligroso: true }))) return;
    try {
      await usuarios.eliminar(usuario.id);
      toast('Usuario eliminado', 'error');
      alTerminar('eliminado');
    } catch (e) {
      toast('Error: ' + mensajeDeError(e), 'error');
    }
  }

  // En la página, cada parte en su bloque con título; en la ventana, una debajo de la otra, como siempre.
  const parte = (id: string, titulo: string, contenido: ReactNode) => enPagina
    ? <section className="ficha-usuario-parte" aria-labelledby={`ficha-${id}`}><h3 id={`ficha-${id}`} className="ficha-usuario-titulo">{titulo}</h3>{contenido}</section>
    : <>{titulo && <div style={TITULO_DE_PARTE}>{titulo}</div>}{contenido}</>;

  const datos = (
    <div className="form-grid">
      <div className="form-group"><label htmlFor="usuario-form-1">Nombre</label><Input id="usuario-form-1" value={input.nombre} onChange={e => setInput(v => ({ ...v, nombre: e.target.value }))} /></div>
      <div className="form-group"><label htmlFor="usuario-form-2">Apellido</label><Input id="usuario-form-2" value={input.apellido} onChange={e => setInput(v => ({ ...v, apellido: e.target.value }))} /></div>
      <div className={`form-group${usuario ? ' full' : ''}`}><label htmlFor="usuario-form-3">Email</label><Input id="usuario-form-3" type="email" value={input.email} disabled={!!usuario} onChange={e => setInput(v => ({ ...v, email: e.target.value }))} /></div>
      {!usuario && (
        <div className="form-group"><label htmlFor="usuario-form-4">Contraseña</label><Input id="usuario-form-4" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={`Mínimo ${LARGO_MINIMO_CLAVE} caracteres`} /></div>
      )}
    </div>
  );

  const unoMismo = esUnoMismo && (
    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 16px' }}>
      No podés cambiar tu propio rol ni tus propios permisos desde acá — es a propósito, para que nunca te bloquees tu propia cuenta sin querer.
    </p>
  );

  const acciones = usuario && !esUnoMismo && (
    <>
      <div className="ficha-usuario-acciones">
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
      </div>
      {usuario.es_owner === true && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '8px 0 0' }}>
          A un dueño no se lo puede bloquear ni eliminar. Para hacerlo, quitale primero el cargo de dueño.
        </p>
      )}
    </>
  );

  return (
    <>
      <form onSubmit={e => void handleSubmit(e)} className={enPagina ? 'ficha-usuario' : undefined}>
        {parte('datos', enPagina ? 'Datos' : '', datos)}
        {esDueno
          ? parte('roles', 'Dónde trabaja y con qué rol',
            <p style={{ fontSize: 13, color: 'var(--text-mid)', margin: 0 }}><Icono n="corona" /> Es dueño del sistema: puede todo, en todas las áreas y todos los depósitos. No lleva roles ni permisos.</p>)
          : <>
            {parte('roles', enPagina ? 'Dónde trabaja y con qué rol' : 'Permisos', <>
              {unoMismo}
              <PermisosDeUsuario input={input} onChange={c => setInput(v => ({ ...v, ...c }))} modulos={modulos} deshabilitado={esUnoMismo}
                depositos={(listaDeDepositos.data ?? []).map(d => ({ id: d.id, nombre: d.nombre, activo: d.activo }))} />
            </>)}
            {parte('especiales', 'Permisos especiales',
              <PermisosEspeciales key={usuario?.id ?? 'nuevo'} input={input} onChange={c => setInput(v => ({ ...v, ...c }))} modulos={modulos} deshabilitado={esUnoMismo} />)}
          </>}
        {enPagina && acciones && parte('acciones', 'Acciones', acciones)}
        <div className={enPagina ? 'ficha-usuario-guardar' : undefined}>
          <Button type="submit" variant="primary" style={{ width: '100%', justifyContent: 'center' }} disabled={saving}>{usuario || !enPagina ? 'Guardar' : 'Crear usuario'}</Button>
        </div>
      </form>
      {!enPagina && acciones && <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1.5px solid var(--border)' }}>{acciones}</div>}
      <ResetPasswordModal open={resetPasswordOpen} onClose={() => setResetPasswordOpen(false)} usuario={usuario} />
    </>
  );
}
