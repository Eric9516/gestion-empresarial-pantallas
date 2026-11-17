import { describe, expect, it } from 'vitest';
import { agruparActividad, hayFiltros, opcionesDeSobre, SIN_FILTROS, tituloDeGrupo, type FilaActividad } from './historialDeActividad';

const fila = (id: number, registro: string, detalle: string, extra: Partial<FilaActividad> = {}): FilaActividad => ({
  id, momento: `2026-10-26T10:0${9 - id}:00Z`, usuario_id: 'u1', usuario_nombre: 'Eric', sobre: 'repuesto', registro_id: registro, codigo: `M${registro}`,
  titulo: `Artículo ${registro}`, deposito_id: 'd1', deposito: 'Depósito 1', accion: 'modificacion', detalle, ...extra,
});

describe('agruparActividad', () => {
  it('junta los cambios de cada artículo debajo de su nombre, en el orden de su cambio más nuevo', () => {
    const grupos = agruparActividad([fila(1, 'A', 'Stock 1 → 0'), fila(2, 'B', 'Alta'), fila(3, 'A', 'Punto de pedido 0 → 1')]);
    expect(grupos.map(g => g.codigo)).toEqual(['MA', 'MB']);
    expect(grupos[0].filas.map(f => f.detalle)).toEqual(['Stock 1 → 0', 'Punto de pedido 0 → 1']);
  });
  it('un proveedor y un artículo con el mismo id no se mezclan', () => {
    expect(agruparActividad([fila(1, 'X', 'a'), fila(2, 'X', 'b', { sobre: 'proveedor' })])).toHaveLength(2);
  });
});

describe('tituloDeGrupo', () => {
  it('la descripción con su código, o el nombre solo', () => {
    expect(tituloDeGrupo({ sobre: 'repuesto', titulo: 'Motorreductor FAF67', codigo: 'MMEMR00050' })).toBe('Motorreductor FAF67 (MMEMR00050)');
    expect(tituloDeGrupo({ sobre: 'proveedor', titulo: 'Argelec', codigo: null })).toBe('Argelec');
  });
});

describe('opcionesDeSobre', () => {
  it('con un depósito elegido solo quedan artículos y reparaciones (proveedores, contactos o usuarios no son de un depósito)', () => {
    expect(opcionesDeSobre('d1', true).map(s => s.id)).toEqual(['repuesto', 'reparacion']);
  });
  it('sin depósito: todo para el dueño; sin usuarios ni configuración para el resto', () => {
    expect(opcionesDeSobre('', true)).toHaveLength(7);
    expect(opcionesDeSobre('', false).map(s => s.id)).not.toContain('usuario');
  });
});

describe('hayFiltros', () => {
  it('sin nada elegido no hay filtros; con cualquier cosa, sí', () => {
    expect(hayFiltros(SIN_FILTROS)).toBe(false);
    expect(hayFiltros({ ...SIN_FILTROS, acciones: ['salida'] })).toBe(true);
    expect(hayFiltros({ ...SIN_FILTROS, texto: '  ' })).toBe(false);
  });
});
