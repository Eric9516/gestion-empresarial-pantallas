import { describe, expect, it } from 'vitest';
import { buscarEquipos, normalizar } from './buscador';
import { crearDatosDemo } from './datosDemo';
import { analizarLibro, armarHojas, armarPlantilla, fechaDeExcel, HOJAS, textoLiberacion, textoTecnicos } from './excelMantenimiento';
import { frecuenciaEnPalabras, sumarDias } from './fechas';
import { aplicarPlanillas, cerrarOrden, configInicial, horasDeTecnico, liberacionInicial, totalHorasHombre, estadoAviso, fueraDeRango, listaDeTareas, textoRango, marcasDe, proyectarFechas, repuestosUsados, resumenAvisos, sincronizarOrdenes, textoRepuestos } from './preventivo';
import { limpiarLineas, lineasParaCierre } from './repuestos';
import { tareasDeFilas, type FilaTarea } from './tareas';
import type { DatosMantenimiento, PlanillaTareas, RepuestoLinea, RutinaPreventiva } from './tipos';

const HOY = '2026-10-17';
let n = 0;
const id = () => `t-${++n}`;

function rel(d: DatosMantenimiento) {
  return (equipoId: string) => ({
    intervenciones: d.intervenciones.filter(i => i.equipoId === equipoId),
    repuestos: d.repuestosCriticos.filter(r => r.equipoId === equipoId),
    manuales: d.manuales.filter(m => m.equipoId === equipoId),
  });
}

describe('buscador de equipos', () => {
  const d = crearDatosDemo(HOY);

  it('no le importan tildes ni mayúsculas', () => {
    expect(normalizar('Compresión FRÍO')).toBe('compresion frio');
    expect(buscarEquipos(d.equipos, 'FRIO', rel(d)).map(r => r.equipo.codigo)).toContain('CF-01');
  });

  it('con varias palabras exige todas', () => {
    const r = buscarEquipos(d.equipos, 'bomba servicios', rel(d));
    expect(r.map(x => x.equipo.codigo)).toEqual(['BC-01']);
    expect(buscarEquipos(d.equipos, 'bomba envasado', rel(d))).toEqual([]);
  });

  it('encuentra por el historial y dice dónde coincidió', () => {
    const r = buscarEquipos(d.equipos, 'sello', rel(d));
    expect(r[0].equipo.codigo).toBe('BC-01');
    expect(r[0].motivos.some(m => m.startsWith('historial') || m === 'repuestos críticos')).toBe(true);
  });

  it('el código exacto queda primero', () => {
    expect(buscarEquipos(d.equipos, 'en-01', rel(d))[0].equipo.codigo).toBe('EN-01');
  });

  it('sin texto devuelve todos, ordenados por nombre', () => {
    const r = buscarEquipos(d.equipos, '  ', rel(d));
    expect(r).toHaveLength(d.equipos.length);
    expect(r[0].equipo.nombre <= r[1].equipo.nombre).toBe(true);
  });
});

