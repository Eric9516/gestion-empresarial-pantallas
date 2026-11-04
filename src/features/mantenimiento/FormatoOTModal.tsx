import { useId, useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { useConfigMantenimiento, useGuardarConfigMantenimiento } from './usePreventivo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Icono } from '@/components/Icono';

// Formato de la OT (lo elige cada empresa): datos del registro de calidad que salen en el encabezado
// de la OT impresa y los controles de la liberación del equipo al terminar.
export default function FormatoOTModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={<><Icono n="config" /> Formato de la OT</>}>
      {open && <Formulario onClose={onClose} />}
    </Modal>
  );
}

function Formulario({ onClose }: { onClose: () => void }) {
  const uid = useId();
  const toast = useToast();
  const config = useConfigMantenimiento();
  const guardar = useGuardarConfigMantenimiento();
  const [codigo, setCodigo] = useState(config.registroCodigo);
  const [version, setVersion] = useState(config.registroVersion);
  const [vigencia, setVigencia] = useState(config.registroVigencia);
  const [controles, setControles] = useState(config.controlesLiberacion.join('\n'));
  const [recibe, setRecibe] = useState(config.recibeLiberacion);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    await guardar.mutateAsync({
      registroCodigo: codigo.trim(), registroVersion: version.trim(), registroVigencia: vigencia,
      controlesLiberacion: controles.split(/\r?\n/).map(c => c.trim()).filter(Boolean), recibeLiberacion: recibe.trim(),
    });
    toast('Formato guardado: se usa en las próximas OT que imprimas o termines', 'success');
    onClose();
  }

  return (
    <form onSubmit={enviar}>
      <p style={{ fontSize: 13, color: 'var(--text-mid)', margin: '0 0 12px' }}>Registro de calidad: sale arriba a la derecha de cada OT impresa. Dejalo vacío si no lo usás.</p>
      <div className="form-grid">
        <div className="form-group">
          <label htmlFor={`${uid}-c`}>Código del registro</label>
          <Input id={`${uid}-c`} value={codigo} onChange={e => setCodigo(e.target.value)} placeholder="Ej.: REG-MANT-01" />
        </div>
        <div className="form-group">
          <label htmlFor={`${uid}-v`}>Versión</label>
          <Input id={`${uid}-v`} value={version} onChange={e => setVersion(e.target.value)} placeholder="Ej.: 01" />
        </div>
        <div className="form-group">
          <label htmlFor={`${uid}-f`}>Fecha de vigencia</label>
          <Input id={`${uid}-f`} type="date" value={vigencia} onChange={e => setVigencia(e.target.value)} />
        </div>
        <div className="form-group full">
          <label htmlFor={`${uid}-l`}>Liberación del equipo: controles de entrega (uno por renglón)</label>
          <Textarea id={`${uid}-l`} rows={6} value={controles} onChange={e => setControles(e.target.value)} placeholder={'Sin objetos extraños\nLimpieza\nSanitización'} />
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Se tildan al terminar cada OT y salen en la OT impresa. Vacío = las OT no tienen liberación.</div>
        </div>
        <div className="form-group full">
          <label htmlFor={`${uid}-r`}>Quién recibe el equipo</label>
          <Input id={`${uid}-r`} value={recibe} onChange={e => setRecibe(e.target.value)} placeholder="Ej.: Responsable de Producción" />
        </div>
      </div>
      <div className="modal-footer">
        <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button type="submit" variant="primary"><Icono n="guardar" /> Guardar</Button>
      </div>
    </form>
  );
}
