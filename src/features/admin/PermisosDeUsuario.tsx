import { useId, useState } from 'react';
import type { Modulos } from '../../lib/modulos';
import { hayModulosDeDirectorio } from '../../lib/modulos';
import type { PermisoDeDeposito, UsuarioInput } from './tipos';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Icono } from '@/components/Icono';

// Los permisos de una persona como una lista de "dónde y con qué rol" (pedido del encargado): se elige el lugar (un área o un depósito) y
// el rol, se agrega, y abajo se ve todo lo que tiene. Un rol por lugar: volver a elegir el mismo lugar cambia el rol. Los dueños no tienen
// lista: pueden todo.

export interface DepositoParaPermisos { id: string; nombre: string; activo: boolean }

type Lugar = 'directorio' | 'mantenimiento' | `dep:${string}`;

const ROLES: Record<'directorio' | 'mantenimiento' | 'deposito', [string, string][]> = {
  directorio: [['user', 'Usuario'], ['admin', 'Administrador']],
  mantenimiento: [['consulta', 'Solo consulta'], ['tecnico', 'Técnico'], ['jefe', 'Jefe de taller'], ['admin', 'Responsable (administrador)']],
  deposito: [['comun', 'Usuario'], ['admin', 'Administrador']],
};
const tipoDe = (l: Lugar) => (l.startsWith('dep:') ? 'deposito' : l) as keyof typeof ROLES;
const nombreDelRol = (l: Lugar, rol: string) => ROLES[tipoDe(l)].find(([v]) => v === rol)?.[1] ?? rol;

const AYUDA: Record<string, string> = {
  'directorio:user': 'Directorio: ve y carga proveedores, envíos y lo demás de su módulo.',
  'directorio:admin': 'Directorio: además, edita y borra.',
  'mantenimiento:consulta': 'Mantenimiento: ve los equipos, sus manuales y su historial, sin cambiar nada (por ejemplo, alguien de Producción).',
  'mantenimiento:tecnico': 'Mantenimiento: ve los equipos, sus manuales y su historial, hace las OT que le asignan y carga las correctivas de guardia.',
  'mantenimiento:jefe': 'Mantenimiento: además, asigna las OT a los técnicos, las revisa y las devuelve si falta algo.',
  'mantenimiento:admin': 'Mantenimiento: el responsable. Deriva las OT al jefe de taller y las aprueba; carga y edita los equipos, sus sectores, repuestos críticos y manuales, y puede borrar.',
  'deposito:comun': 'En ese depósito: busca artículos y retira.',
  'deposito:admin': 'En ese depósito: además, crea y edita artículos, y (con el permiso de abajo) carga y ajusta el stock.',
};

/** El resumen que guarda el perfil (mantenimiento_rol): Administrador si administra algún depósito, Usuario si tiene alguno. */
const rolDeDepositoResumido = (lista: PermisoDeDeposito[]): 'admin' | 'comun' | null =>
  lista.some(d => d.rol === 'admin') ? 'admin' : lista.length ? 'comun' : null;

interface Props {
  input: UsuarioInput;
  onChange: (cambios: Partial<UsuarioInput>) => void;
  modulos: Modulos;
  depositos: DepositoParaPermisos[];
  deshabilitado: boolean;
}