describe('mantenimiento preventivo', () => {
  const rutina: RutinaPreventiva = { id: 'r1', equipoId: 'e1', tarea: 'Engrasar', frecuenciaDias: 7, proximaFecha: '2026-10-20', avisoDiasAntes: 3, responsable: 'T1', activa: true, repuestos: [], planillaId: null, mediciones: [] };

  it('cada rutina activa tiene una OT abierta, y no se duplica', () => {
    const una = sincronizarOrdenes([rutina], [], id);
    expect(una).toHaveLength(1);
    expect(una[0]).toMatchObject({ tipo: 'preventiva', rutinaId: 'r1', fechaProgramada: '2026-10-20', numero: 'OT-0001', estado: 'pendiente' });
    expect(sincronizarOrdenes([rutina], una, id)).toBe(una);
  });

  it('si la rutina cambia, su OT pendiente se actualiza; si se desactiva, se quita', () => {
    const una = sincronizarOrdenes([rutina], [], id);
    const movida = sincronizarOrdenes([{ ...rutina, proximaFecha: '2026-10-25' }], una, id);
    expect(movida[0].fechaProgramada).toBe('2026-10-25');
    expect(sincronizarOrdenes([{ ...rutina, activa: false }], una, id)).toEqual([]);
  });

  it('avisa: vencida, por vencer, programada', () => {
    const [ot] = sincronizarOrdenes([rutina], [], id);
    expect(estadoAviso(ot, '2026-10-10', 3)).toBe('programada');
    expect(estadoAviso(ot, '2026-10-17', 3)).toBe('por_vencer');
    expect(estadoAviso(ot, '2026-10-21', 3)).toBe('vencida');
    expect(resumenAvisos([ot], [rutina], '2026-10-21')).toEqual({ vencidas: 1, porVencer: 0 });
  });

  it('al cerrar la OT va al historial y la rutina pasa a la fecha siguiente', () => {
    const [ot] = sincronizarOrdenes([rutina], [], id);
    const r = cerrarOrden(ot, { fechaCierre: '2026-10-21', tareasHechas: [true], realizadoPor: 'T2', observaciones: 'ok', horas: 1, repuestosUsados: '', repuestos: [] }, rutina, id);
    expect(r.ot.estado).toBe('terminada');
    expect(r.intervencion).toMatchObject({ tipo: 'preventivo', fecha: '2026-10-21', realizadoPor: 'T2', otId: ot.id });
    expect(r.rutina?.proximaFecha).toBe('2026-10-28');
    const siguientes = sincronizarOrdenes([r.rutina!], [r.ot], id);
    expect(siguientes).toHaveLength(2);
    expect(siguientes[1]).toMatchObject({ numero: 'OT-0002', fechaProgramada: '2026-10-28' });
  });

  it('separa las tareas por renglón y saca viñetas y números', () => {
    expect(listaDeTareas('- Engrasar\n\n2) Ajustar correa\n• Limpiar filtro\n  3. Medir vibración  ')).toEqual(['Engrasar', 'Ajustar correa', 'Limpiar filtro', 'Medir vibración']);
    expect(listaDeTareas('Una sola tarea')).toEqual(['Una sola tarea']);
    // Una OT guardada antes de existir las marcas no se rompe.
    expect(marcasDe({ tareas: 'a\nb', tareasHechas: undefined as unknown as boolean[] })).toEqual([false, false]);
  });

  it('al cerrar con tareas sin hacer, el historial dice cuáles se hicieron y cuáles no', () => {
    const r10 = { ...rutina, tarea: Array.from({ length: 10 }, (_, i) => `Tarea ${i + 1}`).join('\n') };
    const [ot] = sincronizarOrdenes([r10], [], id);
    const marcas = Array.from({ length: 10 }, (_, i) => i < 8);
    const r = cerrarOrden(ot, { fechaCierre: '2026-10-20', tareasHechas: marcas, realizadoPor: 'T1', observaciones: 'faltó repuesto', horas: 2, repuestosUsados: '', repuestos: [] }, r10, id);
    expect(r.pendientes).toEqual(['Tarea 9', 'Tarea 10']);
    expect(r.ot.tareasHechas).toEqual(marcas);
    expect(r.intervencion.descripcion).toContain('8 de 10 tareas hechas');
    expect(r.intervencion.descripcion).toContain('Sin hacer: Tarea 9; Tarea 10.');
    expect(r.intervencion.descripcion).toContain('faltó repuesto');
  });

  it('si cambian las tareas de la rutina, la OT pendiente arranca sin marcas', () => {
    const [ot] = sincronizarOrdenes([{ ...rutina, tarea: 'a\nb' }], [], id);
    const marcada = { ...ot, tareasHechas: [true, false] };
    expect(sincronizarOrdenes([{ ...rutina, tarea: 'a\nb' }], [marcada], id)[0].tareasHechas).toEqual([true, false]);
    expect(sincronizarOrdenes([{ ...rutina, tarea: 'a\nb\nc' }], [marcada], id)[0].tareasHechas).toEqual([]);
  });

  it('proyecta las fechas que vienen, sin la próxima', () => {
    expect(proyectarFechas(rutina, '2026-10-01', '2026-11-05')).toEqual(['2026-10-27', '2026-11-03']);
  });

  it('frecuencia en palabras', () => {
    expect(frecuenciaEnPalabras(7)).toBe('cada semana');
    expect(frecuenciaEnPalabras(14)).toBe('cada 2 semanas');
    expect(frecuenciaEnPalabras(90)).toBe('cada 3 meses');
    expect(frecuenciaEnPalabras(10)).toBe('cada 10 días');
    expect(sumarDias('2026-12-30', 3)).toBe('2027-01-02');
  });
});

