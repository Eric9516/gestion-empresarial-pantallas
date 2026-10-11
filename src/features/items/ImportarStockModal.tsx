import { useRef, useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { registrarErrorAccion } from '../../lib/errorLogging';
import { analizarExcelStock, useAplicarImportacionStock, type AnalisisImportacion } from './useImportarStock';
import { Button } from '@/components/ui/button';
import { Icono } from '@/components/Icono';

export default function ImportarStockModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const aplicar = useAplicarImportacionStock();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [analizando, setAnalizando] = useState(false);
  const [analisis, setAnalisis] = useState<AnalisisImportacion | null>(null);
  const [nombreArchivo, setNombreArchivo] = useState('');

  function handleClose() {
    setAnalisis(null);
    setNombreArchivo('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    onClose();
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setNombreArchivo(file.name);
    setAnalizando(true);
    setAnalisis(null);
    try {
      const resultado = await analizarExcelStock(file);
      setAnalisis(resultado);
    } catch (err) {
      await registrarErrorAccion('Error al leer el Excel de stock', err);
      toast('No se pudo leer el archivo. Verificá que sea el Excel correcto.', 'error');
    } finally {
      setAnalizando(false);
    }
  }

  async function handleConfirmar() {
    if (!analisis) return;
    try {
      await aplicar.mutateAsync([...analisis.nuevos, ...analisis.modificados]);
      toast(`Listo: ${analisis.nuevos.length} nuevos, ${analisis.modificados.length} actualizados.`, 'success');
      handleClose();
    } catch (err) {
      await registrarErrorAccion('Error al guardar la importación de stock', err);
      toast('Error al guardar los cambios en la base.', 'error');
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      large
      title={<><Icono n="importar" /> Importar stock desde Excel</>}
      footer={
        analisis ? (
          <>
            <Button variant="ghost" onClick={handleClose}>Cancelar</Button>
            <Button
              variant="success"
              disabled={aplicar.isPending || (analisis.nuevos.length === 0 && analisis.modificados.length === 0)}
              onClick={handleConfirmar}
            >
              {aplicar.isPending ? 'Guardando...' : <><Icono n="exito" /> Confirmar carga ({analisis.nuevos.length + analisis.modificados.length})</>}
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={handleClose}>Cancelar</Button>
        )
      }
    >
      {!analisis && !analizando && (
        <div className="form-group full">
          <label htmlFor="importar-stock-modal-1">Archivo Excel (.xls / .xlsx)</label>
          <input id="importar-stock-modal-1" ref={fileInputRef} type="file" accept=".xls,.xlsx" onChange={handleFile} style={{ display: 'block' }} />
          <p style={{ fontSize: 12, color: 'var(--text-mid)', marginTop: 10 }}>
            Se toma la columna V como código, W como descripción, S como stock, B como stock
            mínimo y C como punto de pedido. La fila 1 se asume encabezado. El código se cruza
            contra el del sistema: si ya existe, se actualizan stock, descripción, mínimo y punto de
            pedido; si no existe, se da de alta como repuesto nuevo.
          </p>
        </div>
      )}

      {analizando && <p style={{ color: 'var(--text-muted)' }}>Analizando {nombreArchivo}...</p>}

      {analisis && (
        <div>
          <p style={{ fontSize: 13, color: 'var(--text-mid)', marginBottom: 14 }}>
            Archivo <strong>{nombreArchivo}</strong> — {analisis.totalFilas} filas leídas.
          </p>

          <div className="stats-row" style={{ marginBottom: 16 }}>
            <div className="stat-card">
              <div className="stat-icon green"><Icono n="nuevo" /></div>
              <div><div className="stat-number">{analisis.nuevos.length}</div><div className="stat-label">Nuevos</div></div>
            </div>
            <div className="stat-card">
              <div className="stat-icon blue"><Icono n="editar" /></div>
              <div><div className="stat-number">{analisis.modificados.length}</div><div className="stat-label">Modificados</div></div>
            </div>
            <div className="stat-card">
              <div className="stat-icon"><Icono n="menos" /></div>
              <div><div className="stat-number">{analisis.sinCambiosCount}</div><div className="stat-label">Sin cambios</div></div>
            </div>
          </div>

          {analisis.noProcesados.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
                
                <Icono n="alerta" /> {analisis.noProcesados.length} fila(s) no se pudieron procesar — revisalas a mano
              </div>
              <div style={{ maxHeight: 180, overflowY: 'auto', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                {analisis.noProcesados.map((f, i) => (
                  <div key={i} style={{ padding: '8px 12px', fontSize: 12, borderBottom: '1px solid var(--border)' }}>
                    <strong>{f.codigoOriginal}</strong> — {f.descripcion}
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
