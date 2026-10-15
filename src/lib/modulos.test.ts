import { describe, expect, it } from 'vitest';
import { MODULOS, TODOS_ACTIVOS, dependientesEnUso, efectivos, hayModulosDeDirectorio, integraciones, normalizarModulos, requisitosFaltantes, resolverModulos, type Modulos } from './modulos';

const todos = (): Modulos => ({ ...TODOS_ACTIVOS });

describe('normalizarModulos (lo que no figura expresamente activo, está apagado)', () => {
  it('sin licencia o con un dato inválido no hay ningún módulo activo', () => {
    for (const v of [undefined, null, {}, [], 'x', 5]) {
      const m = normalizarModulos(v);
      expect(MODULOS.every(mod => m[mod.id] === false)).toBe(true);
    }
  });

  it('solo cuenta como activo lo que dice true de forma expresa', () => {
    const m = normalizarModulos({ proveedores: true, tareas: 1, comisionistas: 'si', envios: null, deposito: false });
    expect(m.proveedores).toBe(true);
    expect(m.tareas).toBe(false);
    expect(m.comisionistas).toBe(false);
    expect(m.envios).toBe(false);
    expect(m.deposito).toBe(false);
  });

  it('un módulo nuevo que no está en la licencia nace apagado', () => {
    // Una licencia de antes de que existiera un módulo: lista solo los que tenía.
    const licenciaVieja = Object.fromEntries(MODULOS.slice(0, -1).map(m => [m.id, true]));
    const m = normalizarModulos(licenciaVieja);
    expect(m[MODULOS.at(-1)!.id]).toBe(false);
    expect(MODULOS.slice(0, -1).every(mod => m[mod.id] === true)).toBe(true);
  });

  it('ignora claves desconocidas y devuelve siempre todas las conocidas', () => {
    const m = normalizarModulos({ inventado: true, deposito: true });
    expect(Object.keys(m).sort()).toEqual(MODULOS.map(x => x.id).sort());
    expect(m.deposito).toBe(true);
    expect(Object.keys(m).includes('inventado')).toBe(false);
  });
});

describe('TODOS_ACTIVOS', () => {
  it('es lo que se usa solo mientras la licencia no se pudo leer, y tiene todos los módulos', () => {
    expect(MODULOS.every(m => TODOS_ACTIVOS[m.id] === true)).toBe(true);
  });
});

describe('módulos.json', () => {
  it('cada módulo declara a qué componente pertenece (Tareas es de la Base, Mantenimiento tiene el suyo)', () => {
    expect(MODULOS.every(m => ['base', 'abastecimiento', 'mantenimiento'].includes(m.componente))).toBe(true);
    expect(MODULOS.find(m => m.id === 'tareas')!.componente).toBe('base');
    expect(MODULOS.find(m => m.id === 'mantenimiento')!.componente).toBe('mantenimiento');
    expect(MODULOS.find(m => m.id === 'deposito')!.componente).toBe('abastecimiento');
  });
  it('un módulo nunca depende de otro de un componente "más alto" (la Base no necesita nada de afuera)', () => {
    const orden = ['base', 'abastecimiento', 'mantenimiento'];
    for (const m of MODULOS) for (const r of m.requiere) {
      expect(orden.indexOf(MODULOS.find(x => x.id === r)!.componente)).toBeLessThanOrEqual(orden.indexOf(m.componente));
    }
  });
  it('cada dependencia apunta a un módulo que existe y ninguno se requiere a sí mismo', () => {
    const ids = new Set(MODULOS.map(m => m.id));
    for (const m of MODULOS) {
      expect(m.requiere.every(r => ids.has(r) && r !== m.id)).toBe(true);
    }
  });
});

describe('efectivos', () => {
  it('Envíos se apaga solo si falta Proveedores', () => {
    const m = efectivos({ ...todos(), proveedores: false });
    expect(m.envios).toBe(false);
    expect(m.deposito).toBe(true);
    expect(m.tareas).toBe(true);
  });
  it('no cambia nada si las dependencias están completas', () => {
    expect(efectivos(todos())).toEqual(todos());
  });
});

describe('integraciones', () => {
  it('proveedores por repuesto necesitan Depósito y Proveedores', () => {
    expect(integraciones(todos()).depositoConProveedores).toBe(true);
    expect(integraciones({ ...todos(), proveedores: false }).depositoConProveedores).toBe(false);
    expect(integraciones({ ...todos(), deposito: false }).depositoConProveedores).toBe(false);
  });
  it('las reparaciones son del Depósito: necesitan Depósito y Proveedores, y no dependen de Mantenimiento', () => {
    expect(integraciones(todos()).reparaciones).toBe(true);
    expect(integraciones({ ...todos(), mantenimiento: false }).reparaciones).toBe(true);
    expect(integraciones({ ...todos(), deposito: false }).reparaciones).toBe(false);
    expect(integraciones({ ...todos(), proveedores: false }).reparaciones).toBe(false);
  });
  it('apagar el Depósito apaga también Mantenimiento (lo necesita)', () => {
    expect(efectivos({ ...todos(), deposito: false }).mantenimiento).toBe(false);
  });
  it('elegir comisionista en un envío necesita Envíos y Comisionistas', () => {
    expect(integraciones(todos()).enviosConComisionistas).toBe(true);
    expect(integraciones({ ...todos(), comisionistas: false }).enviosConComisionistas).toBe(false);
    expect(integraciones({ ...todos(), envios: false }).enviosConComisionistas).toBe(false);
  });
});