describe('Excel de mantenimiento', () => {
  it('lee fechas en varios formatos', () => {
    expect(fechaDeExcel('25/10/2026')).toBe('2026-10-25');
    expect(fechaDeExcel('5/3/26')).toBe('2026-03-05');
    expect(fechaDeExcel('2026-10-25')).toBe('2026-10-25');
    expect(fechaDeExcel(46320)).toBe('2026-10-25');
    expect(fechaDeExcel('31/02/2026')).toBeNull();
    expect(fechaDeExcel('mañana')).toBeNull();
  });

  it('lo exportado se vuelve a importar sin cambios', () => {
    const d = crearDatosDemo(HOY);
    const a = analizarLibro(armarHojas(d), d, id);
    expect(a.errores).toEqual([]);
    expect(a.equiposNuevos.length + a.equiposActualizados.length + a.intervenciones.length + a.rutinasNuevas.length + a.rutinasActualizadas.length).toBe(0);
    expect(a.sinCambios).toBeGreaterThan(0);
  });

  it('la plantilla trae las hojas a completar', () => {
    const p = armarPlantilla();
    expect(Object.keys(p)).toEqual(expect.arrayContaining([HOJAS.equipos, HOJAS.historial, HOJAS.repuestos, HOJAS.rutinas]));
  });

  it('agrega, actualiza y marca errores por fila', () => {
    const d = crearDatosDemo(HOY);
    const libro = {
      // Columnas en otro orden y encabezados sin tildes: igual se reconocen.
      equipos: [
        ['Nombre', 'Codigo', 'Sector', 'Etiquetas', 'Critico'],
        ['Bomba nueva', 'BN-09', 'Proceso', 'bomba, línea 2', 'si'],
        ['Bomba centrífuga de agua (cambiada)', 'BC-01', 'Servicios', '', 'SI'],
        ['Sin código', '', '', '', ''],
      ],
      Historial: [
        ['Código equipo', 'Fecha', 'Tipo', 'Descripción'],
        ['BN-09', '01/10/2026', 'Correctivo', 'Cambio de impulsor'],
        ['XX-99', '01/10/2026', 'Correctivo', 'No existe'],
        ['BC-01', 'ayer', 'Preventivo', 'Fecha mala'],
      ],
      'Rutinas preventivas': [
        ['Código equipo', 'Tarea', 'Cada (días)', 'Próxima fecha'],
        ['BN-09', 'Engrasar', 15, '20/10/2026'],
        ['BN-09', 'Otra', 0, '20/10/2026'],
      ],
    };
    const a = analizarLibro(libro, d, id);
    expect(a.equiposNuevos.map(e => e.codigo)).toEqual(['BN-09']);
    expect(a.equiposNuevos[0]).toMatchObject({ critico: true, etiquetas: ['bomba', 'línea 2'] });
    expect(a.equiposActualizados.map(e => e.codigo)).toEqual(['BC-01']);
    expect(a.intervenciones).toHaveLength(1);
    expect(a.intervenciones[0].equipoId).toBe(a.equiposNuevos[0].id);
    expect(a.rutinasNuevas).toHaveLength(1);
    expect(a.rutinasNuevas[0]).toMatchObject({ frecuenciaDias: 15, proximaFecha: '2026-10-20', avisoDiasAntes: 3, activa: true });
    expect(a.errores.map(e => `${e.hoja}:${e.fila}`)).toEqual(['equipos:4', 'Historial:3', 'Historial:4', 'Rutinas preventivas:3']);
  });

  it('avisa si el archivo no tiene ninguna hoja conocida', () => {
    const a = analizarLibro({ Hoja1: [['a', 'b']] }, crearDatosDemo(HOY), id);
    expect(a.errores).toHaveLength(1);
  });
});

