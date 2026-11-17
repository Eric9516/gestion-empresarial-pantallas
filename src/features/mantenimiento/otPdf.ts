import { useCallback } from 'react';
import { useToast } from '../../components/ToastProvider';
import { formatearFechaSola } from '../../lib/fechaHoy';
import { abrirPdfBlob } from '../../lib/pdfBlob';
import { frecuenciaEnPalabras } from './fechas';
import { CONFIG_DE_FABRICA, fueraDeRango, horasDeTecnico, numeroCorto, numeroOT, textoRango } from './preventivo';
import { useMantenimiento } from './servicio';
import type { ConfigMantenimiento, Equipo, OrdenTrabajo, PlanillaTareas, Rutina, TrabajoTecnico } from './tipos';

// Orden de trabajo en PDF (A4) para imprimir y llevar a la máquina (del diseño del socio, sobre la OT en papel del encargado): datos del
// equipo, las tareas con casilleros OK / NO (en las correctivas, sin casilleros: el técnico redacta el trabajo realizado), los repuestos por componente (previstos y lugar para anotar cuántos se usaron), en las
// correctivas la falla, causa y solución, observaciones y la tabla de técnicos con firma. Si la OT ya está terminada, sale con lo que se
// marcó. Arriba a la derecha, el registro de calidad del formato de la OT; las tareas con medición traen su casillero para el valor; al
// final, la liberación del equipo con la firma de quien lo recibe. Una planilla de tareas se imprime igual, en blanco, para llevarla a
// cualquier equipo. jsPDF se descarga recién al usarla.

export interface OtPdfInput {
  empresa: string;
  logo: string;
  ot: OrdenTrabajo;
  equipo: Equipo | undefined;
  rutina: Rutina | undefined;
  /** Si el equipo es un sub-equipo, su equipo principal (sale como Equipo, y el otro como Sub-equipo). */
  padre?: Equipo;
  /** El formato de la OT de la empresa (registro de calidad y liberación del equipo). */
  config?: ConfigMantenimiento;
  /** Si es una planilla de tareas en blanco (sin OT). */
  planilla?: PlanillaTareas;
}

const MARGEN = 15;
const ESTADO = { pendiente: 'Pendiente', en_curso: 'En curso', terminada: 'Terminada' } as const;

export async function generarOtPdf(ordenes: OtPdfInput[]): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  ordenes.forEach((input, n) => {
    if (n > 0) doc.addPage();
    dibujarOt(doc, input, W, H, W - MARGEN * 2);
  });
  return doc.output('blob');
}

/** Planillas de tareas en blanco (una por hoja), con lugar para anotar equipo, fecha, valores y firmas. */
export async function generarPlanillaPdf(planillas: { empresa: string; logo: string; planilla: PlanillaTareas; config?: ConfigMantenimiento }[]): Promise<Blob> {
  return generarOtPdf(planillas.map(({ empresa, logo, planilla, config }) => {
    const ot: OrdenTrabajo = {
      id: '', numero: 0, tipo: 'preventiva', equipoId: '', rutinaId: null, fechaProgramada: '', asignadoId: null, asignado: '', estado: 'pendiente',
      empezadaAt: null, fechaCierre: null, observaciones: '', horas: null, avisoDias: 0, repuestos: [], tecnicos: [], correctivo: null, liberacion: null,
      horasParada: null, etapa: 'por_derivar', asignados: [], pasos: [], terminadaEn: null,
      tareas: planilla.tareas.map(t => ({ id: '', texto: t.texto, hecha: false, medicion: t.medicion, valor: null })),
    };
    return { empresa, logo, ot, equipo: undefined, rutina: undefined, planilla, config };
  }));
}

type Doc = InstanceType<typeof import('jspdf').jsPDF>;

