'use client';
import { useEffect, useState, useTransition } from 'react';
import { Icono } from '@/components/Icono';
import { Button } from '@/components/ui/button';
import { CampoDeCantidad } from '@/components/ui/cantidad';
import { Input } from '@/components/ui/input';
import { cambiarEstado, cambiarLicencia, crearEmpresa, type LicenciaDeEmpresa, type UsuarioDeEmpresa, usuariosDeEmpresa } from './acciones';

export interface EmpresaDeLaPlataforma {
  id: string; nombre: string; activa: boolean; creada_at: string; usuarios: number; duenos: string | null;
  modulos: Record<string, boolean> | null; componentes: string[] | null; max_depositos: number | null; ultimo_uso: string | null; mia: boolean;
}

// Todos los módulos de la licencia (si faltara uno acá, guardar lo apagaría sin que se vea). Los componentes no se eligen: salen de los módulos.
const MODULOS = [
  ['proveedores', 'Proveedores'], ['comisionistas', 'Comisionistas'], ['envios', 'Envíos'], ['deposito', 'Depósito'],
  ['mantenimiento', 'Mantenimiento'], ['tareas', 'Tareas'],
] as const;
type Modulo = (typeof MODULOS)[number][0];
// Lo que necesita cada uno (src/lib/modulos.json): al prender uno se prende lo que necesita; al apagar uno, lo que depende de él
const NECESITA: Partial<Record<Modulo, Modulo>> = { envios: 'proveedores', mantenimiento: 'deposito' };
const LICENCIA_NUEVA: LicenciaDeEmpresa = {
  modulos: { proveedores: true, comisionistas: true, envios: true, deposito: true, mantenimiento: false, tareas: true },
  maxDepositos: 1,
};
const deLaEmpresa = (e: EmpresaDeLaPlataforma): LicenciaDeEmpresa => ({
  modulos: Object.fromEntries(MODULOS.map(([m]) => [m, e.modulos?.[m] === true])) as LicenciaDeEmpresa['modulos'],
  maxDepositos: e.max_depositos ?? 1,
});
function cambiarModulo(modulos: LicenciaDeEmpresa['modulos'], m: Modulo, prendido: boolean): LicenciaDeEmpresa['modulos'] {
  const nuevos = { ...modulos, [m]: prendido };
  if (prendido && NECESITA[m]) nuevos[NECESITA[m]] = true;
  if (!prendido) for (const [hijo, padre] of Object.entries(NECESITA)) if (padre === m) nuevos[hijo as Modulo] = false;
  return nuevos;
}
const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

/** Los módulos y el tope de depósitos de una empresa. */
function EditorDeLicencia({ valor, onCambio }: { valor: LicenciaDeEmpresa; onCambio: (l: LicenciaDeEmpresa) => void }) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
        <legend className="form-label" style={{ marginBottom: 4 }}>Módulos</legend>
        {MODULOS.map(([m, nombre]) => (
          <label key={m} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={valor.modulos[m]} onChange={e => onCambio({ ...valor, modulos: cambiarModulo(valor.modulos, m, e.target.checked) })} />
            {nombre}
          </label>
        ))}
      </fieldset>
      <label style={{ display: 'grid', gap: 4, maxWidth: 220 }}>
        <span className="form-label">Depósitos (máximo)</span>
        <CampoDeCantidad max={100} valor={valor.maxDepositos} onCambio={n => onCambio({ ...valor, maxDepositos: n })} />
      </label>
    </div>
  );
}

