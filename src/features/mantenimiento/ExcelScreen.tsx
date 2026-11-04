import { useRef, useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { registrarErrorAccion } from '../../lib/errorLogging';
import { fechaHoyISO } from '../../lib/fechaHoy';
import { useDatosDemo } from './almacenDemo';
import { armarHojas, armarPlantilla, descargarExcel, hayAlgoParaGuardar, HOJAS, type AnalisisImportacion } from './excelMantenimiento';
import { analizarArchivoMantenimiento, useAplicarImportacion } from './useExcelMantenimiento';
import { Button } from '@/components/ui/button';
import { Icono } from '@/components/Icono';

// Exportar todo a Excel, bajar la plantilla vacía e importar una planilla (con vista previa).
export default function ExcelScreen({ esAdmin }: { esAdmin: boolean }) {
  const datos = useDatosDemo();
  const toast = useToast();
  const [importarOpen, setImportarOpen] = useState(false);
  const [trabajando, setTrabajando] = useState(false);

  async function exportar() {
    setTrabajando(true);
    try {
      await descargarExcel(armarHojas(datos), `Mantenimiento-${fechaHoyISO()}.xlsx`);
    } catch (err) {
      await registrarErrorAccion('Error al exportar Mantenimiento a Excel', err);
      toast('No se pudo generar el Excel', 'error');
    } finally {
      setTrabajando(false);
    }
  }

  async function plantilla() {
    try {
      await descargarExcel(armarPlantilla(), 'Plantilla-Mantenimiento.xlsx');
    } catch (err) {
      await registrarErrorAccion('Error al generar la plantilla de Mantenimiento', err);
      toast('No se pudo generar la plantilla', 'error');
    }
  }

  return (
    <div>
      <div className="section-header">
        <div className="section-title"><Icono n="planilla" /> Excel</div>
      </div>
      <div className="mt-excel-grid">
        <div className="mt-bloque">
          <div className="mt-bloque-titulo"><span><Icono n="exportar" /> Exportar todo</span></div>
          <p>
            Baja un Excel con una hoja por tema: {Object.values(HOJAS).join(', ')}.
            ({datos.equipos.length} equipos, {datos.intervenciones.length} registros de historial, {datos.rutinas.length} rutinas, {datos.ordenes.length} órdenes.)
          </p>
          <Button variant="primary" onClick={() => void exportar()} disabled={trabajando}><Icono n="exportar" /> {trabajando ? 'Generando...' : 'Exportar a Excel'}</Button>
        </div>

        <div className="mt-bloque">
          <div className="mt-bloque-titulo"><span><Icono n="importar" /> Importar desde Excel</span></div>
          <p>
            Cargá equipos, historial, repuestos críticos y rutinas desde una planilla. Antes de guardar te muestra
            qué se va a agregar, qué se actualiza y qué filas tienen errores. Usá la plantilla o un Excel exportado de acá.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {esAdmin
              ? <Button variant="primary" onClick={() => setImportarOpen(true)}><Icono n="importar" /> Importar</Button>
              : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Solo un administrador de Mantenimiento puede importar.</span>}
            <Button variant="ghost" onClick={() => void plantilla()}><Icono n="planilla" /> Descargar plantilla vacía</Button>
          </div>
        </div>
      </div>
      <ImportarModal open={importarOpen} onClose={() => setImportarOpen(false)} />
    </div>
  );
}

function ImportarModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const aplicar = useAplicarImportacion();
  const inputRef = useRef<HTMLInputElement>(null);
  const [analizando, setAnalizando] = useState(false);
  const [analisis, setAnalisis] = useState<AnalisisImportacion | null>(null);
  const [archivo, setArchivo] = useState('');

  function cerrar() {
    setAnalisis(null);
    setArchivo('');
    if (inputRef.current) inputRef.current.value = '';
    onClose();
  }

  async function leer(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setArchivo(file.name);
    setAnalizando(true);
    setAnalisis(null);
    try {
      setAnalisis(await analizarArchivoMantenimiento(file));
    } catch (err) {
      await registrarErrorAccion('Error al leer el Excel de Mantenimiento', err);
      toast('No se pudo leer el archivo. Verificá que sea un Excel (.xlsx o .xls).', 'error');
    } finally {
      setAnalizando(false);
    }
  }

  async function confirmar() {
    if (!analisis) return;
    try {
      await aplicar.mutateAsync(analisis);
      toast('Importación guardada', 'success');
      cerrar();
    } catch (err) {
      await registrarErrorAccion('Error al guardar la importación de Mantenimiento', err);
      toast('No se pudo guardar la importación', 'error');
    }
  }

  const tarjetas = analisis ? [
    { label: 'Sectores / sub-sectores nuevos', n: analisis.sectoresNuevos.length, icono: 'fabrica' as const },
    { label: 'Equipos nuevos', n: analisis.equiposNuevos.length, icono: 'nuevo' as const },
    { label: 'Equipos actualizados', n: analisis.equiposActualizados.length, icono: 'editar' as const },
    { label: 'Registros de historial', n: analisis.intervenciones.length, icono: 'historial' as const },
    { label: 'Repuestos críticos', n: analisis.repuestosNuevos.length + analisis.repuestosActualizados.length, icono: 'paquete' as const },
    { label: 'Planillas de tareas', n: analisis.planillasNuevas.length + analisis.planillasActualizadas.length, icono: 'lista' as const },
    { label: 'Rutinas', n: analisis.rutinasNuevas.length + analisis.rutinasActualizadas.length, icono: 'calendario' as const },
    { label: 'Sin cambios', n: analisis.sinCambios, icono: 'menos' as const },
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
          <Button variant="success" disabled={!hayAlgoParaGuardar(analisis)} onClick={() => void confirmar()}><Icono n="exito" /> Confirmar carga</Button>
        </>
      ) : <Button variant="ghost" onClick={cerrar}>Cancelar</Button>}
    >
      {!analisis && !analizando && (
        <div className="form-group full">
          <label htmlFor="mt-importar-archivo">Archivo Excel (.xlsx / .xls)</label>
          <input id="mt-importar-archivo" ref={inputRef} type="file" accept=".xls,.xlsx" onChange={e => void leer(e)} style={{ display: 'block' }} />
          <p style={{ fontSize: 12, color: 'var(--text-mid)', marginTop: 10 }}>
            Se leen las hojas {HOJAS.sectores}, {HOJAS.equipos}, {HOJAS.historial}, {HOJAS.repuestos}, {HOJAS.planillas} y {HOJAS.rutinas}, por el nombre de cada columna (el orden no importa).
            Los equipos se reconocen por su código: si ya existe, se actualizan sus datos. Las filas repetidas del historial se saltean.
          </p>
        </div>
      )}
      {analizando && <p style={{ color: 'var(--text-muted)' }}>Analizando {archivo}...</p>}
      {analisis && (
        <div>
          <p style={{ fontSize: 13, color: 'var(--text-mid)', marginBottom: 14 }}>
            Archivo <strong>{archivo}</strong>{analisis.hojasLeidas.length > 0 && <> — hojas leídas: {analisis.hojasLeidas.join(', ')}</>}.
          </p>
          <div className="stats-row" style={{ marginBottom: 16 }}>
            {tarjetas.map(t => (
              <div key={t.label} className="stat-card">
                <div className="stat-icon green"><Icono n={t.icono} /></div>
                <div><div className="stat-number">{t.n}</div><div className="stat-label">{t.label}</div></div>
              </div>
            ))}
          </div>
          {analisis.ordenSectores && (
            <p style={{ fontSize: 12, color: 'var(--text-mid)' }}>Orden de los sectores (según la hoja Sectores): {analisis.ordenSectores.join(' → ')}</p>
          )}
          {analisis.equiposNuevos.length > 0 && (
            <p style={{ fontSize: 12, color: 'var(--text-mid)' }}>
              Nuevos: {analisis.equiposNuevos.slice(0, 12).map(e => e.codigo).join(', ')}{analisis.equiposNuevos.length > 12 && '...'}
            </p>
          )}
          {analisis.errores.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--danger)' }}>
                <Icono n="alerta" /> {analisis.errores.length} fila(s) con problemas: no se cargan. Corregilas en el Excel y volvé a importar.
              </div>
              <div className="mt-errores">
                {analisis.errores.map((er, i) => (
                  <div key={i}><strong>{er.hoja}{er.fila > 0 && `, fila ${er.fila}`}:</strong> {er.motivo}</div>
                ))}
              </div>
            </div>
          )}
          {!hayAlgoParaGuardar(analisis) && !analisis.errores.length && <p style={{ fontSize: 13, color: 'var(--text-mid)' }}>No hay nada nuevo para cargar: todo coincide con lo que ya está.</p>}
        </div>
      )}
    </Modal>
  );
}
