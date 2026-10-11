import { useEffect, useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { fechaHoyISO } from '../../lib/fechaHoy';
import { useCrearTarea, useEditarTarea, type Tarea } from './useTareas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { mensajeDeError } from '@/lib/errores';
import { Icono } from '@/components/Icono';

interface Props {
  open: boolean;
  onClose: () => void;
  tarea?: Tarea | null;
}

export default function TareaForm({ open, onClose, tarea }: Props) {
  const toast = useToast();
  const crearTarea = useCrearTarea();
  const editarTarea = useEditarTarea();

  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [semaforo, setSemaforo] = useState('green');
  const [fecha, setFecha] = useState(fechaHoyISO());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (tarea) {
      setTitulo(tarea.title); setDescripcion(tarea.description ?? ''); setSemaforo(tarea.traffic_level);
    } else {
      setTitulo(''); setDescripcion(''); setSemaforo('green'); setFecha(fechaHoyISO());
    }
  }, [open, tarea]);

  async function handleGuardar() {
    if (!titulo.trim()) { toast('El título es obligatorio', 'error'); return; }
    setSaving(true);
    try {
      if (tarea) {
        await editarTarea.mutateAsync({ taskId: tarea.id, title: titulo.trim(), description: descripcion.trim(), traffic_level: semaforo });
        toast('Tarea actualizada', 'success');
      } else {
        await crearTarea.mutateAsync({ title: titulo.trim(), description: descripcion.trim(), traffic_level: semaforo, assigned_date: fecha || null });
        toast('Tarea creada', 'success');
      }
      onClose();
    } catch (e) {
      toast('Error al guardar: ' + mensajeDeError(e), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={<><span className="accent"><Icono n="semaforo" /></span> {tarea ? 'Editar Tarea' : 'Nueva Tarea'}</>}>
      <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
        <div className="form-group"><label htmlFor="tarea-form-1">Título *</label><Input id="tarea-form-1" type="text" placeholder="¿Qué tenés que hacer?" value={titulo} onChange={e => setTitulo(e.target.value)} /></div>
        <div className="form-group"><label htmlFor="tarea-form-2">Descripción</label><Textarea id="tarea-form-2" placeholder="Detalles opcionales..." rows={3} value={descripcion} onChange={e => setDescripcion(e.target.value)} /></div>
        <div className="form-group">
          <label htmlFor="tarea-form-3">Prioridad{tarea ? '' : ' inicial'}</label>
          <Select id="tarea-form-3" value={semaforo} onChange={e => setSemaforo(e.target.value)}>
            <option value="green">Normal</option>
            <option value="yellow">Atención</option>
            <option value="red">Crítica</option>
          </Select>
        </div>
        {!tarea && (
          <div className="form-group"><label htmlFor="tarea-form-4">Fecha asignada</label><Input id="tarea-form-4" type="date" value={fecha} min={fechaHoyISO()} onChange={e => setFecha(e.target.value)} /></div>
        )}
      </div>
      <div className="modal-footer">
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button variant="success" onClick={() => void handleGuardar()} disabled={saving}>Guardar</Button>
      </div>
    </Modal>
  );
}
