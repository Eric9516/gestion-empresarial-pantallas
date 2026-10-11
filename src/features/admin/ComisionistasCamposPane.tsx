import { useEffect, useState } from 'react';
import { useToast } from '../../components/ToastProvider';
import { useCamposCustomQuery, type CampoCustom } from '../config/useCamposCustom';
import { useSaveCamposCustom } from '../config/useConfiguracion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Icono } from '@/components/Icono';

const TIPOS: { value: CampoCustom['tipo']; label: string }[] = [
  { value: 'text', label: 'Texto' },
  { value: 'tel', label: 'Teléfono' },
  { value: 'number', label: 'Número' },
  { value: 'email', label: 'Email' },
  { value: 'textarea', label: 'Texto largo' },
];

export default function ComisionistasCamposPane() {
  const { data: camposCustom } = useCamposCustomQuery();
  const saveCamposCustom = useSaveCamposCustom();
  const toast = useToast();
  const [campos, setCampos] = useState<CampoCustom[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (camposCustom) setCampos(camposCustom); }, [camposCustom]);

  function addRow() {
    setCampos(prev => [...prev, { id: `custom_${Date.now()}`, label: '', tipo: 'text' }]);
  }

  function removeRow(idx: number) {
    setCampos(prev => prev.filter((_, i) => i !== idx));
  }

  function updateRow(idx: number, patch: Partial<CampoCustom>) {
    setCampos(prev => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const validos = campos.filter(c => c.label.trim());
      await saveCamposCustom.mutateAsync(validos);
      setCampos(validos);
      toast('Campos guardados', 'success');
    } catch {
      toast('Error al guardar campos', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-card" style={{ maxWidth: 560 }}>
      <div className="admin-card-header" style={{ justifyContent: 'space-between' }}>
        <span><Icono n="acuerdo" /> Campos extra — Comisionistas</span>
        <Button size="sm" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', fontSize: 12 }} onClick={addRow}>+ Agregar</Button>
      </div>
      <div className="admin-card-body">
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>Los campos que definas aparecerán en el formulario y el detalle de todos los comisionistas.</p>
        {!campos.length && <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '10px 0' }}>Sin campos extra definidos.</div>}
        {campos.map((campo, i) => (
          <div className="campo-custom-row" key={campo.id}>
            <Input type="text" className="cc-label" placeholder="Nombre del campo" value={campo.label} onChange={e => updateRow(i, { label: e.target.value })} />
            <Select className="cc-tipo" value={campo.tipo} onChange={e => updateRow(i, { tipo: e.target.value as CampoCustom['tipo'] })}>
              {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
            <button className="btn-remove-contact" onClick={() => removeRow(i)} title="Eliminar campo"><Icono n="cerrar" /></button>
          </div>
        ))}
        <Button variant="primary" size="sm" style={{ width: '100%', justifyContent: 'center', marginTop: 10 }} onClick={() => void handleSave()} disabled={saving}>Guardar campos</Button>
      </div>
    </div>
  );
}
