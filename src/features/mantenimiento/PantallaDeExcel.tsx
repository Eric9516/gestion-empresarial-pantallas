import { useRef, useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { fechaHoyISO } from '../../lib/fechaHoy';
import { mensajeDeError } from '../../lib/errores';
import { type Analisis, type Libro, HOJAS, descargarExcel, hayAlgoParaGuardar, leerArchivoExcel } from './excel';
import { Button } from '@/components/ui/button';
import { Icono, type NombreIcono } from '@/components/Icono';

type Resultado = { error: string | null; analisis?: Analisis };

interface Props {
  exportar: () => Promise<Libro>;
  analizar: (libro: Libro) => Promise<Resultado>;
  importar: (libro: Libro) => Promise<Resultado>;
}

// Mantenimiento → Excel (del diseño del socio): exportar todo, la plantilla vacía e importar con vista previa. Solo administradores.
export default function PantallaDeExcel({ exportar, analizar, importar }: Props) {
  const toast = useToast();
  const [trabajando, setTrabajando] = useState<'exportar' | 'plantilla' | null>(null);
  const [importarOpen, setImportarOpen] = useState(false);

  async function bajar(cual: 'exportar' | 'plantilla') {
    setTrabajando(cual);
    try {
      const hojas = await exportar();
      // la plantilla: las mismas hojas, solo con sus encabezados
      await descargarExcel(cual === 'plantilla' ? Object.fromEntries(Object.entries(hojas).map(([n, f]) => [n, f.slice(0, 1)])) : hojas,
        cual === 'plantilla' ? 'Plantilla-Mantenimiento.xlsx' : `Mantenimiento-${fechaHoyISO()}.xlsx`);
    } catch (err) {
      toast(mensajeDeError(err), 'error');
    } finally {
      setTrabajando(null);
    }
  }

  return (
    <div>
      <div className="section-header">
        <div className="section-title"><Icono n="planilla" /> Excel</div>
      </div>
      <div className="mt-excel-grid">
        <div className="mt-bloque">
          <div className="mt-bloque-titulo"><span><Icono n="importar" /> Importar desde Excel</span></div>
          <p>
            Cargá sectores, equipos, historial y repuestos críticos desde una planilla. Antes de guardar te muestra qué se va a agregar,
            qué se actualiza y qué filas tienen problemas. Sirve la plantilla, un Excel exportado de acá o el de la versión de ejemplo.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="primary" onClick={() => setImportarOpen(true)}><Icono n="importar" /> Importar</Button>
            <Button variant="ghost" onClick={() => void bajar('plantilla')} disabled={!!trabajando}><Icono n="planilla" /> {trabajando === 'plantilla' ? 'Generando...' : 'Descargar plantilla vacía'}</Button>
          </div>
        </div>
        <div className="mt-bloque">
          <div className="mt-bloque-titulo"><span><Icono n="exportar" /> Exportar todo</span></div>
          <p>Baja un Excel con una hoja por tema: {Object.values(HOJAS).join(', ')}.</p>
          <Button variant="primary" onClick={() => void bajar('exportar')} disabled={!!trabajando}><Icono n="exportar" /> {trabajando === 'exportar' ? 'Generando...' : 'Exportar a Excel'}</Button>
        </div>
      </div>
      <ImportarModal open={importarOpen} onClose={() => setImportarOpen(false)} analizar={analizar} importar={importar} />
    </div>
  );
}

function ImportarModal({ open, onClose, analizar, importar }: { open: boolean; onClose: () => void } & Pick<Props, 'analizar' | 'importar'>) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<'eligiendo' | 'analizando' | 'listo' | 'guardando'>('eligiendo');
  const [libro, setLibro] = useState<Libro | null>(null);
  const [analisis, setAnalisis] = useState<Analisis | null>(null);
  const [archivo, setArchivo] = useState('');

  function cerrar() {
    setEstado('eligiendo');
    setAnalisis(null);
    setLibro(null);
    setArchivo('');
    if (inputRef.current) inputRef.current.value = '';
    onClose();
  }

  async function leer(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setArchivo(file.name);
    setEstado('analizando');
    try {
      const leido = await leerArchivoExcel(file);
      const r = await analizar(leido);
      if (r.error || !r.analisis) throw new Error(r.error ?? 'No se pudo leer el archivo');
      setLibro(leido);
      setAnalisis(r.analisis);
      setEstado('listo');
    } catch (err) {
      toast(err instanceof Error && err.message !== 'No se pudo leer el archivo' ? mensajeDeError(err) : 'No se pudo leer el archivo. Verificá que sea un Excel (.xlsx o .xls).', 'error');
      setEstado('eligiendo');
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function confirmar() {
    if (!libro) return;
    setEstado('guardando');
    try {
      const r = await importar(libro);
      if (r.error || !r.analisis) throw new Error(r.error ?? 'No se pudo cargar el archivo. No se guardó nada.');
      const a = r.analisis;
      toast(`Listo: ${a.equiposNuevos.length} equipos nuevos, ${a.equiposActualizados.length} actualizados, ${a.intervenciones.length} registros de historial, ${a.repuestosNuevos.length + a.repuestosActualizados.length} repuestos críticos, ${a.planillasNuevas.length + a.planillasActualizadas.length} planillas y ${a.rutinasNuevas.length + a.rutinasActualizadas.length} rutinas.`, 'success');
      cerrar();
    } catch (err) {
      toast(mensajeDeError(err), 'error');
      setEstado('listo');
    }
  }

  const tarjetas: { label: string; n: number; icono: NombreIcono }[] = analisis ? [
    { label: 'Sectores / sub-sectores nuevos', n: analisis.sectoresNuevos.length, icono: 'lugar' },
    { label: 'Equipos nuevos', n: analisis.equiposNuevos.length, icono: 'nuevo' },
    { label: 'Equipos actualizados', n: analisis.equiposActualizados.length, icono: 'editar' },
    { label: 'Registros de historial', n: analisis.intervenciones.length, icono: 'historial' },
    { label: 'Repuestos críticos', n: analisis.repuestosNuevos.length + analisis.repuestosActualizados.length, icono: 'paquete' },
    { label: 'Planillas de tareas', n: analisis.planillasNuevas.length + analisis.planillasActualizadas.length, icono: 'planilla' },
    { label: 'Rutinas nuevas', n: analisis.rutinasNuevas.length, icono: 'calendario' },
    { label: 'Rutinas actualizadas', n: analisis.rutinasActualizadas.length, icono: 'editar' },
    { label: 'Sin cambios', n: analisis.sinCambios, icono: 'menos' },
  ] : [];

  return (
    <Modal
      open={open}
      onClose={cerrar}
      large
      title={<><Icono n="importar" /> Importar Mantenimiento desde Excel</>}
      footer={analisis ? (
        <>
          <Button variant="ghost" onClick={cerrar}>Cancelar</Button>
          <Button variant="success" disabled={!hayAlgoParaGuardar(analisis) || estado === 'guardando'} onClick={() => void confirmar()}>
            <Icono n="exito" /> {estado === 'guardando' ? 'Guardando...' : 'Confirmar carga'}
          </Button>
        </>
      ) : <Button variant="ghost" onClick={cerrar}>Cancelar</Button>}
    >
      {estado === 'eligiendo' && (
        <div className="form-group full">
          <label htmlFor="mt-importar-archivo">Archivo Excel (.xlsx / .xls)</label>
          <input id="mt-importar-archivo" ref={inputRef} type="file" accept=".xls,.xlsx" onChange={e => void leer(e)} style={{ display: 'block' }} />
          <p style={{ fontSize: 12, color: 'var(--text-mid)', marginTop: 10 }}>
            Se leen las hojas {Object.values(HOJAS).join(', ')}, por el nombre de cada columna (el orden no importa). Los equipos se reconocen
            por su código: si ya existe, se actualizan sus datos. Las filas repetidas del historial se saltean. Los repuestos críticos tienen que
            estar cargados en el Depósito (se buscan por su código).
          </p>
        </div>
      )}
      {estado === 'analizando' && <p style={{ color: 'var(--text-muted)' }}>Analizando {archivo}...</p>}
      {analisis && estado !== 'analizando' && (
        <div>
          <p style={{ fontSize: 13, color: 'var(--text-mid)', marginBottom: 14 }}>
            Archivo <strong>{archivo}</strong>{analisis.hojasLeidas.length > 0 ? <> — hojas leídas: {analisis.hojasLeidas.join(', ')}</> : ' — no tiene ninguna hoja conocida'}.
          </p>
          <div className="stats-row" style={{ marginBottom: 16 }}>
            {tarjetas.map(t => (
              <div key={t.label} className="stat-card">
                <div className="stat-icon green"><Icono n={t.icono} /></div>
                <div><div className="stat-number">{t.n}</div><div className="stat-label">{t.label}</div></div>
              </div>
            ))}
          </div>
          {analisis.ordenSectores && <p style={{ fontSize: 12, color: 'var(--text-mid)' }}>Orden de los sectores (según la hoja Sectores): {analisis.ordenSectores.join(' → ')}</p>}
          {analisis.equiposNuevos.length > 0 && (
            <p style={{ fontSize: 12, color: 'var(--text-mid)' }}>
              Nuevos: {analisis.equiposNuevos.slice(0, 12).map(e => e.codigo).join(', ')}{analisis.equiposNuevos.length > 12 && '...'}
            </p>
          )}
          {analisis.hojasParaDespues.length > 0 && (
            <p style={{ fontSize: 12, color: 'var(--text-mid)' }}>
              <Icono n="idea" /> Estas hojas no se cargan, son solo para mirar: {analisis.hojasParaDespues.join(', ')}. Las órdenes de trabajo las arman las rutinas y los manuales se suben en la ficha de cada equipo.
            </p>
          )}
          {analisis.avisos.length > 0 && (
            <div className="mt-errores" style={{ marginTop: 8 }}>
              {analisis.avisos.map((x, i) => <div key={i}><Icono n="idea" /> {x}</div>)}
            </div>
          )}
          {analisis.errores.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--danger)' }}>
                <Icono n="alerta" /> {analisis.errores.length} fila(s) con problemas: no se cargan. Corregilas en el Excel y volvé a importar.
              </div>
              <div className="mt-errores">
                {analisis.errores.map((er, i) => <div key={i}><strong>{er.hoja}, fila {er.fila}:</strong> {er.motivo}</div>)}
              </div>
            </div>
          )}
          {!hayAlgoParaGuardar(analisis) && !analisis.errores.length && <p style={{ fontSize: 13, color: 'var(--text-mid)' }}>No hay nada nuevo para cargar: todo coincide con lo que ya está.</p>}
        </div>
      )}
    </Modal>
  );
}
