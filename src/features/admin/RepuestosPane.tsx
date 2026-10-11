import { useState } from 'react';
import ItemForm from '../items/ItemForm';
import GenerarQrModal from '../items/GenerarQrModal';
import ImportarStockModal from '../items/ImportarStockModal';
import { Button } from '@/components/ui/button';
import { Icono } from '@/components/Icono';

export default function RepuestosPane() {
  const [formOpen, setFormOpen] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [importarStockOpen, setImportarStockOpen] = useState(false);

  return (
    <div className="admin-card" style={{ maxWidth: 560 }}>
      <div className="admin-card-header"><Icono n="herramienta" /> Repuestos</div>
      <div className="admin-card-body">
        <p style={{ fontSize: 13, color: 'var(--text-mid)', marginBottom: 14 }}>
          Para editar o eliminar un repuesto existente, buscalo en la pestaña "Buscar" del Depósito y usá los botones de esa fila.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="primary" onClick={() => setFormOpen(true)}>+ Nuevo repuesto</Button>
          <Button variant="ghost" onClick={() => setQrModalOpen(true)}><Icono n="etiqueta" /> Generar etiquetas QR</Button>
          <Button variant="ghost" onClick={() => setImportarStockOpen(true)}><Icono n="importar" /> Importar stock desde Excel</Button>
        </div>
      </div>
      <ItemForm open={formOpen} onClose={() => setFormOpen(false)} item={null} />
      <GenerarQrModal open={qrModalOpen} onClose={() => setQrModalOpen(false)} />
      <ImportarStockModal open={importarStockOpen} onClose={() => setImportarStockOpen(false)} />
    </div>
  );
}