/** Los usuarios de una empresa, con los dueños primero y marcados. Se piden al abrir la lista. */
function UsuariosDeLaEmpresa({ empresa }: { empresa: string }) {
  const [usuarios, setUsuarios] = useState<UsuarioDeEmpresa[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let vigente = true;
    usuariosDeEmpresa(empresa).then(u => { if (vigente) setUsuarios(u); }, () => { if (vigente) setError(true); });
    return () => { vigente = false; };
  }, [empresa]);
  if (error) return <p role="alert" style={{ color: 'var(--danger)', margin: 0 }}>No se pudieron leer los usuarios.</p>;
  if (!usuarios) return <p style={{ color: 'var(--text-muted)', margin: 0 }}>Cargando usuarios…</p>;
  return (
    <ul aria-label="Usuarios de la empresa" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
      {usuarios.map(u => (
        <li key={u.id} style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', alignItems: 'baseline', opacity: u.activo ? 1 : 0.6 }}>
          <span style={{ fontWeight: u.es_owner ? 700 : 500 }}>{u.nombre ?? u.email}</span>
          {u.es_owner && <span className="badge badge-rubro">dueño</span>}
          {!u.activo && <span className="badge">desactivado</span>}
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{u.email} · último uso {fecha(u.ultimo_uso)}</span>
        </li>
      ))}
    </ul>
  );
}

