import { formatearFechaSola } from '../../lib/fechaHoy';
import { frecuenciaEnPalabras } from './fechas';
import { configInicial, fueraDeRango, horasDeTecnico, listaDeTareas, marcasDe, medicionesDe, numeroCorto, tareasDePlanilla, textoRango, valoresDe } from './preventivo';
import type { ConfigMantenimiento, Equipo, OrdenTrabajo, PlanillaTareas, RutinaPreventiva, TrabajoTecnico } from './tipos';

// Orden de trabajo en PDF (A4) para imprimir y llevar a la máquina: datos del equipo, la lista de
// tareas con casilleros "Hecha / No hecha", los repuestos por componente (previstos y lugar para anotar
// cuántos se usaron), en las correctivas la falla, causa y solución, lugar para horas, observaciones y firmas.
// Si la OT ya está terminada, sale con lo que se marcó. jsPDF se descarga recién al usarla.

export interface OtPdfInput {
  empresa: string;
  logo: string;
  ot: OrdenTrabajo;
  equipo: Equipo | undefined;
  rutina: RutinaPreventiva | undefined;
  /** Si es una planilla de tareas en blanco (sin OT): se imprime para llevarla a cualquier equipo. */
  planilla?: PlanillaTareas;
  /** Si el equipo es un sub-equipo, su equipo principal (sale como Equipo, y el otro como Sub-equipo). */
  padre?: Equipo;
  /** Formato elegido por la empresa (registro de calidad y liberación del equipo). */
  config?: ConfigMantenimiento;
}

const MARGEN = 15;
const ESTADO = { pendiente: 'Pendiente', en_curso: 'En curso', terminada: 'Terminada' } as const;

export async function generarOtPdf(ordenes: OtPdfInput[]): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const ancho = W - MARGEN * 2;

  ordenes.forEach((input, n) => {
    if (n > 0) doc.addPage();
    dibujarOt(doc, input, W, H, ancho);
  });
  return doc.output('blob');
}

/** Planillas de tareas en blanco (una por hoja), con lugar para anotar equipo, fecha, valores y firmas. */
export async function generarPlanillaPdf(planillas: { empresa: string; logo: string; planilla: PlanillaTareas; config?: ConfigMantenimiento }[]): Promise<Blob> {
  return generarOtPdf(planillas.map(({ empresa, logo, planilla, config }) => {
    const t = tareasDePlanilla(planilla);
    const ot: OrdenTrabajo = {
      id: '', numero: '', tipo: 'preventiva', equipoId: '', rutinaId: null, fechaProgramada: '', tareas: t.tarea, tareasHechas: [],
      asignadoA: '', estado: 'pendiente', fechaCierre: null, observaciones: '', horas: null, repuestosUsados: '', repuestos: [],
      correctivo: null, mediciones: t.mediciones, valores: [], tecnicos: [], liberacion: null,
      etapa: 'por_derivar', asignados: [], pasos: [], terminadaEn: null, cierre: null,
    };
    return { empresa, logo, ot, equipo: undefined, rutina: undefined, planilla, config };
  }));
}

type Doc = InstanceType<typeof import('jspdf').jsPDF>;

