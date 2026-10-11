import { useRef, useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { registrarErrorAccion } from '../../lib/errorLogging';
import { analizarExcelFamilias, useAplicarImportacionFamilias, useSubirPlanillaFamilias, type AnalisisFamilias } from './useImportarFamilias';
import { Button } from '@/components/ui/button';
import { mensajeDeError } from '@/lib/errores';
import { Icono } from '@/components/Icono';

export default function ImportarFamiliasModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const aplicar = useAplicarImportacionFamilias();
  const subirPlanilla = useSubirPlanillaFamilias();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [analizando, setAnalizando] = useState(false);
  const [analisis, setAnalisis] = useState<AnalisisFamilias | null>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  // Conflictos que el usuario eligió reemplazar por el nombre del Excel.
  // Claves: "f:<codigo>" para familias, "s:<familia><codigo>" para subfamilias.
  const [reemplazar, setReemplazar] = useState<Set<string>>(new Set());

  function alternarReemplazo(clave: string) {
    setReemplazar(prev => {
      const siguiente = new Set(prev);
      if (siguiente.has(clave)) siguiente.delete(clave); else siguiente.add(clave);
      return siguiente;
    });
  }

  function handleClose() {
    setAnalisis(null);
    setReemplazar(new Set());
    setArchivo(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    onClose();
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setArchivo(file);
    setAnalizando(true);
    setAnalisis(null);
    setReemplazar(new Set());
    try {
      const resultado = await analizarExcelFamilias(file);
      setAnalisis(resultado);
    } catch (err) {
      await registrarErrorAccion('Error al leer el Excel de familias/subfamilias', err);
      toast('No se pudo leer el archivo. Verificá que sea el Excel correcto.', 'error');
    } finally {
      setAnalizando(false);
    }
  }

  async function handleConfirmar() {
    if (!analisis || !archivo) return;
    const familiasCompletar = [
      ...analisis.familiasCompletar,
      ...analisis.familiasConflicto
        .filter(f => reemplazar.has(`f:${f.codigo}`))
        .map(f => ({ id: f.id, codigo: f.codigo, nombre: f.nombreExcel })),
    ];
    const subfamiliasCompletar = [
      ...analisis.subfamiliasCompletar,
      ...analisis.subfamiliasConflicto
        .filter(s => reemplazar.has(`s:${s.familiaCodigo}${s.codigo}`))
        .map(s => ({ id: s.id, familiaId: s.familiaId, codigo: s.codigo, nombre: s.nombreExcel })),
    ];
    try {
      await aplicar.mutateAsync({
        familiasNuevas: analisis.familiasNuevas,
        familiasCompletar,
        subfamiliasNuevas: analisis.subfamiliasNuevas,
        subfamiliasCompletar,
      });
      await subirPlanilla.mutateAsync(archivo);
      toast(
        `Listo: ${analisis.familiasNuevas.length + analisis.subfamiliasNuevas.length} nuevas, ${familiasCompletar.length + subfamiliasCompletar.length} nombres actualizados.`,
        'success',
      );
      handleClose();
    } catch (err) {
      await registrarErrorAccion('Error al importar familias/subfamilias desde Excel', err);
      toast('Error al guardar los cambios: ' + mensajeDeError(err), 'error');
    }
  }

  const cargando = aplicar.isPending || subirPlanilla.isPending;
  const totalCambios = analisis
    ? analisis.familiasNuevas.length + analisis.subfamiliasNuevas.length + analisis.familiasCompletar.length + analisis.subfamiliasCompletar.length + reemplazar.size
    : 0;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      large
      title={<><Icono n="etiqueta" /> Importar familias y subfamilias</>}
      footer={
        analisis ? (
          <>
            <Button variant="ghost" onClick={handleClose}>Cancelar</Button>
            <Button variant="success" disabled={cargando} onClick={() => void handleConfirmar()}>
              {cargando ? 'Guardando...' : <><Icono n="exito" /> Confirmar ({totalCambios})</>}
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={handleClose}>Cancelar</Button>
        )
      }
    >
      {!analisis && !analizando && (
        <div className="form-group full">
          <label htmlFor="importar-familias-modal-1">Archivo Excel (.xlsx)</label>
          <input id="importar-familias-modal-1" ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={e => void handleFile(e)} style={{ display: 'block' }} />
          <p style={{ fontSize: 12, color: 'var(--text-mid)', marginTop: 10 }}>
            Se toma la columna B como nombre de familia, C como su código, D como nombre de
            subfamilia y E como su código. Si un código ya existe pero todavía no tiene nombre
            real (el código repetido como nombre), se le completa el nombre del Excel. Si ya
            tiene un nombre real distinto, se avisa y vos elegís si reemplazarlo.
          </p>
        </div>
      )}

      {analizando && <p style={{ color: 'var(--text-muted)' }}>Analizando...</p>}

      {analisis && (
        <div>
          <p style={{ fontSize: 13, color: 'var(--text-mid)', marginBottom: 14 }}>
            {analisis.totalFamilias} familias y {analisis.totalSubfamilias} subfamilias leídas del archivo.
          </p>

          <div className="stats-row" style={{ marginBottom: 16 }}>
            <div className="stat-card">
              <div className="stat-icon green"><Icono n="nuevo" /></div>
              <div><div className="stat-number">{analisis.familiasNuevas.length + analisis.subfamiliasNuevas.length}</div><div className="stat-label">Nuevas</div></div>
            </div>
            <div className="stat-card">
              <div className="stat-icon blue"><Icono n="editar" /></div>
              <div><div className="stat-number">{analisis.familiasCompletar.length + analisis.subfamiliasCompletar.length}</div><div className="stat-label">Nombres completados</div></div>
            </div>
            <div className="stat-card">
              <div className="stat-icon"><Icono n="alerta" /></div>
              <div><div className="stat-number">{analisis.familiasConflicto.length + analisis.subfamiliasConflicto.length}</div><div className="stat-label">Nombres distintos</div></div>
            </div>
          </div>

          {totalCambios === 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No hay nada nuevo ni nombres para completar.</p>
          )}

          {(analisis.familiasConflicto.length > 0 || analisis.subfamiliasConflicto.length > 0) && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}><Icono n="alerta" /> Ya tienen un nombre distinto</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                Por defecto no se tocan. Tildá los que querés reemplazar por el nombre del Excel.
              </div>
              <div style={{ maxHeight: 160, overflowY: 'auto', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                {analisis.familiasConflicto.map(f => {
                  const clave = `f:${f.codigo}`;
                  return (
                    <label key={clave} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 12px', fontSize: 12, borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={reemplazar.has(clave)} onChange={() => alternarReemplazo(clave)} style={{ marginTop: 2 }} />
                      <span>
                        <strong>{f.codigo}</strong> — en el sistema: "{f.nombreActual}", en el Excel: "{f.nombreExcel}"
                      </span>
                    </label>
                  );
                })}
                {analisis.subfamiliasConflicto.map(s => {
                  const clave = `s:${s.familiaCodigo}${s.codigo}`;
                  return (
                    <label key={clave} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 12px', fontSize: 12, borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={reemplazar.has(clave)} onChange={() => alternarReemplazo(clave)} style={{ marginTop: 2 }} />
                      <span>
                        <strong>{s.familiaCodigo}{s.codigo}</strong> — en el sistema: "{s.nombreActual}", en el Excel: "{s.nombreExcel}"
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {analisis.noProcesados.length > 0 && (
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}><Icono n="alerta" /> {analisis.noProcesados.length} fila(s) no procesadas</div>
              <div style={{ maxHeight: 160, overflowY: 'auto', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                {analisis.noProcesados.map((f, i) => (
                  <div key={i} style={{ padding: '8px 12px', fontSize: 12, borderBottom: '1px solid var(--border)' }}>
                    <strong>{f.familiaCodigo}{f.codigo}</strong> — {f.nombre}
                    <div style={{ color: 'var(--text-muted)' }}>{f.motivo}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