function FilaDeEmpresa({ empresa }: { empresa: EmpresaDeLaPlataforma }) {
  const [editando, setEditando] = useState(false);
  const [viendoUsuarios, setViendoUsuarios] = useState(false);
  const [licencia, setLicencia] = useState(() => deLaEmpresa(empresa));
  const [error, setError] = useState<string | null>(null);
  const [ocupado, empezar] = useTransition();
  const hacer = (accion: () => Promise<{ error: string | null }>, alTerminar?: () => void) => empezar(async () => {
    setError(null);
    const r = await accion();
    if (r.error) setError(r.error); else alTerminar?.();
  });
  const activos = MODULOS.filter(([m]) => empresa.modulos?.[m]).map(([, n]) => n).join(', ') || 'ninguno';
  return (
    <li className="card" style={{ padding: 16, display: 'grid', gap: 10, opacity: empresa.activa ? 1 : 0.7 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <strong style={{ fontSize: 16 }}>{empresa.nombre}</strong>
          {empresa.mia && <span className="badge badge-rubro" style={{ marginLeft: 8 }}>la tuya</span>}
          {!empresa.activa && <span className="badge" style={{ marginLeft: 8, background: 'var(--danger-bg)', color: 'var(--danger)' }}>desactivada</span>}
          <div style={{ fontSize: 14, marginTop: 4 }}>
            <span style={{ color: 'var(--text-muted)' }}>{(empresa.duenos ?? '').includes(',') ? 'Dueños' : 'Dueño'}:</span> <strong>{empresa.duenos ?? '—'}</strong>
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            {empresa.usuarios} {empresa.usuarios === 1 ? 'usuario' : 'usuarios'} · desde {fecha(empresa.creada_at)} · último uso {fecha(empresa.ultimo_uso)}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Módulos: {activos} · hasta {empresa.max_depositos ?? 1} depósitos</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" size="sm" aria-expanded={viendoUsuarios} onClick={() => setViendoUsuarios(v => !v)}><Icono n="usuarios" /> Usuarios</Button>
          <Button variant="ghost" size="sm" onClick={() => setEditando(v => !v)}><Icono n="editar" /> Licencia</Button>
          {!empresa.mia && (
            <Button variant={empresa.activa ? 'dangerGhost' : 'ghost'} size="sm" disabled={ocupado}
              onClick={() => {
                if (empresa.activa && !confirm(`¿Desactivar ${empresa.nombre}? Nadie de esa empresa va a poder entrar (sus datos quedan).`)) return;
                hacer(() => cambiarEstado(empresa.id, !empresa.activa));
              }}>
              {empresa.activa ? 'Desactivar' : 'Activar'}
            </Button>
          )}
        </div>
      </div>
      {viendoUsuarios && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}><UsuariosDeLaEmpresa empresa={empresa.id} /></div>
      )}
      {editando && (
        <div style={{ display: 'grid', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          <EditorDeLicencia valor={licencia} onCambio={setLicencia} />
          <div><Button variant="primary" size="sm" disabled={ocupado} onClick={() => hacer(() => cambiarLicencia(empresa.id, licencia), () => setEditando(false))}>
            Guardar licencia
          </Button></div>
        </div>
      )}
      {error && <p role="alert" style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>}
    </li>
  );
}

function EmpresaNueva() {
  const [abierta, setAbierta] = useState(false);
  const [datos, setDatos] = useState({ nombre: '', dueno: '', email: '' });
  const [licencia, setLicencia] = useState(LICENCIA_NUEVA);
  const [error, setError] = useState<string | null>(null);
  const [lista, setLista] = useState<{ email: string; contrasena: string } | null>(null);
  const [ocupado, empezar] = useTransition();
  if (lista) return (
    <div className="card" role="status" style={{ padding: 16, display: 'grid', gap: 8, borderLeft: '4px solid var(--success)' }}>
      <strong>Empresa creada. Pasale al dueño estos datos para entrar (la contraseña se ve solo ahora):</strong>
      <div>Correo: <code>{lista.email}</code></div>
      <div>Contraseña: <code style={{ fontSize: 16 }}>{lista.contrasena}</code></div>
      <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Que la cambie en Mi perfil la primera vez que entre.</div>
      <div><Button variant="ghost" size="sm" onClick={() => { setLista(null); setAbierta(false); setDatos({ nombre: '', dueno: '', email: '' }); setLicencia(LICENCIA_NUEVA); }}>Listo</Button></div>
    </div>
  );
  if (!abierta) return <div><Button variant="primary" onClick={() => setAbierta(true)}><Icono n="mas" /> Nueva empresa</Button></div>;
  return (
    <form className="card" style={{ padding: 16, display: 'grid', gap: 12 }}
      onSubmit={e => {
        e.preventDefault();
        empezar(async () => {
          setError(null);
          const r = await crearEmpresa(datos, licencia);
          if (r.error || !r.contrasena) setError(r.error ?? 'No se pudo crear la empresa');
          else setLista({ email: datos.email.trim().toLowerCase(), contrasena: r.contrasena });
        });
      }}>
      <strong>Nueva empresa</strong>
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <label style={{ display: 'grid', gap: 4 }}><span className="form-label">Nombre de la empresa</span>
          <Input required maxLength={120} value={datos.nombre} onChange={e => setDatos({ ...datos, nombre: e.target.value })} /></label>
        <label style={{ display: 'grid', gap: 4 }}><span className="form-label">Nombre del dueño</span>
          <Input required maxLength={120} value={datos.dueno} onChange={e => setDatos({ ...datos, dueno: e.target.value })} /></label>
        <label style={{ display: 'grid', gap: 4 }}><span className="form-label">Correo del dueño</span>
          <Input required type="email" maxLength={200} value={datos.email} onChange={e => setDatos({ ...datos, email: e.target.value })} /></label>
      </div>
      <EditorDeLicencia valor={licencia} onCambio={setLicencia} />
      {error && <p role="alert" style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <Button type="submit" variant="primary" disabled={ocupado}>{ocupado ? 'Creando…' : 'Crear empresa'}</Button>
        <Button type="button" variant="ghost" onClick={() => setAbierta(false)}>Cancelar</Button>
      </div>
    </form>
  );
}

// El panel: las empresas (con su licencia y si están activas) y el alta de una nueva con su dueño.
export default function PanelDePlataforma({ empresas }: { empresas: EmpresaDeLaPlataforma[] }) {
  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 960 }}>
      <div className="section-header">
        <div className="section-title"><Icono n="empresa" /> Empresas ({empresas.length})</div>
      </div>
      <EmpresaNueva />
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
        {empresas.map(e => <FilaDeEmpresa key={e.id} empresa={e} />)}
      </ul>
    </div>
  );
}