function dibujarOt(doc: Doc, { empresa, logo, ot, equipo, rutina, planilla, padre, config = configInicial() }: OtPdfInput, W: number, H: number, ancho: number) {
  const terminada = ot.estado === 'terminada';
  const pie = planilla ? planilla.nombre : ot.numero;
  let y = 14;

  const piePagina = () => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(`${pie} · ${empresa}`, MARGEN, H - 8);
    doc.text(`Página ${doc.getCurrentPageInfo().pageNumber}`, W - MARGEN, H - 8, { align: 'right' });
    doc.setTextColor(0);
  };
  // Pasa a otra hoja si no entra lo que sigue.
  const lugar = (alto: number) => {
    if (y + alto <= H - 16) return;
    piePagina();
    doc.addPage();
    y = 16;
  };

  // Encabezado: logo y empresa a la izquierda, número de OT a la derecha.
  let xTexto = MARGEN;
  if (logo) {
    try {
      const p = doc.getImageProperties(logo);
      const alto = 13;
      const a = Math.min(36, (p.width / p.height) * alto);
      doc.addImage(logo, 'PNG', MARGEN, y - 2, a, alto);
      xTexto = MARGEN + a + 4;
    } catch { /* logo inválido: se sigue sin él */ }
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(empresa, xTexto, y + 3);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(planilla ? 'PLANILLA DE TAREAS DE MANTENIMIENTO' : `ORDEN DE MANTENIMIENTO ${ot.tipo === 'preventiva' ? 'PREVENTIVO' : 'CORRECTIVO'}`, xTexto, y + 8);
  doc.setFont('helvetica', 'normal');
  // Registro de calidad (código, versión, vigencia): recuadro arriba a la derecha; el número de OT va a su izquierda.
  const registro = [
    config.registroCodigo,
    config.registroVersion && `Versión: ${config.registroVersion}`,
    config.registroVigencia && `Vigencia: ${formatearFechaSola(config.registroVigencia)}`,
  ].filter(Boolean) as string[];
  const anchoReg = registro.length ? 48 : 0;
  if (registro.length) {
    doc.setDrawColor(90);
    doc.setLineWidth(0.3);
    doc.rect(W - MARGEN - anchoReg, y - 3, anchoReg, registro.length * 4.6 + 2.4);
    doc.setFontSize(8);
    registro.forEach((r, i) => {
      if (i === 0) doc.setFont('helvetica', 'bold');
      doc.text(r, W - MARGEN - anchoReg / 2, y + 1 + i * 4.6, { align: 'center' });
      doc.setFont('helvetica', 'normal');
    });
  }
  const xDerecha = W - MARGEN - (anchoReg ? anchoReg + 5 : 0);
  if (planilla) {
    doc.setFontSize(9);
    doc.text('OT N°: ______________', xDerecha, y + 6, { align: 'right' });
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(ot.numero, xDerecha, y + 4, { align: 'right' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`${ot.tipo === 'preventiva' ? 'Preventiva' : 'Correctiva'}${ot.correctivo?.prioridad === 'urgente' ? ' · URGENTE' : ''} · ${ESTADO[ot.estado]}`, xDerecha, y + 9, { align: 'right' });
  }
  y += 16;
  doc.setDrawColor(60);
  doc.setLineWidth(0.5);
  doc.line(MARGEN, y, W - MARGEN, y);
  y += 6;

  if (planilla) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    const titulo = doc.splitTextToSize(planilla.nombre, ancho) as string[];
    doc.text(titulo, MARGEN, y + 2);
    y += titulo.length * 6 + 3;
    if (planilla.notas) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const notas = doc.splitTextToSize(planilla.notas, ancho) as string[];
      doc.text(notas, MARGEN, y);
      y += notas.length * 4 + 3;
    }
    doc.setFont('helvetica', 'normal');
  }

  // Datos en dos columnas.
  const blanco = '______________________';
  const datos: [string, string][] = planilla
    ? [['Equipo', blanco], ['Sector / ubicación', blanco], ['Fecha', blanco], ['Realizado por', blanco]]
    : [
      ['Equipo', padre ? `${padre.codigo} — ${padre.nombre}` : equipo ? `${equipo.codigo} — ${equipo.nombre}` : 'Equipo eliminado'],
      ['Sector / ubicación', [equipo?.sector, equipo?.subsector, equipo?.ubicacion].filter(Boolean).join(' · ') || '—'],
      ...(padre && equipo ? [['Sub-equipo', `${equipo.codigo} — ${equipo.nombre}`] as [string, string]] : []),
      [ot.tipo === 'correctiva' ? 'Fecha' : 'Fecha programada', formatearFechaSola(ot.fechaProgramada)],
      [ot.tipo === 'correctiva' && terminada ? 'Realizada por' : 'Asignada a', ot.asignadoA || blanco],
    ];
  if (planilla) datos.splice(2, 0, ['Sub-equipo', blanco]);
  if (equipo && (equipo.marca || equipo.modelo)) datos.push(['Marca / modelo', [equipo.marca, equipo.modelo].filter(Boolean).join(' ')]);
  if (rutina) datos.push(['Frecuencia', `Se repite ${frecuenciaEnPalabras(rutina.frecuenciaDias)}`]);
  const col = ancho / 2;
  datos.forEach(([etiqueta, valor], i) => {
    const x = MARGEN + (i % 2) * col;
    const yy = y + Math.floor(i / 2) * 10;
    doc.setFontSize(7.5);
    doc.setTextColor(110);
    doc.text(etiqueta.toUpperCase(), x, yy);
    doc.setTextColor(0);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(doc.splitTextToSize(valor, col - 4)[0] ?? '', x, yy + 4.5);
    doc.setFont('helvetica', 'normal');
  });
  y += Math.ceil(datos.length / 2) * 10 + 2;

  // Correctiva: la falla que se reportó.
  if (ot.correctivo) {
    doc.setFontSize(10);
    const lineas = doc.splitTextToSize(ot.correctivo.falla || 'Sin detalle.', ancho - 6) as string[];
    const alto = 9 + lineas.length * 4.6;
    lugar(alto);
    doc.setDrawColor(200, 120, 40);
    doc.setLineWidth(0.4);
    doc.rect(MARGEN, y, ancho, alto);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('FALLA REPORTADA', MARGEN + 3, y + 4.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(lineas, MARGEN + 3, y + 9.5);
    y += alto + 5;
  }

  // Lista de tareas con casilleros.
  const tareas = listaDeTareas(ot.tareas);
  const marcas = marcasDe(ot);
  const mediciones = medicionesDe(ot);
  const valores = valoresDe(ot);
  const anchoCasillero = 15;
  const anchoTexto = ancho - 10 - anchoCasillero * 2;
  // Correctiva: sin casilleros OK / NO (el técnico redacta el trabajo realizado). Si tiene tareas (por ejemplo, lo pendiente
  // de otra OT), salen como lista de "qué hay que hacer"; si no, no hay tabla de tareas.
  const esCorrectiva = ot.tipo === 'correctiva' && !planilla;
  const conTabla = !esCorrectiva || tareas.length > 0;
  if (conTabla) {
    doc.setFillColor(235, 240, 245);
    doc.rect(MARGEN, y, ancho, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('#', MARGEN + 3, y + 4.8);
    doc.text(esCorrectiva ? 'QUÉ HAY QUE HACER' : 'TAREA', MARGEN + 10, y + 4.8);
    if (!esCorrectiva) {
      doc.text('OK', MARGEN + ancho - anchoCasillero * 2 + anchoCasillero / 2, y + 4.8, { align: 'center' });
      doc.text('NO', MARGEN + ancho - anchoCasillero / 2, y + 4.8, { align: 'center' });
    }
    doc.setFont('helvetica', 'normal');
    y += 7;
  }

  const casillero = (cx: number, cy: number, marca: 'tilde' | 'cruz' | null) => {
    doc.setDrawColor(80);
    doc.setLineWidth(0.3);
    doc.rect(cx - 2.5, cy - 2.5, 5, 5);
    doc.setLineWidth(0.6);
    if (marca === 'tilde') {
      doc.line(cx - 1.6, cy, cx - 0.4, cy + 1.4);
      doc.line(cx - 0.4, cy + 1.4, cx + 1.8, cy - 1.6);
    } else if (marca === 'cruz') {
      doc.line(cx - 1.5, cy - 1.5, cx + 1.5, cy + 1.5);
      doc.line(cx - 1.5, cy + 1.5, cx + 1.5, cy - 1.5);
    }
  };

  (conTabla ? (tareas.length ? tareas : ['']) : []).forEach((t, i) => {
    doc.setFontSize(10);
    const lineas = doc.splitTextToSize(t || '______________________________________________', anchoTexto) as string[];
    const med = mediciones[i];
    const alto = Math.max(8, lineas.length * 4.4 + 3.6) + (med ? 7 : 0);
    lugar(alto);
    if (med) {
      // Lugar para anotar el valor, con la unidad y el rango normal al lado.
      const yv = y + lineas.length * 4.4 + 3.6;
      doc.setFontSize(9);
      doc.text('Valor:', MARGEN + 10, yv + 3.6);
      doc.setDrawColor(90);
      doc.setLineWidth(0.3);
      doc.rect(MARGEN + 21, yv - 0.5, 24, 6);
      const v = valores[i];
      if (terminada && v != null) {
        doc.setFont('helvetica', 'bold');
        doc.text(numeroCorto(v), MARGEN + 23, yv + 3.6);
        doc.setFont('helvetica', 'normal');
      }
      const rango = textoRango(med);
      const detalle = [med.unidad, rango && rango !== med.unidad ? `(${rango})` : ''].filter(Boolean).join('  ');
      doc.text(detalle, MARGEN + 48, yv + 3.6);
      if (terminada && fueraDeRango(med, v)) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(180, 30, 30);
        doc.text('FUERA DE RANGO', MARGEN + anchoTexto + 8, yv + 3.6, { align: 'right' });
        doc.setTextColor(0);
        doc.setFont('helvetica', 'normal');
      }
      doc.setFontSize(10);
    }
    doc.setDrawColor(210);
    doc.setLineWidth(0.2);
    doc.line(MARGEN, y + alto, MARGEN + ancho, y + alto);
    doc.text(String(i + 1), MARGEN + 3, y + 5.3);
    doc.text(lineas, MARGEN + 10, y + 5.3);
    const cy = med ? y + 4 : y + alto / 2;
    if (!esCorrectiva) {
      casillero(MARGEN + ancho - anchoCasillero * 1.5, cy, marcas[i] === true ? 'tilde' : null);
      casillero(MARGEN + ancho - anchoCasillero / 2, cy, terminada && marcas[i] === false ? 'cruz' : null);
    }
    y += alto;
  });
  y += 5;

  // Repuestos por componente: lo previsto y una columna para anotar cuánto se usó (lo que se descuenta del stock).
  const reps = ot.repuestos ?? [];
  // Renglones libres para anotar repuestos que no estaban previstos.
  const blancos = terminada ? 0 : (ot.repuestos ?? []).length ? 1 : 2;
  if (reps.length || !terminada) {
    const cols = [
      { t: 'COMPONENTE', w: ancho * 0.25 },
      { t: 'CÓDIGO', w: ancho * 0.18 },
      { t: 'DESCRIPCIÓN', w: ancho * 0.37 },
      { t: 'PREV.', w: ancho * 0.1 },
      { t: 'USADO', w: ancho * 0.1 },
    ];
    lugar(7 + 8 * Math.min(2, reps.length + blancos) + 6);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Repuestos', MARGEN, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(110);
    doc.text('Anotá cuántos se usaron (0 si no se cambió): eso es lo que se descuenta del stock.', MARGEN + 20, y);
    doc.setTextColor(0);
    y += 2.5;
    const cabecera = () => {
      doc.setFillColor(235, 240, 245);
      doc.rect(MARGEN, y, ancho, 6.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      let x = MARGEN;
      for (const c of cols) { doc.text(c.t, x + 2, y + 4.4); x += c.w; }
      doc.setFont('helvetica', 'normal');
      y += 6.5;
    };
    cabecera();
    const filas = [...reps.map(r => [r.componente, r.codigo, r.descripcion, String(r.cantidad), terminada ? String(r.usado ?? 0) : '']), ...Array.from({ length: blancos }, () => ['', '', '', '', ''])];
    for (const f of filas) {
      doc.setFontSize(9);
      const partidas = f.map((v, i) => doc.splitTextToSize(v, cols[i].w - 3) as string[]);
      const alto = Math.max(8, Math.max(...partidas.map(p => p.length)) * 4 + 3.5);
      if (y + alto > H - 16) { lugar(alto + 7); cabecera(); }
      let x = MARGEN;
      partidas.forEach((p, i) => { doc.text(p, x + 2, y + 5); x += cols[i].w; });
      doc.setDrawColor(210);
      doc.setLineWidth(0.2);
      doc.line(MARGEN, y + alto, MARGEN + ancho, y + alto);
      // Casillero para escribir la cantidad usada.
      if (!terminada) { doc.setDrawColor(120); doc.rect(MARGEN + ancho - cols[4].w + 2, y + 1.5, cols[4].w - 4, alto - 3); }
      y += alto;
    }
    y += 5;
  }

  // Lugar para completar a mano (o lo ya cargado, si está terminada).
  const campo = (etiqueta: string, valor: string, renglones: number) => {
    // En una OT terminada, solo los renglones que ocupa lo escrito (mínimo uno).
    if (terminada) {
      doc.setFontSize(10);
      renglones = Math.max(1, Math.min(renglones + 2, valor ? (doc.splitTextToSize(valor, ancho) as string[]).length : 1));
    }
    const alto = 6 + renglones * 7;
    lugar(alto);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(etiqueta, MARGEN, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    if (valor) {
      const lineas = (doc.splitTextToSize(valor, ancho) as string[]).slice(0, renglones);
      doc.text(lineas, MARGEN, y + 6);
    }
    doc.setDrawColor(170);
    doc.setLineWidth(0.2);
    for (let r = 0; r < renglones; r++) doc.line(MARGEN, y + 7.5 + r * 7, MARGEN + ancho, y + 7.5 + r * 7);
    y += alto + 3;
  };

  if (ot.correctivo) {
    campo('Causa de la falla', terminada ? ot.correctivo.causa : '', 2);
    campo('Trabajo realizado', terminada ? ot.correctivo.solucion : '', 4);
  }
  if (terminada && ot.repuestosUsados) campo('Otros repuestos', ot.repuestosUsados, 2);
  // Horas de equipo parado (correctivas y preventivas; vacío en una preventiva = no se paró), a la derecha de Observaciones.
  lugar(6 + 2 * 7);
  {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    const parada = ot.correctivo ? ot.correctivo.horasParada : ot.horasParada;
    const valor = terminada ? (parada != null ? numeroCorto(parada) : '—') : '__________';
    doc.text('Horas de equipo parado:', W - MARGEN - 62, y);
    doc.setFont('helvetica', 'normal');
    doc.text(valor, W - MARGEN - 20, y);
  }
  campo(esCorrectiva && !terminada ? 'Observaciones (si quedó algo pendiente)' : 'Observaciones', terminada ? ot.observaciones : '', 2);

  // Técnicos: cada uno con fecha de término, horario, horas hombre (HH) y firma.
  const tecnicos: TrabajoTecnico[] = terminada
    ? (ot.tecnicos?.length ? ot.tecnicos : [{ id: '', nombre: ot.asignadoA, fecha: ot.fechaCierre ?? '', inicio: '', fin: '' }])
    : [];
  const colsT = [
    { t: 'TÉCNICO', w: ancho * 0.3 }, { t: 'FECHA TÉRMINO', w: ancho * 0.16 }, { t: 'H. INICIO', w: ancho * 0.12 },
    { t: 'H. TÉRMINO', w: ancho * 0.12 }, { t: 'HH', w: ancho * 0.08 }, { t: 'FIRMA', w: ancho * 0.22 },
  ];
  const filasT = Math.max(terminada ? tecnicos.length : 2, 1);
  lugar(6.5 + filasT * 7.5 + 4);
  doc.setFillColor(235, 240, 245);
  doc.rect(MARGEN, y, ancho, 6.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  { let x = MARGEN; for (const c of colsT) { doc.text(c.t, x + 2, y + 4.4); x += c.w; } }
  doc.setFont('helvetica', 'normal');
  y += 6.5;
  doc.setDrawColor(170);
  doc.setLineWidth(0.2);
  for (let r = 0; r < filasT; r++) {
    const t = tecnicos[r];
    if (t) {
      const hh = horasDeTecnico(t) ?? (tecnicos.length === 1 ? ot.horas : null);
      const celdas = [t.nombre, t.fecha ? formatearFechaSola(t.fecha) : '', t.inicio, t.fin, hh != null ? numeroCorto(hh) : '', ''];
      doc.setFontSize(9);
      let x = MARGEN;
      celdas.forEach((v, i) => { doc.text((doc.splitTextToSize(v, colsT[i].w - 3) as string[])[0] ?? '', x + 2, y + 5); x += colsT[i].w; });
    }
    doc.line(MARGEN, y + 7.5, MARGEN + ancho, y + 7.5);
    y += 7.5;
  }
  y += 6;

  // Liberación del equipo: controles de entrega y firma de quien lo recibe.
  const liberacion = terminada ? ot.liberacion : config.controlesLiberacion.length ? { controles: config.controlesLiberacion.map(texto => ({ texto, ok: false })), recibio: '' } : null;
  if (liberacion) {
    const porFila = Math.min(5, liberacion.controles.length) || 1;
    const filasL = Math.ceil(liberacion.controles.length / porFila);
    lugar(7 + filasL * 12 + 15);
    doc.setDrawColor(60);
    doc.setLineWidth(0.4);
    doc.setFillColor(235, 240, 245);
    doc.rect(MARGEN, y, ancho, 7, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('LIBERACIÓN DEL EQUIPO — VERIFICACIÓN DE ENTREGA', W / 2, y + 4.8, { align: 'center' });
    y += 7;
    const anchoC = ancho / porFila;
    liberacion.controles.forEach((c, i) => {
      const fila = Math.floor(i / porFila);
      const x = MARGEN + (i % porFila) * anchoC;
      const yy = y + fila * 12;
      doc.setDrawColor(170);
      doc.setLineWidth(0.2);
      doc.rect(x, yy, anchoC, 12);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(doc.splitTextToSize(c.texto, anchoC - 4) as string[], x + anchoC / 2, yy + 4, { align: 'center' });
      casillero(x + anchoC / 2, yy + 8.3, c.ok ? 'tilde' : terminada ? 'cruz' : null);
    });
    y += filasL * 12 + 9;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    const quien = config.recibeLiberacion || 'Recibió';
    doc.text(`${quien}:`, MARGEN, y);
    doc.setFont('helvetica', 'normal');
    const xq = MARGEN + doc.getTextWidth(`${quien}:`) + 6;
    if (liberacion.recibio) doc.text(liberacion.recibio, xq, y - 0.8);
    doc.setDrawColor(120);
    doc.line(xq, y + 0.8, MARGEN + col + 10, y + 0.8);
    doc.text('Firma:', MARGEN + col + 16, y);
    doc.line(MARGEN + col + 28, y + 0.8, MARGEN + ancho, y + 0.8);
    y += 6;
  }

  piePagina();
}