describe('sub-equipos', () => {
  const d = crearDatosDemo(HOY);

  it('el buscador encuentra el sub-equipo por el nombre de su principal', () => {
    const porId = new Map(d.equipos.map(e => [e.id, e]));
    const r = buscarEquipos(d.equipos, 'pasteurizador 2 separadora', id => ({ ...rel(d)(id), padre: porId.get(porId.get(id)?.padreId ?? '') ?? null }));
    expect(r[0].equipo.codigo).toBe('PA-02-SE');
    expect(r[0].motivos).toContain('equipo principal');
  });

  it('el Excel exporta e importa "Pertenece a"', () => {
    const hojas = armarHojas(d);
    const fila = hojas[HOJAS.equipos].find(f => f[0] === 'PA-01-B1')!;
    expect(fila[2]).toBe('PA-01');
    const a = analizarLibro(hojas, d, id);
    expect(a.errores).toEqual([]);
    expect(a.equiposActualizados).toEqual([]);
  });

  it('importa sub-equipos nuevos aunque estén antes que su principal, y rechaza un principal que es sub-equipo', () => {
    const libro = {
      Equipos: [
        ['Código', 'Nombre', 'Pertenece a'],
        ['PA-05-B1', 'Bomba', 'PA-05'],
        ['PA-05', 'Pasteurizador 5', ''],
        ['XX-1', 'Mal', 'PA-01-B1'],
      ],
    };
    const a = analizarLibro(libro, d, id);
    const principal = a.equiposNuevos.find(e => e.codigo === 'PA-05')!;
    expect(a.equiposNuevos.find(e => e.codigo === 'PA-05-B1')?.padreId).toBe(principal.id);
    expect(a.errores.map(e => e.fila)).toEqual([4]);
  });
});

describe('sub-sectores', () => {
  it('el Excel exporta e importa el sub-sector, y el buscador lo encuentra', () => {
    const d = crearDatosDemo(HOY);
    const hojas = armarHojas(d);
    const fila = hojas[HOJAS.equipos].find(f => f[0] === 'CP-01')!;
    expect(fila[3]).toBe('Servicios');
    expect(fila[4]).toBe('Aire comprimido');
    expect(analizarLibro(hojas, d, id).equiposActualizados).toEqual([]);
    expect(buscarEquipos(d.equipos, 'aire comprimido', rel(d))[0].equipo.codigo).toBe('CP-01');
  });

  it('sin sector no se guarda sub-sector', () => {
    const a = analizarLibro({ Equipos: [['Código', 'Nombre', 'Sector', 'Subsector'], ['Z-1', 'Algo', '', 'Suelto']] }, crearDatosDemo(HOY), id);
    expect(a.equiposNuevos[0].subsector).toBe('');
  });
});