function dibujarOt(doc: Doc, { empresa, logo, ot, equipo, rutina, padre, planilla, config = CONFIG_DE_FABRICA }: OtPdfInput, W: number, H: number, ancho: number) {
  const terminada = ot.estado === 'terminada';
  const numero = planilla ? planilla.nombre : numeroOT(ot.numero);
  let y = 14;

  const piePagina = () => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(`${numero} · ${empresa}`, MARGEN, H - 8);
    doc.text(`Página ${doc.getCurrentPageInfo().pageNumber}`, W - MARGEN, H - 8, { align: 'right' });
    doc.setTextColor(0);
  };
  // pasa a otra hoja si no entra lo que sigue
  const lugar = (alto: number) => {
    if (y + alto <= H - 16) return;
    piePagina();
    doc.addPage();
    y = 16;
  };

  // encabezado: logo y empresa a la izquierda, número de OT a la derecha
  let xTexto = MARGEN;
  if (logo) {
    try {
      const p = doc.getImageProperties(logo);
      const alto = 13;
      const a = Math.min(36, (p.width / p.height) * alto);
      doc.addImage(logo, MARGEN, y - 2, a, alto);
      xTexto = MARGEN + a + 4;
    } catch { /* logo inválido: se sigue sin él */ }
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(empresa, xTexto, y + 3);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const tipo = ot.tipo === 'preventiva' ? 'preventivo' : 'correctivo';
  doc.text(planilla ? 'Planilla de tareas de mantenimiento' : `Orden de trabajo de mantenimiento ${tipo}`, xTexto, y + 8);
  // el registro de calidad (código, versión, vigencia): recuadro arriba a la derecha, y el número de la OT pasa abajo, con el título
  const registro = [
    config.registroCodigo,
    config.registroVersion && `Versión: ${config.registroVersion}`,
    config.registroVigencia && `Vigencia: ${formatearFechaSola(config.registroVigencia)}`,
  ].filter(Boolean) as string[];
  if (registro.length) {
    const anchoReg = 48;
    doc.setDrawColor(90);
    doc.setLineWidth(0.3);
    doc.rect(W - MARGEN - anchoReg, y - 3, anchoReg, registro.length * 4.6 + 2.4);
    doc.setFontSize(8);
    registro.forEach((r, i) => {
      doc.setFont('helvetica', i === 0 ? 'bold' : 'normal');
      doc.text(r, W - MARGEN - anchoReg / 2, y + 1 + i * 4.6, { align: 'center' });
    });
    y += Math.max(0, registro.length * 4.6 - 6) + 9;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(planilla ? 'PLANILLA DE TAREAS DE MANTENIMIENTO' : `ORDEN DE MANTENIMIENTO ${tipo.toUpperCase()}`, MARGEN, y + 4);
    doc.setFont('helvetica', 'normal');
  }
  if (planilla) {
    doc.setFontSize(9);
    doc.text('OT N°: ______________', W - MARGEN, y + 6, { align: 'right' });
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(numero, W - MARGEN, y + 4, { align: 'right' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`${ot.tipo === 'preventiva' ? 'Preventiva' : 'Correctiva'}${ot.correctivo?.prioridad === 'urgente' ? ' · URGENTE' : ''} · ${ESTADO[ot.estado]}`, W - MARGEN, y + 9, { align: 'right' });
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
    doc.setFont('helvetica', 'normal');
    if (planilla.notas) {
      doc.setFontSize(9);
      const notas = doc.splitTextToSize(planilla.notas, ancho) as string[];
      doc.text(notas, MARGEN, y);
      y += notas.length * 4 + 3;
    }
  }

  // datos en dos columnas (en una planilla, para completar a mano)
  const blanco = '______________________';
  const datos: [string, string][] = planilla ? [['Equipo', blanco], ['Sector / ubicación', blanco], ['Sub-equipo', blanco], ['Fecha', blanco], ['Realizado por', blanco]] : [
    ['Equipo', padre ? `${padre.codigo} — ${padre.nombre}` : equipo ? `${equipo.codigo} — ${equipo.nombre}` : 'Equipo eliminado'],
    ['Sector / ubicación', [equipo?.sector, equipo?.subsector, equipo?.ubicacion].filter(Boolean).join(' · ') || '—'],
    ...(padre && equipo ? [['Sub-equipo', `${equipo.codigo} — ${equipo.nombre}`] as [string, string]] : []),
    [ot.tipo === 'correctiva' ? 'Fecha' : 'Fecha programada', formatearFechaSola(ot.fechaProgramada)],
    [ot.tipo === 'correctiva' && terminada ? 'Realizada por' : 'Asignada a', ot.asignados.map(a => a.nombre).join(', ') || ot.asignado || blanco],
  ];
  if (equipo && (equipo.marca || equipo.modelo)) datos.push(['Marca / modelo', [equipo.marca, equipo.modelo].filter(Boolean).join(' ')]);
  if (rutina) datos.push(['Frecuencia', `Se repite ${frecuenciaEnPalabras(rutina.frecuenciaDias)}`]);
  const col = ancho / 2;
  datos.forEach(([etiqueta, valor], i) => {
    const x = MARGEN + (i % 2) * col;
    const yy = y + Math.floor(i / 2) * 11;
    doc.setFontSize(7.5);
    doc.setTextColor(110);
    doc.text(etiqueta.toUpperCase(), x, yy);
    doc.setTextColor(0);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(doc.splitTextToSize(valor, col - 4)[0] ?? '', x, yy + 4.5);
    doc.setFont('helvetica', 'normal');
  });
  y += Math.ceil(datos.length / 2) * 11 + 2;

  // correctiva: la falla que se reportó
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

  // las tareas, con casilleros
  const anchoCasillero = 15;
  const anchoTexto = ancho - 10 - anchoCasillero * 2;
  // correctiva: sin casilleros OK / NO (el técnico redacta el trabajo realizado); si tiene tareas (por ejemplo, lo pendiente de otra OT), salen
  // como lista de "qué hay que hacer"; si no tiene, no hay tabla de tareas
  const esCorrectiva = ot.tipo === 'correctiva' && !planilla;
  const conTabla = !esCorrectiva || ot.tareas.length > 0;
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

  (conTabla ? (ot.tareas.length ? ot.tareas : [{ id: '', texto: '', hecha: false, medicion: null, valor: null }]) : []).forEach((t, i) => {
    doc.setFontSize(10);
    const lineas = doc.splitTextToSize(t.texto || '______________________________________________', anchoTexto) as string[];
    const med = t.medicion;
    const alto = Math.max(9, lineas.length * 4.6 + 4.4) + (med ? 8 : 0);
    lugar(alto);
    if (med) {
      // el casillero para anotar el valor, con la unidad y el rango normal al lado
      const yv = y + lineas.length * 4.6 + 4.6;
      doc.setFontSize(9);
      doc.text('Valor:', MARGEN + 10, yv + 3.6);
      doc.setDrawColor(90);
      doc.setLineWidth(0.3);
      doc.rect(MARGEN + 21, yv - 0.5, 24, 6);
      if (terminada && t.valor != null) {
        doc.setFont('helvetica', 'bold');
        doc.text(numeroCorto(t.valor), MARGEN + 23, yv + 3.6);
        doc.setFont('helvetica', 'normal');
      }
      const rango = textoRango(med);
      doc.text([med.unidad, rango && rango !== med.unidad ? `(${rango})` : ''].filter(Boolean).join('  '), MARGEN + 48, yv + 3.6);
      if (terminada && fueraDeRango(med, t.valor)) {
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
    doc.text(String(i + 1), MARGEN + 3, y + 5.6);
    doc.text(lineas, MARGEN + 10, y + 5.6);
    const cy = y + alto / 2;
    if (!esCorrectiva) {
      casillero(MARGEN + ancho - anchoCasillero * 1.5, cy, t.hecha ? 'tilde' : null);
      casillero(MARGEN + ancho - anchoCasillero / 2, cy, terminada && !t.hecha ? 'cruz' : null);
    }
    y += alto;
  });
  y += 7;

  // repuestos por componente: lo previsto y una columna para anotar cuánto se usó (lo que se descuenta del stock)
  const reps = ot.repuestos;
  const blancos = terminada ? 0 : 2;
  if (reps.length || !terminada) {
    const cols = [
      { t: 'COMPONENTE', w: ancho * 0.25 }, { t: 'CÓDIGO', w: ancho * 0.18 }, { t: 'DESCRIPCIÓN', w: ancho * 0.37 },
      { t: 'PREV.', w: ancho * 0.1 }, { t: 'USADO', w: ancho * 0.1 },
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
    const filas = [...reps.map(r => [r.componente, r.codigo, r.descripcion, r.cantidad ? numeroCorto(r.cantidad) : '', terminada ? numeroCorto(r.usado ?? 0) : '']),
      ...Array.from({ length: blancos }, () => ['', '', '', '', ''])];
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
      if (!terminada) { doc.setDrawColor(120); doc.rect(MARGEN + ancho - cols[4].w + 2, y + 1.5, cols[4].w - 4, alto - 3); }
      y += alto;
    }
    y += 7;
  }

  // lugar para completar a mano (o lo ya cargado, si está terminada)
  const campo = (etiqueta: string, valor: string, renglones: number) => {
    const alto = 6 + renglones * 7;
    lugar(alto);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(etiqueta, MARGEN, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    if (valor) doc.text((doc.splitTextToSize(valor, ancho) as string[]).slice(0, renglones), MARGEN, y + 6);
    doc.setDrawColor(170);
    doc.setLineWidth(0.2);
    for (let r = 0; r < renglones; r++) doc.line(MARGEN, y + 7.5 + r * 7, MARGEN + ancho, y + 7.5 + r * 7);
    y += alto + 3;
  };
  if (ot.correctivo) {
    campo('Causa de la falla', terminada ? ot.correctivo.causa : '', 2);
    campo('Trabajo realizado', terminada ? ot.correctivo.solucion : '', 4);
  }
  // las horas de equipo parado, en correctivas y preventivas (vacío en una preventiva = no se paró), arriba de las observaciones
  {
    lugar(8);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Horas de equipo parado:', MARGEN, y);
    doc.setFont('helvetica', 'normal');
    const parada = ot.correctivo ? ot.correctivo.horasParada : ot.horasParada;
    doc.text(terminada ? (parada != null ? numeroCorto(parada) : '—') : '____________', MARGEN + 42, y);
    y += 7;
  }
  campo(esCorrectiva && !terminada ? 'Observaciones (si quedó algo pendiente)' : 'Observaciones', terminada ? ot.observaciones : '', ot.correctivo ? 2 : 3);

  // técnicos: cada uno con fecha de término, horario, horas hombre (HH) y firma
  const tecnicos: TrabajoTecnico[] = terminada
    ? (ot.tecnicos.length ? ot.tecnicos : [{ usuarioId: null, nombre: ot.asignado, fecha: ot.fechaCierre ?? '', inicio: '', fin: '' }])
    : [];
  const colsT = [
    { t: 'TÉCNICO', w: ancho * 0.3 }, { t: 'FECHA TÉRMINO', w: ancho * 0.16 }, { t: 'H. INICIO', w: ancho * 0.12 },
    { t: 'H. TÉRMINO', w: ancho * 0.12 }, { t: 'HH', w: ancho * 0.08 }, { t: 'FIRMA', w: ancho * 0.22 },
  ];
  const filasT = Math.max(terminada ? tecnicos.length : 3, 1);
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
  y += 8;

  // la liberación del equipo: los controles de entrega y la firma de quien lo recibe (en una terminada, lo que se tildó)
  const liberacion = terminada ? ot.liberacion : config.controlesLiberacion.length ? { controles: config.controlesLiberacion.map(texto => ({ texto, ok: false })), recibio: '' } : null;
  if (liberacion && liberacion.controles.length) {
    const porFila = Math.min(5, liberacion.controles.length);
    const filasL = Math.ceil(liberacion.controles.length / porFila);
    lugar(12 + filasL * 15 + 14);
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
      const x = MARGEN + (i % porFila) * anchoC;
      const yy = y + Math.floor(i / porFila) * 15;
      doc.setDrawColor(170);
      doc.setLineWidth(0.2);
      doc.rect(x, yy, anchoC, 15);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(doc.splitTextToSize(c.texto, anchoC - 4) as string[], x + anchoC / 2, yy + 4, { align: 'center' });
      casillero(x + anchoC / 2, yy + 10.5, c.ok ? 'tilde' : terminada ? 'cruz' : null);
    });
    y += filasL * 15 + 9;
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
  }
  piePagina();
}

/** Devuelve una función que arma el PDF de una o varias OT (una por hoja) y lo abre para imprimir. */
export function useImprimirOrdenes() {
  const toast = useToast();
  const s = useMantenimiento();
  return useCallback(async (ordenes: OrdenTrabajo[]) => {
    if (!ordenes.length) return;
    try {
      const equipos = s.equipos ?? [];
      const blob = await generarOtPdf(ordenes.map(ot => {
        const equipo = equipos.find(e => e.id === ot.equipoId);
        return {
          empresa: s.empresa.nombre, logo: s.empresa.logo, ot, equipo, config: s.config,
          padre: equipo?.padreId ? equipos.find(e => e.id === equipo.padreId) : undefined,
          rutina: s.rutinas?.find(r => r.id === ot.rutinaId),
        };
      }));
      abrirPdfBlob(blob);
    } catch {
      toast('No se pudo generar el PDF de la OT', 'error');
    }
  }, [s.equipos, s.empresa, s.rutinas, s.config, toast]);
}

/** Devuelve una función que arma el PDF de una planilla de tareas en blanco y lo abre para imprimir. */
export function useImprimirPlanilla() {
  const toast = useToast();
  const s = useMantenimiento();
  return useCallback(async (planilla: PlanillaTareas) => {
    try {
      abrirPdfBlob(await generarPlanillaPdf([{ empresa: s.empresa.nombre, logo: s.empresa.logo, planilla, config: s.config }]));
    } catch {
      toast('No se pudo generar el PDF de la planilla', 'error');
    }
  }, [s.empresa, s.config, toast]);
}
