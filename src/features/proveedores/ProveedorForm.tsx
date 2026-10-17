import { useEffect } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { useSaveProveedor, type Proveedor } from './useProveedores';
import { emptyProveedor, proveedorSchema, type ProveedorFormValues } from './proveedorSchema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { mensajeDeError } from '@/lib/errores';
import { ConflictoDeEdicion } from '../../lib/conflicto';
import { Icono } from '@/components/Icono';

interface Props {
  open: boolean;
  onClose: () => void;
  proveedor: Proveedor | null; // null = alta nueva
}

export default function ProveedorForm({ open, onClose, proveedor }: Props) {
  const toast = useToast();
  const saveProveedor = useSaveProveedor();

  const { register, control, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<ProveedorFormValues>({
    resolver: zodResolver(proveedorSchema),
    defaultValues: emptyProveedor,
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'contactos' });

  useEffect(() => {
    if (!open) return;
    if (proveedor) {
      reset({
        nombre: proveedor.nombre,
        rubro: proveedor.rubro ?? '',
        email: proveedor.email ?? '',
        direccion: proveedor.direccion ?? '',
        localidad: proveedor.localidad ?? '',
        provincia: proveedor.provincia ?? '',
        codigo_postal: proveedor.codigo_postal ?? '',
        horario: proveedor.horario ?? '',
        notas: proveedor.notas ?? '',
        activo: proveedor.activo !== false,
        contactos: proveedor.contactos.map(c => ({
          id: c.id, nombre: c.nombre, cargo: c.cargo ?? '', telefono: c.telefono ?? '', celular: c.celular ?? '', email: c.email ?? '',
        })),
      });
    } else {
      reset(emptyProveedor);
    }
  }, [open, proveedor, reset]);

  async function onSubmit(values: ProveedorFormValues) {
    try {
      const { contactos, ...data } = values;
      await saveProveedor.mutateAsync({ id: proveedor?.id ?? null, data, contactos, version: proveedor ? proveedor.updated_at : undefined });
      toast(proveedor ? 'Proveedor actualizado' : 'Proveedor agregado', 'success');
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
      title={proveedor ? 'Editar Proveedor' : 'Nuevo Proveedor'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="success" onClick={handleSubmit(onSubmit)} disabled={isSubmitting}>Guardar</Button>
        </>
      }
    >
      <form onSubmit={e => e.preventDefault()} className="form-grid">
        <div className="form-group">
          <label htmlFor="proveedor-form-1">Nombre *</label>
          <Input id="proveedor-form-1" {...register('nombre')} />
          {errors.nombre && <span style={{ color: 'var(--danger)', fontSize: 12 }}>{errors.nombre.message}</span>}
        </div>
        <div className="form-group"><label htmlFor="proveedor-form-2">Rubro</label><Input id="proveedor-form-2" {...register('rubro')} /></div>
        <div className="form-group"><label htmlFor="proveedor-form-3">Email</label><Input id="proveedor-form-3" type="email" {...register('email')} /></div>
        <div className="form-group full"><label htmlFor="proveedor-form-4">Horario de atención</label><Input id="proveedor-form-4" {...register('horario')} placeholder="Ej: Lun-Vie 8 a 17hs" /></div>
        <div className="form-group"><label htmlFor="proveedor-form-5">Dirección</label><Input id="proveedor-form-5" {...register('direccion')} /></div>
        <div className="form-group"><label htmlFor="proveedor-form-6">Localidad</label><Input id="proveedor-form-6" {...register('localidad')} /></div>
        <div className="form-group"><label htmlFor="proveedor-form-7">Provincia</label><Input id="proveedor-form-7" {...register('provincia')} /></div>
        <div className="form-group"><label htmlFor="proveedor-form-8">Código postal</label><Input id="proveedor-form-8" {...register('codigo_postal')} /></div>
        <div className="form-group">
          <label htmlFor="proveedor-form-9">Estado</label>
          <Controller
            name="activo"
            control={control}
            render={({ field }) => (
              <Select id="proveedor-form-9" value={field.value ? 'true' : 'false'} onChange={e => field.onChange(e.target.value === 'true')}>
                <option value="true">Activo</option>
                <option value="false">Inactivo</option>
              </Select>
            )}
          />
        </div>
        <div className="form-group full"><label htmlFor="proveedor-form-10">Notas</label><Textarea id="proveedor-form-10" rows={2} {...register('notas')} /></div>

        <div className="contacts-section full">
          <div className="contacts-header">
            <div className="contacts-title"><Icono n="usuario" /> Contactos</div>
            <Button
              type="button"
              variant="ghost" size="sm"
              onClick={() => append({ nombre: '', cargo: '', telefono: '', celular: '', email: '' })}
            >
              + Agregar contacto
            </Button>
          </div>
          {fields.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>Sin contactos aún. Hacé clic en "Agregar contacto".</p>}
          {fields.map((f, i) => (
            <div className="contact-row" key={f.id}>
              <button type="button" className="btn-remove-contact" aria-label="Quitar contacto" title="Quitar contacto" onClick={() => remove(i)}><Icono n="cerrar" /></button>
              <div className="contact-row-grid">
                <div className="form-group">
                  <label htmlFor={`contacto-${f.id}-nombre`}>Nombre y apellido *</label>
                  <Input id={`contacto-${f.id}-nombre`} {...register(`contactos.${i}.nombre`)} placeholder="Juan Pérez" />
                </div>
                <div className="form-group"><label htmlFor={`contacto-${f.id}-cargo`}>Cargo / Rol</label><Input id={`contacto-${f.id}-cargo`} {...register(`contactos.${i}.cargo`)} placeholder="Ventas" /></div>
                <div className="form-group"><label htmlFor={`contacto-${f.id}-telefono`}>Teléfono</label><Input id={`contacto-${f.id}-telefono`} {...register(`contactos.${i}.telefono`)} placeholder="(0000) 000-0000" /></div>
                <div className="form-group"><label htmlFor={`contacto-${f.id}-celular`}>Celular / WhatsApp</label><Input id={`contacto-${f.id}-celular`} {...register(`contactos.${i}.celular`)} placeholder="11 5523-0000" /></div>
                <div className="form-group full" style={{ gridColumn: '1/-1' }}>
                  <label htmlFor={`contacto-${f.id}-email`}>Email</label>
                  <Input id={`contacto-${f.id}-email`} type="email" {...register(`contactos.${i}.email`)} placeholder="contacto@proveedor.com" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </form>
    </Modal>
  );
}
