import { useState } from 'react';
import Modal from '../../components/Modal';
import { generarQRPDF, type FormatoEtiqueta } from '../../lib/generarQrPdf';
import FormatoEtiquetaSelect from './FormatoEtiquetaSelect';
import type { Item } from './useItems';
import { Button } from '@/components/ui/button';
import { Icono } from '@/components/Icono';

interface Props {
  open: boolean;
  onClose: () => void;
  item: Item | null;
}

export default function DescargarQrModal({ open, onClose, item }: Props) {
  const [formato, setFormato] = useState<FormatoEtiqueta>('qr_codigo');

  if (!item) return null;

  function handleDescargar() {
    if (!item) return;
    void generarQRPDF([item], `qr_${item.codigo}.pdf`, formato);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={<><Icono n="etiqueta" /> Descargar QR — {item.codigo}</>}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="success" onClick={handleDescargar}><Icono n="importar" /> Descargar</Button>
        </>
      }
    >
      <FormatoEtiquetaSelect value={formato} onChange={setFormato} />
    </Modal>
  );
}
