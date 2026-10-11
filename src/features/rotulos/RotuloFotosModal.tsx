import { useRef, useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { useConfirm } from '../../components/ConfirmProvider';
import { publicUrl } from '../../lib/storage';
import { MAX_FOTOS_ROTULO, useEliminarRotuloFoto, useRotuloFotosQuery, useSubirRotuloFotos } from './useRotuloFotos';
import { Button } from '@/components/ui/button';
import { mensajeDeError } from '@/lib/errores';
import { Icono } from '@/components/Icono';

interface Props {
  open: boolean;
  onClose: () => void;
  grupoId: string | null;
  proveedorId: string | null;
  proveedorNombre: string;
}

function fotoUrl(path: string) {
  return publicUrl('rotulos', path);
}

export default function RotuloFotosModal({ open, onClose, grupoId, proveedorId, proveedorNombre }: Props) {
  const { data: fotos } = useRotuloFotosQuery(grupoId);
  const subirFotos = useSubirRotuloFotos();
  const eliminarFoto = useEliminarRotuloFoto();
  const toast = useToast();
  const confirmar = useConfirm();
  const inputCamaraRef = useRef<HTMLInputElement>(null);
  const inputGaleriaRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);

  const total = fotos?.length ?? 0;
  const lleno = total >= MAX_FOTOS_ROTULO;

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length || !grupoId || !proveedorId) return;
    const disponibles = MAX_FOTOS_ROTULO - total;
    if (disponibles <= 0) { toast(`Ya llegaste al máximo de ${MAX_FOTOS_ROTULO} fotos.`, 'error'); e.target.value = ''; return; }

    setSubiendo(true);
    try {
      await subirFotos.mutateAsync({ grupoId, proveedorId, proveedorNombre, files: files.slice(0, disponibles) });
    } catch (err) {
      toast('Error al subir una foto: ' + mensajeDeError(err), 'error');
    } finally {
      setSubiendo(false);
      e.target.value = '';
    }
  }

  async function handleDelete(id: string, storagePath: string) {
    if (!grupoId || !(await confirmar('¿Eliminar esta foto?', { textoConfirmar: 'Eliminar', peligroso: true }))) return;
    try {
      await eliminarFoto.mutateAsync({ id, storagePath, grupoId });
    } catch {
      toast('Error al eliminar la foto', 'error');
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={<><span className="accent"><Icono n="camara" /></span> Fotos del envío</>}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        {fotos?.map(f => (
          <div key={f.id} style={{ position: 'relative', width: 90, height: 90 }}>
            <a href={fotoUrl(f.storage_path)} target="_blank" rel="noopener noreferrer">
              <img src={fotoUrl(f.storage_path)} style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 8, border: '1.5px solid var(--border)' }} alt="" />
            </a>
            <button
              type="button" onClick={() => void handleDelete(f.id, f.storage_path)} title="Eliminar foto"
              style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: '50%', background: 'var(--danger)', color: 'white', border: 'none', cursor: 'pointer', fontSize: 12, lineHeight: 1 }}
            ><Icono n="cerrar" /></button>
          </div>
        ))}
        {!fotos?.length && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Todavía no hay fotos para este rótulo.</div>}
      </div>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label>Agregar fotos (hasta {MAX_FOTOS_ROTULO} en total)</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button type="button" variant="primary" style={{ flex: 1, justifyContent: 'center' }} disabled={lleno || subiendo} onClick={() => inputCamaraRef.current?.click()}><Icono n="camara" /> Sacar foto</Button>
          <Button type="button" variant="ghost" style={{ flex: 1, justifyContent: 'center' }} disabled={lleno || subiendo} onClick={() => inputGaleriaRef.current?.click()}><Icono n="imagen" /> Elegir de galería</Button>
        </div>
        <input ref={inputCamaraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => void handleUpload(e)} />
        <input ref={inputGaleriaRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => void handleUpload(e)} />
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
          {subiendo ? 'Subiendo...' : lleno ? `Llegaste al máximo de ${MAX_FOTOS_ROTULO} fotos.` : `${total}/${MAX_FOTOS_ROTULO} fotos`}
        </div>
      </div>
      <div className="modal-footer">
        <Button variant="ghost" onClick={onClose}>Cerrar</Button>
      </div>
    </Modal>
  );
}
