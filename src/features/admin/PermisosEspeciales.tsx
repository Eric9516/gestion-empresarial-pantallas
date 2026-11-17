import { useId, useState } from 'react';
import type { Modulos } from '../../lib/modulos';
import type { UsuarioInput } from './tipos';
import { Icono } from '@/components/Icono';

// Los permisos sueltos de una persona (además del rol en cada lugar), agrupados por área en desplegables (pedido del dueño, 12/11/2026:
// la lista larga se volvía difícil de leer). Cerrado, cada grupo dice cuántos tiene; arranca abierto el que tiene alguno. Para sumar un
// permiso, se agrega una línea en su grupo. No cambia qué hace cada uno: solo cómo se muestran.

type Permiso = 'puede_ver_retiros' | 'puede_ajustar_inventario' | 'puede_ver_informe' | 'puede_gestionar_depositos' | 'puede_ver_auditoria'
  | 'puede_ver_calendario' | 'puede_ver_errores' | 'puede_resetear_contrasenas' | 'puede_ver_sugerencias';

interface Item { campo: Permiso; nombre: string; ayuda?: string; soloDueno?: boolean }
interface Grupo { id: string; nombre: string; items: Item[] }

/** Qué permisos se pueden dar según la empresa (módulos) y lo que ya tiene la persona (sin depósitos no hay retiros que ver, etc.). */
function gruposDePermisos(input: UsuarioInput, modulos: Modulos): Grupo[] {
  const conDeposito = modulos.deposito && input.mantenimiento_rol !== null;
  const grupos: Grupo[] = [
    {
      id: 'deposito', nombre: 'Depósito y Compras',
      items: !modulos.deposito ? [] : [
        ...(conDeposito ? [{
          campo: 'puede_ver_retiros' as const, nombre: 'Ver los retiros de todos',
          ayuda: `${input.mantenimiento_rol === 'admin' ? 'Lo tienen por defecto quienes administran un depósito. ' : ''}Si no, solo ve los suyos. Puede corregirlos y borrarlos; queda en el Historial.`,
        }] : []),
        ...(conDeposito && input.mantenimiento_rol === 'admin' ? [{
          campo: 'puede_ajustar_inventario' as const, nombre: 'Ajustar el inventario',
          ayuda: 'En los depósitos que administra: suma o resta stock de varios artículos a la vez. Queda en el Historial; solo un dueño lo anula.',
        }] : []),
        ...(conDeposito && !input.puede_gestionar_depositos ? [{
          campo: 'puede_ver_informe' as const, nombre: 'Ver el informe de reposición',
          ayuda: 'Qué artículos llegaron al punto de pedido. Es tarea de Compras: tildalo si esta persona también compra para su depósito.',
        }] : []),
        {
          campo: 'puede_gestionar_depositos', nombre: 'Administrador de Compras', soloDueno: true,
          ayuda: 'Crea y edita los depósitos, decide cómo trabaja cada uno y ve el informe de reposición.',
        },
        {
          campo: 'puede_ver_auditoria', nombre: 'Ver la auditoría (Historial)', soloDueno: true,
          ayuda: 'Qué se cargó, retiró o cambió, quién y cuándo, de sus depósitos y el Directorio, con descarga en Excel y PDF.',
        },
      ],
    },
    {
      // (solo para quien tiene un rol en Mantenimiento: sin él no entra al área)
      id: 'mantenimiento', nombre: 'Mantenimiento',
      items: !modulos.mantenimiento || !input.rol_equipos ? [] : [
        {
          campo: 'puede_ver_calendario', nombre: 'Ver el calendario', soloDueno: true,
          ayuda: 'Mantenimiento → Calendario: las OT de cada día y las rutinas preventivas. Sin el permiso, las OT se siguen viendo en Órdenes de trabajo.',
        },
      ],
    },
    {
      id: 'sistema', nombre: 'Sistema',
      items: [
        { campo: 'puede_resetear_contrasenas', nombre: 'Cambiar la contraseña de otros usuarios' },
        { campo: 'puede_ver_sugerencias', nombre: 'Ver las sugerencias de los usuarios' },
        { campo: 'puede_ver_errores', nombre: 'Ver el registro de errores' },
      ],
    },
  ];
  return grupos.filter(g => g.items.length);
}

interface Props {
  input: UsuarioInput;
  onChange: (cambios: Partial<UsuarioInput>) => void;
  modulos: Modulos;
  deshabilitado: boolean;
}

export default function PermisosEspeciales({ input, onChange, modulos, deshabilitado }: Props) {
  const uid = useId();
  // lo que abrió o cerró la persona; mientras no toque un grupo, está abierto si tiene algún permiso tildado (y al tildar o destildar uno,
  // su grupo queda abierto: si no, al sacar el último se cerraría solo)
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});
  return (
    <div className="permisos-extra">
      {gruposDePermisos(input, modulos).map(g => {
        const tiene = g.items.filter(i => input[i.campo]).length;
        const abierto = abiertos[g.id] ?? tiene > 0;
        const panel = `${uid}-${g.id}`;
        return (
          <div key={g.id} className="permisos-extra-grupo">
            <button type="button" className="permisos-extra-titulo" aria-expanded={abierto} aria-controls={panel}
              onClick={() => setAbiertos(a => ({ ...a, [g.id]: !abierto }))}>
              <Icono n={abierto ? 'abajo' : 'desplegar'} />
              <span className="permisos-extra-nombre">{g.nombre}</span>
              <span className={`permisos-extra-cuenta${tiene ? ' con' : ''}`}>{tiene} de {g.items.length}</span>
            </button>
            {abierto && (
              <div id={panel} className="permisos-extra-items">
                {g.items.map(i => (
                  <label key={i.campo} className="permisos-extra-item">
                    <input type="checkbox" checked={input[i.campo]} disabled={deshabilitado} onChange={e => { setAbiertos(x => ({ ...x, [g.id]: true })); onChange({ [i.campo]: e.target.checked }); }} />
                    <span>
                      <span className="permisos-extra-item-nombre">{i.nombre}</span>
                      {i.soloDueno && <span className="permisos-extra-dueno"><Icono n="corona" /> Solo lo da un dueño</span>}
                      {i.ayuda && <span className="permisos-extra-ayuda">{i.ayuda}</span>}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
