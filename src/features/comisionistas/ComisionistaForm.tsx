import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { useCamposCustomQuery } from '../config/useCamposCustom';
import { useSaveComisionista, type Comisionista } from './useComisionistas';
import { comisionistaSchema, emptyComisionista, type ComisionistaFormValues } from './comisionistaSchema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { mensajeDeError } from '@/lib/errores';
import { ConflictoDeEdicion } from '../../lib/conflicto';

interface Props {
  open: boolean;
  onClose: () => void;
  comisionista: Comisionista | null;
}

export default function ComisionistaForm({ open, onClose, comisionista }: Props) {
  const toast = useToast();
  const saveComisionista = useSaveComisionista();
  const { data: camposCustom } = useCamposCustomQuery();

  const { register, control, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<ComisionistaFormValues>({
    resolver: zodResolver(comisionistaSchema),
    defaultValues: emptyComisionista,
  });

  useEffect(() => {
    if (!open) return;
    if (comisionista) {
      const camposExtra = (comisionista.campos_extra as Record<string, string> | null) ?? {};
      reset({
        nombre: comisionista.nombre,
        zona: comisionista.zona ?? '',
        empresa: comisionista.empresa ?? '',
        telefono: comisionista.telefono ?? '',
        celular: comisionista.celular ?? '',
        email: comisionista.email ?? '',
        localidad: comisionista.localidad ?? '',
        provincia: comisionista.provincia ?? '',
        notas: comisionista.notas ?? '',
        activo: comisionista.activo !== false,
        campos_extra: camposExtra,
      });
    } else {
      reset(emptyComisionista);
    }
  }, [open, comisionista, reset]);

  async function onSubmit(values: ComisionistaFormValues) {
    try {
      await saveComisionista.mutateAsync({ id: comisionista?.id ?? null, data: values, version: comisionista ? comisionista.updated_at : undefined });
      toast(comisionista ? 'Comisionista actualizado' : 'Comisionista agregado', 'success');
      onClose();
    } catch (e) {
      // Si alguien lo cambió mientras se editaba, se cierra para volver a abrirlo con lo nuevo (la lista ya se está actualizando).
      if (e instanceof ConflictoDeEdicion) { toast(mensajeDeError(e), 'error'); onClose(); return; }
      toast('Error al guardar: ' + mensajeDeError(e), 'error');
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      large
      title={comisionista ? 'Editar Comisionista' : 'Nuevo Comisionista'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="success" onClick={handleSubmit(onSubmit)} disabled={isSubmitting}>Guardar</Button>
        </>
      }
    >
      <form onSubmit={e => e.preventDefault()} className="form-grid" id="comFormGrid">
        <div className="form-group">
          <label htmlFor="comisionista-form-1">Nombre *</label>
          <Input id="comisionista-form-1" {...register('nombre')} />
          {errors.nombre && <span style={{ color: 'var(--danger)', fontSize: 12 }}>{errors.nombre.message}</span>}
        </div>
        <div className="form-group"><label htmlFor="comisionista-form-2">Zona / Región</label><Input id="comisionista-form-2" {...register('zona')} /></div>
        <div className="form-group"><label htmlFor="comisionista-form-3">Empresa</label><Input id="comisionista-form-3" {...register('empresa')} /></div>
        <div className="form-group"><label htmlFor="comisionista-form-4">Teléfono</label><Input id="comisionista-form-4" {...register('telefono')} /></div>
        <div className="form-group"><label htmlFor="comisionista-form-5">Celular / WhatsApp</label><Input id="comisionista-form-5" {...register('celular')} /></div>
        <div className="form-group"><label htmlFor="comisionista-form-6">Email</label><Input id="comisionista-form-6" type="email" {...register('email')} /></div>
        <div className="form-group"><label htmlFor="comisionista-form-7">Localidad</label><Input id="comisionista-form-7" {...register('localidad')} /></div>
        <div className="form-group"><label htmlFor="comisionista-form-8">Provincia</label><Input id="comisionista-form-8" {...register('provincia')} /></div>
        <div className="form-group">
          <label htmlFor="comisionista-form-9">Estado</label>
          <Controller
            name="activo"
            control={control}
            render={({ field }) => (
              <Select id="comisionista-form-9" value={field.value ? 'true' : 'false'} onChange={e => field.onChange(e.target.value === 'true')}>
                <option value="true">Activo</option>
                <option value="false">Inactivo</option>
              </Select>
            )}
          />
        </div>
        <div className="form-group full"><label htmlFor="comisionista-form-10">Notas</label><Textarea id="comisionista-form-10" rows={2} {...register('notas')} /></div>

        {(camposCustom ?? []).map(campo => (
          <div className="form-group full" key={campo.id}>
            <label htmlFor={`campo-extra-${campo.id}`}>{campo.label}</label>
            {campo.tipo === 'textarea'
              ? <Textarea id={`campo-extra-${campo.id}`} placeholder={campo.label} {...register(`campos_extra.${campo.id}`)} />
              : <Input id={`campo-extra-${campo.id}`} type={campo.tipo} placeholder={campo.label} {...register(`campos_extra.${campo.id}`)} />}
          </div>
        ))}
      </form>
    </Modal>
  );
}