describe('orden de los sectores', () => {
  it('la hoja Sectores define el orden, y se exporta en ese orden', () => {
    const d = crearDatosDemo(HOY);
    const a = analizarLibro({ Sectores: [['Sector', 'Subsector'], ['Servicios', 'Vapor'], ['Proceso', ''], ['Servicios', 'Agua']] }, d, id);
    expect(a.ordenSectores?.slice(0, 2)).toEqual(['Servicios', 'Proceso']);
    const hojas = armarHojas({ ...d, ordenSectores: a.ordenSectores! });
    expect(hojas[HOJAS.sectores].slice(1, 3).map(f => f[0])).toEqual(['Servicios', 'Servicios']);
    expect(hojas[HOJAS.sectores].find(f => f[0] === 'Proceso')).toBeTruthy();
    expect(hojas[HOJAS.sectores].findIndex(f => f[0] === 'Proceso')).toBeLessThan(hojas[HOJAS.sectores].findIndex(f => f[0] === 'Almacenamiento'));
  });
});

describe('repuestos de las OT', () => {
  const linea = (o: Partial<RepuestoLinea>): RepuestoLinea => ({ id: id(), componente: '', codigo: '', descripcion: '', cantidad: 1, usado: null, ...o });
  const rodamiento = linea({ componente: 'Motor', codigo: 'YAR 206', descripcion: 'Rodamiento', cantidad: 2 });
  const sello = linea({ componente: 'Bomba', codigo: 'S35', descripcion: 'Sello mecánico', cantidad: 1 });
  const rutina: RutinaPreventiva = { id: 'rr', equipoId: 'e1', tarea: 'Cambiar rodamientos\nCambiar sello', frecuenciaDias: 30, proximaFecha: '2026-10-20', avisoDiasAntes: 3, responsable: '', activa: true, repuestos: [rodamiento, sello], planillaId: null, mediciones: [] };

  it('la OT de una rutina lleva sus repuestos', () => {
    const [ot] = sincronizarOrdenes([rutina], [], id);
    expect(ot.repuestos.map(r => [r.componente, r.codigo, r.cantidad])).toEqual([['Motor', 'YAR 206', 2], ['Bomba', 'S35', 1]]);
    expect(ot.repuestos.every(r => r.usado === null)).toBe(true);
    expect(ot.correctivo).toBeNull();
  });

  it('al terminar se descuenta solo lo que se usó (0 = no se cambió)', () => {
    const [ot] = sincronizarOrdenes([rutina], [], id);
    const usados = lineasParaCierre(ot.repuestos).map(r => (r.codigo === 'S35' ? { ...r, usado: 0 } : r));
    const extra = linea({ componente: 'Motor', descripcion: 'Grasa (sin código)', cantidad: 0, usado: 1 });
    const r = cerrarOrden(ot, { fechaCierre: '2026-10-21', tareasHechas: [true, false], realizadoPor: 'T1', observaciones: '', horas: 1, repuestosUsados: '', repuestos: [...usados, extra] }, rutina, id);
    // Al stock solo va lo que tiene código y se usó.
    expect(r.consumos.map(c => [c.codigo, c.cantidad, c.otId])).toEqual([['YAR 206', 2, ot.id]]);
    expect(r.consumos[0].intervencionId).toBe(r.intervencion.id);
    // En el historial quedan los usados, con su componente (también los escritos a mano).
    expect(r.intervencion.repuestos.map(x => [x.componente, x.codigo || x.descripcion, x.cantidad])).toEqual([['Motor', 'YAR 206', 2], ['Motor', 'Grasa (sin código)', 1]]);
    expect(r.intervencion.tareas).toEqual([{ texto: 'Cambiar rodamientos', hecha: true }, { texto: 'Cambiar sello', hecha: false }]);
    expect(r.intervencion.otNumero).toBe(ot.numero);
    // La OT cerrada recuerda lo previsto y lo usado.
    expect(r.ot.repuestos.find(x => x.codigo === 'S35')).toMatchObject({ cantidad: 1, usado: 0 });
  });

  it('una correctiva guarda falla, causa, solución y horas de parada', () => {
    const [base] = sincronizarOrdenes([rutina], [], id);
    const ot = { ...base, tipo: 'correctiva' as const, rutinaId: null, correctivo: { prioridad: 'urgente' as const, falla: 'Pierde agua', causa: '', solucion: '', horasParada: null } };
    const r = cerrarOrden(ot, { fechaCierre: '2026-10-21', tareasHechas: [true, true], realizadoPor: 'T1', observaciones: '', horas: 2, repuestosUsados: '', repuestos: [], correctivo: { causa: 'Sello gastado', solucion: 'Se cambió el sello', horasParada: 3 } }, undefined, id);
    expect(r.intervencion.tipo).toBe('correctivo');
    expect(r.intervencion.correctivo).toEqual({ prioridad: 'urgente', falla: 'Pierde agua', causa: 'Sello gastado', solucion: 'Se cambió el sello', horasParada: 3 });
    expect(r.consumos).toEqual([]);
  });

  it('limpia renglones vacíos y arma el texto corto', () => {
    expect(limpiarLineas([linea({}), linea({ codigo: ' X1 ', componente: ' Motor ' })]).map(l => [l.codigo, l.componente])).toEqual([['X1', 'Motor']]);
    expect(textoRepuestos([rodamiento, linea({ descripcion: 'Grasa', cantidad: 1 })])).toBe('Motor: 2 × YAR 206 Rodamiento; 1 × Grasa');
    expect(repuestosUsados([{ ...rodamiento, usado: 0 }, { ...sello, usado: 1 }]).map(r => r.codigo)).toEqual(['S35']);
  });

  it('el Excel exporta el detalle del correctivo y los repuestos, y lo vuelve a leer', () => {
    const d = crearDatosDemo(HOY);
    const hojas = armarHojas(d);
    const hist = hojas[HOJAS.historial];
    const cab = hist[0];
    expect(cab).toEqual(expect.arrayContaining(['OT', 'Prioridad', 'Falla', 'Causa', 'Solución', 'Horas de parada']));
    const conRep = hist.find(f => String(f[cab.indexOf('Repuestos usados')]).includes('×'));
    expect(conRep).toBeTruthy();
    // Volver a importar lo mismo no duplica nada.
    const a = analizarLibro(hojas, d, id);
    expect(a.intervenciones).toHaveLength(0);
  });
});

