import { useEffect, useMemo, useRef, useState } from 'react';
import Copiable from '../../components/Copiable';
import MasAcciones from '../../components/MasAcciones';
import BotonVerMas from '../../components/BotonVerMas';
import { useConfirm } from '../../components/ConfirmProvider';
import { useToast } from '../../components/ToastProvider';
import { NOMBRE_EMPRESA_POR_DEFECTO } from '../../lib/empresa';
import { exportarExcel } from '../../lib/exportExcel';
import { fechaHoyISO } from '../../lib/fechaHoy';
import { descargarPdfBlob } from '../../lib/pdfBlob';
import { LETRAS_PDF, type LetraPdf } from '../../lib/preferencias';
import { generarTablaPdf, type SeccionPdf } from '../../lib/tablaPdf';
import { isOwner } from '../../lib/types';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { usePedido } from '../../lib/usePedido';
import {
  ACCIONES, agruparActividad, AVISO_DESCARGA, etiquetaSobre, fechaYHora, hayFiltros, MAXIMO_EN_PANTALLA, NOMBRE_ACCION, opcionesDeSobre, POR_PAGINA_HISTORIAL,
  SIN_FILTROS, SOBRE, tituloDeGrupo, type Accion, type FilaActividad, type FiltrosHistorial,
} from './historialDeActividad';
import { useServicioDeConfiguracion, type ServicioDeConfiguracion } from './servicioDeConfiguracion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Icono } from '@/components/Icono';
import { mensajeDeError } from '@/lib/errores';

const COLOR_ACCION: Record<string, string> = { alta: 'badge-active', carga: 'badge-active', salida: 'badge-rubro', modificacion: 'badge-rubro', eliminacion: 'badge-inactive' };

// Accesos rápidos de fechas (desde y hasta, en el formato del campo de fecha).
function rango(cual: 'hoy' | 'semana' | 'mes'): { desde: string; hasta: string } {
  const hoy = fechaHoyISO();
  const d = new Date(`${hoy}T12:00:00`);
  if (cual === 'semana') d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // desde el lunes
  if (cual === 'mes') d.setDate(1);
  const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  return { desde: cual === 'hoy' ? hoy : iso(d), hasta: hoy };
}

type PedirPagina = ServicioDeConfiguracion['historial']['pagina'];

// El historial en pantalla: de a 50, los más nuevos primero, y "Ver más" hasta 150 (para lo más viejo se filtra). Cada página sigue desde la
// última fila de la anterior, así que no se hace más lenta con los años. Mientras llegan los filtros nuevos se sigue viendo lo anterior.
function useHistorialDeActividad(f: FiltrosHistorial, pedir: PedirPagina) {
  const clave = JSON.stringify(f);
  const [estado, setEstado] = useState<{ filas: FilaActividad[]; ultima: number } | null>(null);
  const [error, setError] = useState(false);
  const [cargandoMas, setCargandoMas] = useState(false);
  const actual = useRef({ f, pedir });
  useEffect(() => { actual.current = { f, pedir }; });

  useEffect(() => {
    let vigente = true;
    actual.current.pedir(actual.current.f, null, POR_PAGINA_HISTORIAL)
      .then(filas => { if (vigente) { setEstado({ filas, ultima: filas.length }); setError(false); } })
      .catch(() => { if (vigente) setError(true); });
    return () => { vigente = false; };
  }, [clave]);

  const filas = useMemo(() => estado?.filas ?? [], [estado]);
  const paginaCompleta = estado?.ultima === POR_PAGINA_HISTORIAL;
  async function verMas() {
    if (!estado || cargandoMas) return;
    setCargandoMas(true);
    try {
      const mas = await actual.current.pedir(actual.current.f, estado.filas[estado.filas.length - 1], POR_PAGINA_HISTORIAL);
      setEstado(e => e && { filas: [...e.filas, ...mas], ultima: mas.length });
    } catch { setError(true); } finally { setCargandoMas(false); }
  }
  return {
    filas,
    isLoading: estado === null && !error,
    isError: error,
    hayMas: paginaCompleta && filas.length < MAXIMO_EN_PANTALLA,
    // se llegó al máximo de la pantalla y todavía hay cambios más viejos
    llegoAlMaximo: filas.length >= MAXIMO_EN_PANTALLA && paginaCompleta,
    cargandoMas,
    verMas: () => void verMas(),
  };
}

/** Todo lo que cumple los filtros, para descargar (de a 5000 por pedido). */
async function todoElHistorial(f: FiltrosHistorial, pedir: PedirPagina): Promise<FilaActividad[]> {
  const LOTE = 5000;
  const todas: FilaActividad[] = [];
  for (;;) {
    const lote = await pedir(f, todas.at(-1) ?? null, LOTE);
    todas.push(...lote);
    if (lote.length < LOTE) return todas;
  }
}

