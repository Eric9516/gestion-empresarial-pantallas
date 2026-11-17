import type { Equipo, Sector, SectorConCantidad } from './tipos';

// Los sectores de Mantenimiento con sus sub-sectores y cuántos equipos tiene cada uno. Dos niveles fijos (Sector → Sub-sector), no carpetas sin
// fin. Los sectores van en el orden de importancia que eligió la empresa (los que no tienen orden, al final, por nombre); los sub-sectores, por nombre.
export function sectoresConCantidad(sectores: Sector[], equipos: Pick<Equipo, 'sectorId'>[]): SectorConCantidad[] {
  const cuenta = new Map<string, number>();
  for (const e of equipos) if (e.sectorId) cuenta.set(e.sectorId, (cuenta.get(e.sectorId) ?? 0) + 1);
  const porNombre = (a: { nombre: string }, b: { nombre: string }) => a.nombre.localeCompare(b.nombre, 'es');
  return sectores
    .filter(s => !s.padreId)
    .sort((a, b) => (a.orden ?? Infinity) - (b.orden ?? Infinity) || porNombre(a, b))
    .map(s => {
      const subsectores = sectores.filter(x => x.padreId === s.id).sort(porNombre).map(x => ({ id: x.id, nombre: x.nombre, equipos: cuenta.get(x.id) ?? 0 }));
      return { id: s.id, nombre: s.nombre, equipos: (cuenta.get(s.id) ?? 0) + subsectores.reduce((n, x) => n + x.equipos, 0), subsectores };
    });
}