describe('planillas de tareas y mediciones', () => {
  const vib = { unidad: 'mm/s', minimo: 0, maximo: 4.5 };
  const planilla: PlanillaTareas = { id: 'p1', nombre: 'Bomba – mensual', notas: '', tareas: [
    { id: 't1', texto: 'Engrasar', medicion: null },
    { id: 't2', texto: 'Medir vibración', medicion: vib },
  ] };
  const rutina: RutinaPreventiva = { id: 'rp', equipoId: 'e1', tarea: '', frecuenciaDias: 30, proximaFecha: '2026-10-20', avisoDiasAntes: 3, responsable: '', activa: true, repuestos: [], planillaId: 'p1', mediciones: [] };

  it('la rutina toma las tareas de su planilla, y si la planilla cambia, cambian la rutina y su OT', () => {
    const [r] = aplicarPlanillas([rutina], [planilla]);
    expect(r.tarea).toBe('Engrasar\nMedir vibración');
    expect(r.mediciones).toEqual([null, vib]);
    const [ot] = sincronizarOrdenes([r], [], id);
    expect(ot.mediciones).toEqual([null, vib]);
    // Sin cambios devuelve lo mismo (no se re-guarda nada).
    expect(aplicarPlanillas([r], [planilla])[0]).toBe(r);
    const cambiada = { ...planilla, tareas: [...planilla.tareas, { id: 't3', texto: 'Medir temperatura', medicion: { unidad: '°C', minimo: null, maximo: 80 } }] };
    const [r2] = aplicarPlanillas([r], [cambiada]);
    const [ot2] = sincronizarOrdenes([r2], [{ ...ot, valores: [null, 3] }], id);
    expect(listaDeTareas(ot2.tareas)).toHaveLength(3);
    expect(ot2.valores).toEqual([]); // cambiaron las tareas: los valores se borran
  });

  it('al cerrar quedan los valores en el historial y se detectan los fuera de rango', () => {
    const [r] = aplicarPlanillas([rutina], [planilla]);
    const [ot] = sincronizarOrdenes([r], [], id);
    const res = cerrarOrden({ ...ot, valores: [null, 6.2] }, { fechaCierre: '2026-10-20', tareasHechas: [true, true], realizadoPor: '', observaciones: '', horas: null, repuestosUsados: '', repuestos: [] }, r, id);
    expect(res.intervencion.tareas[1]).toEqual({ texto: 'Medir vibración', hecha: true, medicion: vib, valor: 6.2 });
    expect(res.intervencion.tareas[0]).toEqual({ texto: 'Engrasar', hecha: true });
    expect(res.fueraDeRango).toEqual([{ texto: 'Medir vibración', valor: 6.2, medicion: vib }]);
    expect(res.ot.valores).toEqual([null, 6.2]);
  });

  it('rangos: fuera, dentro, sin rango, y en palabras', () => {
    expect(fueraDeRango(vib, 4.5)).toBe(false);
    expect(fueraDeRango(vib, 4.6)).toBe(true);
    expect(fueraDeRango({ unidad: 'bar', minimo: 6, maximo: null }, 5)).toBe(true);
    expect(fueraDeRango({ unidad: 'A', minimo: null, maximo: null }, 999)).toBe(false);
    expect(fueraDeRango(vib, null)).toBe(false);
    expect(textoRango(vib)).toBe('normal 0 a 4,5 mm/s');
    expect(textoRango({ unidad: '°C', minimo: null, maximo: 80 })).toBe('máx. 80 °C');
  });

  it('editar tareas: saca vacías y valida mínimos y máximos', () => {
    const f = (o: Partial<FilaTarea>): FilaTarea => ({ id: id(), texto: '', conValor: false, unidad: '', minimo: '', maximo: '', ...o });
    const ok = tareasDeFilas([f({ texto: '  Engrasar  ' }), f({}), f({ texto: 'Vibración', conValor: true, unidad: 'mm/s', minimo: '0', maximo: '4,5' })]);
    expect('tareas' in ok && ok.tareas.map(t => [t.texto, t.medicion])).toEqual([['Engrasar', null], ['Vibración', vib]]);
    expect(tareasDeFilas([f({ texto: 'x', conValor: true, minimo: '5', maximo: '2' })])).toEqual({ error: expect.stringContaining('mínimo es mayor') });
    expect(tareasDeFilas([f({ texto: 'x', conValor: true, minimo: 'abc' })])).toEqual({ error: expect.stringContaining('números') });
  });

  it('Excel: exporta las planillas y una rutina con planilla, y al reimportar no cambia nada', () => {
    const d = crearDatosDemo(HOY);
    const hojas = armarHojas(d);
    expect(hojas[HOJAS.planillas][0]).toEqual(['Planilla', 'Tarea', 'Unidad', 'Mínimo', 'Máximo']);
    expect(hojas[HOJAS.planillas].length - 1).toBe(d.planillas.reduce((n, p) => n + p.tareas.length, 0));
    const a = analizarLibro(hojas, d, id);
    expect(a.errores).toEqual([]);
    expect(a.planillasNuevas).toHaveLength(0);
    expect(a.planillasActualizadas).toHaveLength(0);
    expect(a.rutinasActualizadas).toHaveLength(0);
  });

  it('Excel: importa una planilla nueva y una rutina que la usa', () => {
    const d = crearDatosDemo(HOY);
    const libro = {
      [HOJAS.planillas]: [['Planilla', 'Tarea', 'Unidad', 'Mínimo', 'Máximo'], ['Motor – trimestral', 'Medir aislación', 'MΩ', 100, ''], ['Motor – trimestral', 'Soplar bobinado', '', '', '']],
      [HOJAS.rutinas]: [['Código equipo', 'Planilla', 'Tarea', 'Cada (días)', 'Próxima fecha'], ['BC-01', 'motor – TRIMESTRAL', '', 90, '01/12/2026'], ['BC-01', 'No existe', '', 90, '01/12/2026']],
    };
    const a = analizarLibro(libro, d, id);
    expect(a.planillasNuevas.map(p => [p.nombre, p.tareas.length])).toEqual([['Motor – trimestral', 2]]);
    expect(a.planillasNuevas[0].tareas[0].medicion).toEqual({ unidad: 'MΩ', minimo: 100, maximo: null });
    expect(a.rutinasNuevas).toHaveLength(1);
    expect(a.rutinasNuevas[0]).toMatchObject({ planillaId: a.planillasNuevas[0].id, tarea: 'Medir aislación\nSoplar bobinado' });
    expect(a.errores.map(e => e.motivo)).toEqual([expect.stringContaining('No existe la planilla')]);
  });
});