// Historial de actividad: qué se hizo, quién y cuándo, agrupado por repuesto (o proveedor, usuario…), solo con lo que cambió.
// Se filtra por persona, depósito, sobre qué, qué hizo, fechas y texto; en pantalla van los 50 más nuevos ("Ver más" hasta 150)
// y la descarga (Excel o PDF) trae todo lo filtrado.
export default function HistorialPane() {
  const { perfil, config, letraPdf, cambiarLetraPdf, historial, registrarError } = useServicioDeConfiguracion();
  const dueno = isOwner(perfil);
  const toast = useToast();
  const confirmar = useConfirm();
  const [f, setF] = useState<FiltrosHistorial>(SIN_FILTROS);
  const texto = useDebouncedValue(f.texto, 300);
  const filtros = useMemo(() => ({ ...f, texto }), [f, texto]);
  const cambiar = (cambios: Partial<FiltrosHistorial>) => setF(prev => ({ ...prev, ...cambios }));

  const { filas, isLoading, isError, hayMas, llegoAlMaximo, cargandoMas, verMas } = useHistorialDeActividad(filtros, historial.pagina);
  const { data: personas } = usePedido('personas', historial.personas);
  const { data: depositos } = usePedido(`depositos|${f.usuario}`, () => historial.depositos(f.usuario), true);
  const grupos = useMemo(() => agruparActividad(filas), [filas]);
  const [descargando, setDescargando] = useState(false);

  const alternarAccion = (a: Accion) => cambiar({ acciones: f.acciones.includes(a) ? f.acciones.filter(x => x !== a) : [...f.acciones, a] });

  // Los filtros, en palabras (para el encabezado de lo que se descarga).
  function filtrosEnPalabras(): string {
    return [
      f.usuario && `Persona: ${personas?.find(p => p.id === f.usuario)?.nombre ?? ''}`,
      f.deposito && `Depósito: ${depositos?.find(d => d.id === f.deposito)?.nombre ?? ''}`,
      f.sobre && SOBRE.find(s => s.id === f.sobre)?.nombre,
      f.acciones.length > 0 && f.acciones.map(a => NOMBRE_ACCION[a]).join(', '),
      (f.desde || f.hasta) && `Fechas: ${f.desde ? f.desde.split('-').reverse().join('/') : 'el principio'} a ${f.hasta ? f.hasta.split('-').reverse().join('/') : 'hoy'}`,
      texto.trim() && `Búsqueda: "${texto.trim()}"`,
    ].filter(Boolean).join(' · ') || 'ninguno (todo el historial)';
  }

  async function descargar(formato: 'excel' | 'pdf') {
    setDescargando(true);
    try {
      const cantidad = await historial.cantidad(filtros, AVISO_DESCARGA + 1);
      if (cantidad > AVISO_DESCARGA && !(await confirmar(
        `Lo filtrado tiene más de ${AVISO_DESCARGA.toLocaleString('es-AR')} cambios. Te conviene filtrar por persona, depósito, fechas o qué hizo para que el archivo sea más chico. ¿Lo descargás igual?`,
        { titulo: 'Descarga grande', textoConfirmar: 'Descargar igual' },
      ))) return;
      const todas = await todoElHistorial(filtros, historial.pagina);
      if (todas.length === 0) { toast('No hay cambios con esos filtros.', 'error'); return; }
      const nombre = `historial_${fechaHoyISO()}`;
      if (formato === 'excel') {
        await exportarExcel(todas.map(x => ({
          Fecha: fechaYHora(x.momento), Persona: x.usuario_nombre || 'Sistema', 'Sobre qué': etiquetaSobre(x.sobre), Código: x.codigo ?? '', 'Descripción o nombre': x.titulo,
          Depósito: x.deposito ?? '', 'Qué hizo': NOMBRE_ACCION[x.accion] ?? x.accion, Detalle: x.detalle,
        })), 'Historial', `${nombre}.xlsx`);
      } else {
        const fila = (x: FilaActividad) => [fechaYHora(x.momento), x.usuario_nombre || 'Sistema', NOMBRE_ACCION[x.accion] ?? x.accion, x.detalle];
        const secciones: SeccionPdf[] = agruparActividad(todas).map(g => ({
          titulos: [{ texto: `${tituloDeGrupo(g)}${g.deposito ? ` · ${g.deposito}` : ''}`, nivel: 1 }],
          filas: g.filas.map(fila),
        }));
        const blob = await generarTablaPdf({
          letra: letraPdf,
          empresa: config?.empresa_nombre || NOMBRE_EMPRESA_POR_DEFECTO,
          logo: config?.logo_base64 || '',
          titulo: 'Historial de actividad',
          encabezadoUnaVez: true,
          fecha: fechaHoyISO(),
          datos: [{ etiqueta: 'Filtros', texto: filtrosEnPalabras() }, { etiqueta: 'Cambios', texto: todas.length.toLocaleString('es-AR') }],
          columnas: [{ header: 'FECHA', ancho: 27 }, { header: 'PERSONA', ancho: 32 }, { header: 'QUÉ HIZO', ancho: 30 }, { header: 'DETALLE' }],
          secciones,
        });
        descargarPdfBlob(blob, `${nombre}.pdf`);
      }
    } catch (err) {
      await registrarError('Error al descargar el historial de actividad', err);
      toast('No se pudo descargar: ' + mensajeDeError(err), 'error');
    } finally {
      setDescargando(false);
    }
  }

  return (
    <div className="admin-card">
      <div className="admin-card-header"><Icono n="historial" /> Historial de actividad</div>

      <div className="toolbar historial-filtros">
        <Select className="filter-select" aria-label="Persona" value={f.usuario} onChange={e => cambiar({ usuario: e.target.value, deposito: '' })}>
          <option value="">Todas las personas</option>
          {personas?.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </Select>
        <Select className="filter-select" aria-label="Depósito" value={f.deposito} onChange={e => cambiar({ deposito: e.target.value, sobre: opcionesDeSobre(e.target.value, dueno).some(s => s.id === f.sobre) ? f.sobre : '' })}>
          <option value="">Todos los depósitos</option>
          {depositos?.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
        </Select>
        <Select className="filter-select" aria-label="Sobre qué" value={f.sobre} onChange={e => cambiar({ sobre: e.target.value })}>
          <option value="">Sobre todo</option>
          {opcionesDeSobre(f.deposito, dueno).map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </Select>
        <div className="search-wrap">
          <Input type="search" placeholder="Código, descripción o nombre..." aria-label="Buscar" value={f.texto} onChange={e => cambiar({ texto: e.target.value })} />
        </div>
        <MasAcciones
          acciones={[
            { clave: 'excel', texto: 'Descargar Excel', icono: <Icono n="planilla" />, deshabilitada: descargando || filas.length === 0, onClick: () => void descargar('excel') },
            { clave: 'pdf', texto: 'Descargar PDF', icono: <Icono n="exportar" />, deshabilitada: descargando || filas.length === 0, onClick: () => void descargar('pdf') },
          ]}
          grupos={[{ titulo: 'Letra del PDF', opciones: LETRAS_PDF, elegida: letraPdf, onElegir: id => cambiarLetraPdf(id as LetraPdf) }]}
        />
      </div>
      <div className="toolbar historial-filtros">
        <div role="group" aria-label="Qué hizo" className="historial-chips">
          {ACCIONES.map(a => (
            <button key={a.id} type="button" className={`historial-chip${f.acciones.includes(a.id) ? ' activo' : ''}`} aria-pressed={f.acciones.includes(a.id)} onClick={() => alternarAccion(a.id)}>
              {a.nombre}
            </button>
          ))}
        </div>
        <div className="historial-fechas">
          <Input type="date" aria-label="Desde" title="Desde" value={f.desde} onChange={e => cambiar({ desde: e.target.value })} style={{ width: 150 }} />
          <Input type="date" aria-label="Hasta" title="Hasta" value={f.hasta} onChange={e => cambiar({ hasta: e.target.value })} style={{ width: 150 }} />
          <Button variant="ghost" size="sm" onClick={() => cambiar(rango('hoy'))}>Hoy</Button>
          <Button variant="ghost" size="sm" onClick={() => cambiar(rango('semana'))}>Esta semana</Button>
          <Button variant="ghost" size="sm" onClick={() => cambiar(rango('mes'))}>Este mes</Button>
          {hayFiltros(f) && <Button variant="ghost" size="sm" onClick={() => setF(SIN_FILTROS)}><Icono n="cerrar" /> Quitar filtros</Button>}
        </div>
      </div>

      <div className="admin-card-body">
        {isLoading && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Cargando...</p>}
        {isError && <p style={{ color: 'var(--danger)', fontSize: 13 }}>No se pudo cargar el historial.</p>}
        {!isLoading && !isError && grupos.length === 0 && (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>{hayFiltros(f) ? 'No hay cambios con esos filtros.' : 'Todavía no hay actividad registrada.'}</p>
        )}
        {grupos.map(g => (
          <section key={g.clave} className="historial-grupo" aria-label={tituloDeGrupo(g)}>
            <div className="historial-grupo-titulo">
              <strong>{g.titulo || etiquetaSobre(g.sobre)}</strong>
              {g.codigo && <span className="historial-codigo"><Copiable texto={g.codigo} que="código" /></span>}
              {g.sobre !== 'repuesto' && <span className="badge">{etiquetaSobre(g.sobre)}</span>}
              {g.deposito && <span className="historial-deposito">{g.deposito}</span>}
            </div>
            {g.filas.map(x => (
              <div key={x.id} className="historial-fila">
                <span className="historial-cuando">{fechaYHora(x.momento)}</span>
                <span className="historial-quien">{x.usuario_nombre || 'Sistema'}</span>
                <span><span className={`badge ${COLOR_ACCION[x.accion] ?? ''}`}>{NOMBRE_ACCION[x.accion] ?? x.accion}</span></span>
                <span className="historial-detalle">{x.detalle}</span>
              </div>
            ))}
          </section>
        ))}
        {!isLoading && !isError && <BotonVerMas hayMas={hayMas} cargando={cargandoMas} mostrando={filas.length} onClick={verMas} />}
        {llegoAlMaximo && (
          <p className="historial-aviso"><Icono n="idea" /> Para ver cambios más viejos, filtrá por persona, depósito, fechas o qué hizo.</p>
        )}
      </div>
    </div>
  );
}
