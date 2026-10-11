import { useEffect, useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { useExportarRetirosPeriodo } from './useRetiros';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { mensajeDeError } from '@/lib/errores';
import { Icono } from '@/components/Icono';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ExportarPeriodoModal({ open, onClose }: Props) {
  const toast = useToast();
  const exportarPeriodo = useExportarRetirosPeriodo();
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setDesde(''); setHasta(''); } }, [open]);

  async function handleExportar() {
    if (!desde || !hasta) { toast('Elegí las dos fechas', 'error'); return; }
    setSaving(true);
    try {
      const cantidad = await exportarPeriodo.mutateAsync({ desde, hasta });
      if (!cantidad) { toast('No hay retiros para exportar', 'error'); return; }
      onClose();
    } catch (e) {
      toast('Error al exportar: ' + mensajeDeError(e), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={<><span className="accent"><Icono n="calendario" /></span> Exportar por período</>}>
      <div className="form-grid">
        <div className="form-group"><label htmlFor="exportar-periodo-modal-1">Desde</label><Input id="exportar-periodo-modal-1" type="date" value={desde} onChange={e => setDesde(e.target.value)} /></div>
        <div className="form-group"><label htmlFor="exportar-periodo-modal-2">Hasta</label><Input id="exportar-periodo-modal-2" type="date" value={hasta} onChange={e => setHasta(e.target.value)} /></div>
      </div>
      <div className="modal-footer">
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button variant="success" onClick={() => void handleExportar()} disabled={saving}>Exportar</Button>
      </div>
    </Modal>
  );
}