describe('técnicos y liberación del equipo', () => {
  it('calcula las horas hombre (también si termina pasada la medianoche)', () => {
    expect(horasDeTecnico({ inicio: '08:00', fin: '10:30' })).toBe(2.5);
    expect(horasDeTecnico({ inicio: '22:00', fin: '01:00' })).toBe(3);
    expect(horasDeTecnico({ inicio: '', fin: '10:00' })).toBeNull();
    const t = (inicio: string, fin: string) => ({ id: id(), nombre: 'T', fecha: HOY, inicio, fin });
    expect(totalHorasHombre([t('08:00', '10:00'), t('08:00', '09:15'), t('', '')])).toBe(3.25);
    expect(totalHorasHombre([t('', '')])).toBeNull();
  });

  it('la liberación sale de los controles que eligió la empresa', () => {
    const c = configInicial();
    expect(liberacionInicial(c)?.controles.every(x => !x.ok)).toBe(true);
    expect(liberacionInicial({ ...c, controlesLiberacion: [] })).toBeNull();
  });

  it('al cerrar, técnicos y liberación quedan en la OT y en el historial', () => {
    const rutina: RutinaPreventiva = { id: 'rt', equipoId: 'e1', tarea: 'Engrasar', frecuenciaDias: 30, proximaFecha: HOY, avisoDiasAntes: 3, responsable: '', activa: true, repuestos: [], planillaId: null, mediciones: [] };
    const [ot] = sincronizarOrdenes([rutina], [], id);
    const tecnicos = [{ id: 'a', nombre: 'T1', fecha: HOY, inicio: '08:00', fin: '09:30' }, { id: 'b', nombre: 'T2', fecha: HOY, inicio: '08:00', fin: '09:00' }];
    const liberacion = { controles: [{ texto: 'Limpieza', ok: true }, { texto: 'Sanitización', ok: false }], recibio: 'Prod 1' };
    const r = cerrarOrden(ot, { fechaCierre: HOY, tareasHechas: [true], realizadoPor: 'T1, T2', observaciones: '', horas: totalHorasHombre(tecnicos), repuestosUsados: '', repuestos: [], tecnicos, liberacion }, rutina, id);
    expect(r.ot.tecnicos).toEqual(tecnicos);
    expect(r.intervencion).toMatchObject({ tecnicos, liberacion, horas: 2.5, realizadoPor: 'T1, T2' });
    expect(textoTecnicos(tecnicos)).toBe('T1 08:00–09:30 (1,5 HH); T2 08:00–09:00 (1 HH)');
    expect(textoLiberacion(liberacion)).toBe('Limpieza: sí; Sanitización: no · Recibió: Prod 1');
  });
});