describe('hayModulosDeDirectorio', () => {
  it('es falso solo si los cuatro módulos del Directorio están apagados', () => {
    const apagado = { proveedores: false, comisionistas: false, envios: false, tareas: false, deposito: true, mantenimiento: true };
    expect(hayModulosDeDirectorio(apagado)).toBe(false);
    expect(hayModulosDeDirectorio({ ...apagado, tareas: true })).toBe(true);
    expect(hayModulosDeDirectorio({ ...apagado, comisionistas: true })).toBe(true);
  });
  it('Envíos sin Proveedores no cuenta (no puede funcionar)', () => {
    expect(hayModulosDeDirectorio({ proveedores: false, comisionistas: false, envios: true, tareas: false, deposito: true, mantenimiento: true })).toBe(false);
  });
});

describe('resolverModulos (licencia + componentes instalados + interruptor del dueño)', () => {
  const todosLic = Object.fromEntries(MODULOS.map(m => [m.id, true]));
  const COMPS = ['base', 'abastecimiento', 'mantenimiento'];

  it('con todo incluido y nada apagado, todo está activo', () => {
    const e = resolverModulos(todosLic, COMPS, {});
    expect(MODULOS.every(m => e.activos[m.id] && e.contratados[m.id])).toBe(true);
    expect(e.apagados).toEqual({});
  });
  it('lo que el dueño apaga deja de estar activo, pero sigue contratado', () => {
    const e = resolverModulos(todosLic, COMPS, { comisionistas: true });
    expect(e.activos.comisionistas).toBe(false);
    expect(e.contratados.comisionistas).toBe(true);
    expect(e.apagados).toEqual({ comisionistas: true });
    expect(e.activos.tareas).toBe(true);
  });
  it('si apaga algo que otros necesitan, los otros se apagan también', () => {
    const e = resolverModulos(todosLic, COMPS, { proveedores: true });
    expect(e.activos.envios).toBe(false);
    const f = resolverModulos(todosLic, COMPS, { deposito: true });
    expect(f.activos.mantenimiento).toBe(false);
  });
  it('un módulo que la licencia no incluye no se puede prender desde el interruptor', () => {
    const e = resolverModulos({ ...todosLic, comisionistas: false }, COMPS, {});
    expect(e.contratados.comisionistas).toBe(false);
    expect(e.activos.comisionistas).toBe(false);
  });
  it('lo apagado de algo que no está contratado se ignora', () => {
    const e = resolverModulos({ ...todosLic, comisionistas: false }, COMPS, { comisionistas: true });
    expect(e.apagados).toEqual({});
  });
  it('un módulo cuyo componente no está instalado no cuenta, aunque la licencia lo diga', () => {
    const e = resolverModulos(todosLic, ['base'], {});
    expect(e.activos.tareas).toBe(true);
    expect(e.activos.proveedores).toBe(false);
    expect(e.activos.mantenimiento).toBe(false);
  });
  it('si no se conoce la lista de componentes (instalación de antes), manda solo la licencia', () => {
    for (const comps of [null, undefined, 'x', 5]) {
      const e = resolverModulos(todosLic, comps, {});
      expect(MODULOS.every(m => e.activos[m.id])).toBe(true);
    }
  });
  it('datos inválidos del interruptor no apagan nada', () => {
    for (const v of [null, undefined, [], 'x', { tareas: 'si' }, { tareas: 1 }]) {
      expect(resolverModulos(todosLic, COMPS, v).activos.tareas).toBe(true);
    }
  });
});

describe('ayudas de dependencias para la pantalla del dueño', () => {
  it('dice qué módulos en uso necesitan a otro', () => {
    expect(dependientesEnUso('proveedores', todos()).map(m => m.id)).toEqual(['envios']);
    expect(dependientesEnUso('proveedores', { ...todos(), envios: false }).map(m => m.id)).toEqual([]);
    expect(dependientesEnUso('deposito', todos()).map(m => m.id)).toEqual(['mantenimiento']);
  });
  it('dice qué le falta prender a un módulo', () => {
    expect(requisitosFaltantes('envios', { ...todos(), proveedores: false }).map(m => m.id)).toEqual(['proveedores']);
    expect(requisitosFaltantes('envios', todos())).toEqual([]);
    expect(requisitosFaltantes('tareas', { ...todos(), proveedores: false })).toEqual([]);
  });
});