export default function PermisosDeUsuario({ input, onChange, modulos, depositos, deshabilitado }: Props) {
  const uid = useId();
  const conDirectorio = hayModulosDeDirectorio(modulos);
  const lugares: { valor: Lugar; nombre: string; grupo: 'Áreas' | 'Depósitos' }[] = [
    ...(conDirectorio ? [{ valor: 'directorio' as const, nombre: 'Directorio', grupo: 'Áreas' as const }] : []),
    ...(modulos.mantenimiento ? [{ valor: 'mantenimiento' as const, nombre: 'Mantenimiento', grupo: 'Áreas' as const }] : []),
    ...(modulos.deposito ? depositos.filter(d => d.activo).map(d => ({ valor: `dep:${d.id}` as Lugar, nombre: d.nombre, grupo: 'Depósitos' as const })) : []),
  ];
  const [lugar, setLugar] = useState<Lugar | ''>('');
  const [rol, setRol] = useState('');
  const lista = input.depositos ?? [];

  // lo que tiene, como filas
  const filas: { lugar: Lugar; nombre: string; grupo: 'Áreas' | 'Depósitos'; rol: string }[] = [
    ...(conDirectorio && input.rol !== 'disabled' ? [{ lugar: 'directorio' as Lugar, nombre: 'Directorio', grupo: 'Áreas' as const, rol: input.rol }] : []),
    ...(modulos.mantenimiento && input.rol_equipos ? [{ lugar: 'mantenimiento' as Lugar, nombre: 'Mantenimiento', grupo: 'Áreas' as const, rol: input.rol_equipos }] : []),
    ...(modulos.deposito ? lista.map(d => ({ lugar: `dep:${d.deposito_id}` as Lugar, nombre: depositos.find(x => x.id === d.deposito_id)?.nombre ?? 'Depósito', grupo: 'Depósitos' as const, rol: d.rol })) : []),
  ];

  function poner(l: Lugar, r: string | null) {
    if (l === 'directorio') onChange({ rol: r ?? 'disabled' });
    // sin rol en Mantenimiento no hay calendario que ver
    else if (l === 'mantenimiento') onChange({ rol_equipos: r, ...(r === null ? { puede_ver_calendario: false } : {}) });
    else {
      const id = l.slice(4);
      const nueva = r === null ? lista.filter(d => d.deposito_id !== id)
        : lista.some(d => d.deposito_id === id) ? lista.map(d => (d.deposito_id === id ? { ...d, rol: r as 'admin' | 'comun' } : d))
          : [...lista, { deposito_id: id, rol: r as 'admin' | 'comun' }];
      const resumen = rolDeDepositoResumido(nueva);
      // sin ningún depósito no hay retiros que ver ni stock que ajustar; sin administrar ninguno, tampoco ajustar
      onChange({
        depositos: nueva, mantenimiento_rol: resumen,
        ...(resumen === null ? { puede_ver_retiros: false, puede_ajustar_inventario: false, puede_ver_informe: false } : {}),
        ...(resumen !== 'admin' ? { puede_ajustar_inventario: false } : {}),
      });
    }
  }

  function agregar() {
    if (!lugar || !rol) return;
    poner(lugar, rol);
    setLugar('');
    setRol('');
  }

  const grupos = (['Áreas', 'Depósitos'] as const).map(g => ({ g, filas: filas.filter(f => f.grupo === g) })).filter(x => x.filas.length);

  return (
    <div className="permisos">
      <div className="permisos-agregar">
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label htmlFor={`${uid}-d`}>Dónde</label>
          <Select id={`${uid}-d`} value={lugar} disabled={deshabilitado} onChange={e => { setLugar(e.target.value as Lugar | ''); setRol(''); }}>
            <option value="">Elegí un área o un depósito</option>
            {(['Áreas', 'Depósitos'] as const).map(g => lugares.some(x => x.grupo === g) && (
              <optgroup key={g} label={g}>
                {lugares.filter(x => x.grupo === g).map(x => <option key={x.valor} value={x.valor}>{x.nombre}</option>)}
              </optgroup>
            ))}
          </Select>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label htmlFor={`${uid}-r`}>Rol</label>
          <Select id={`${uid}-r`} value={rol} disabled={deshabilitado || !lugar} onChange={e => setRol(e.target.value)}>
            <option value="">{lugar ? 'Elegí el rol' : '—'}</option>
            {lugar && ROLES[tipoDe(lugar)].map(([v, n]) => <option key={v} value={v}>{n}</option>)}
          </Select>
        </div>
        <Button type="button" variant="primary" disabled={deshabilitado || !lugar || !rol} onClick={agregar}><Icono n="mas" /> Agregar</Button>
      </div>
      {lugar && rol && <p className="permisos-ayuda">{AYUDA[`${tipoDe(lugar)}:${rol}`]}{filas.some(f => f.lugar === lugar) && ' Ya tiene un rol ahí: se cambia por este.'}</p>}

      <div className="permisos-lista" aria-label="Lo que tiene esta persona">
        {!grupos.length && <p className="permisos-ayuda">Todavía no tiene ningún permiso: elegí dónde y con qué rol, y tocá Agregar.</p>}
        {grupos.map(({ g, filas: deGrupo }) => (
          <div key={g}>
            <div className="permisos-grupo">{g}</div>
            {deGrupo.map(f => (
              <div key={f.lugar} className="permisos-fila">
                <span className="permisos-nombre">{f.nombre}</span>
                <Select aria-label={`Rol en ${f.nombre}`} value={f.rol} disabled={deshabilitado} onChange={e => poner(f.lugar, e.target.value)} className="permisos-rol w-auto">
                  {ROLES[tipoDe(f.lugar)].map(([v, n]) => <option key={v} value={v}>{n}</option>)}
                </Select>
                <Button type="button" variant="dangerGhost" size="icon" disabled={deshabilitado} title="Quitar" aria-label={`Quitar ${f.nombre} (${nombreDelRol(f.lugar, f.rol)})`}
                  onClick={() => poner(f.lugar, null)}><Icono n="cerrar" /></Button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
