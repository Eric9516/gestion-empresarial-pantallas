import { describe, expect, it } from 'vitest';
import { fechaCorta, LARGO_MINIMO_CLAVE, permisosDe, problemaDeLaClave } from './permisos';
import type { Profile } from '../../lib/types';

const perfil = (extra: Partial<Profile> = {}): Profile => ({
  access_expires_at: null, access_status: 'active', activo: true, apellido: null, created_at: null, email: 'a@b.test', es_owner: false, id: 'u1',
  last_login_at: null, mantenimiento_rol: null, rol_equipos: null, nombre: 'A', puede_ajustar_inventario: false, puede_gestionar_depositos: false, puede_ver_auditoria: false, puede_ver_informe: false, puede_ver_calendario: false, preferencias: {}, puede_resetear_contrasenas: false,
  puede_ver_errores: false, puede_ver_retiros: false, puede_ver_sugerencias: false, rol: 'user', updated_at: null, ...extra,
});
const tiene = (p: Profile, clave: string, deposito = true) => permisosDe({ profile: p, deposito }).find(x => x.clave === clave)?.tiene;

describe('permisosDe', () => {
  it('una persona común no tiene ningún permiso especial', () => {
    expect(permisosDe({ profile: perfil(), deposito: true }).every(p => !p.tiene)).toBe(true);
  });
  it('el dueño los tiene todos', () => {
    expect(permisosDe({ profile: perfil({ es_owner: true }), deposito: true }).every(p => p.tiene)).toBe(true);
  });
  it('cada permiso se enciende con su propia marca', () => {
    expect(tiene(perfil({ puede_ver_retiros: true }), 'retiros')).toBe(true);
    expect(tiene(perfil({ puede_ver_errores: true }), 'errores')).toBe(true);
    expect(tiene(perfil({ puede_ver_sugerencias: true }), 'sugerencias')).toBe(true);
    expect(tiene(perfil({ puede_resetear_contrasenas: true }), 'contrasenas')).toBe(true);
    expect(tiene(perfil({ puede_ver_retiros: true }), 'errores')).toBe(false);
    expect(tiene(perfil({ puede_gestionar_depositos: true }), 'depositos')).toBe(true);
    expect(tiene(perfil({ puede_gestionar_depositos: true }), 'ajustes')).toBe(false);
  });
  it('ajustar inventario exige ser administrador del Depósito además del permiso', () => {
    expect(tiene(perfil({ puede_ajustar_inventario: true }), 'ajustes')).toBe(false);
    expect(tiene(perfil({ puede_ajustar_inventario: true, mantenimiento_rol: 'admin' }), 'ajustes')).toBe(true);
  });
  it('sin Depósito no se muestran los permisos del Depósito', () => {
    const claves = permisosDe({ profile: perfil(), deposito: false }).map(p => p.clave);
    expect(claves).not.toContain('retiros');
    expect(claves).not.toContain('ajustes');
    expect(claves).not.toContain('depositos');
    expect(claves).toContain('errores');
  });
  it('todos tienen su explicación para el botón de ayuda', () => {
    expect(permisosDe({ profile: perfil(), deposito: true }).every(p => p.explicacion.length > 10)).toBe(true);
  });
});

describe('problemaDeLaClave', () => {
  const ok = 'Clave-nueva-1';
  it('acepta una clave nueva válida', () => expect(problemaDeLaClave('actual', ok, ok)).toBeNull());
  it('pide la actual', () => expect(problemaDeLaClave('', ok, ok)).toMatch(/actual/));
  it('exige un largo mínimo', () => expect(problemaDeLaClave('actual', 'a'.repeat(LARGO_MINIMO_CLAVE - 1), 'a'.repeat(LARGO_MINIMO_CLAVE - 1))).toMatch(/al menos/));
  it('no deja repetir la actual', () => expect(problemaDeLaClave(ok, ok, ok)).toMatch(/distinta/));
  it('pide que coincidan', () => expect(problemaDeLaClave('actual', ok, ok + 'x')).toMatch(/no coinciden/));
});

describe('fechaCorta', () => {
  it('sin fecha, un guion', () => { expect(fechaCorta(null)).toBe('—'); expect(fechaCorta('no es fecha')).toBe('—'); });
  it('día, mes y año', () => expect(fechaCorta('2026-10-17T15:00:00Z')).toMatch(/^17\/10\/2026$/));
});
