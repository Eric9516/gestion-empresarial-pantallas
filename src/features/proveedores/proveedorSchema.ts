import { z } from 'zod';

export const contactoSchema = z.object({
  id: z.string().optional(),
  nombre: z.string().min(1, 'El nombre es obligatorio'),
  cargo: z.string(),
  telefono: z.string(),
  celular: z.string(),
  email: z.string(),
});

export const proveedorSchema = z.object({
  nombre: z.string().min(1, 'El nombre es obligatorio'),
  rubro: z.string(),
  email: z.string(),
  direccion: z.string(),
  localidad: z.string(),
  provincia: z.string(),
  codigo_postal: z.string(),
  horario: z.string(),
  notas: z.string(),
  activo: z.boolean(),
  contactos: z.array(contactoSchema),
});

export type ProveedorFormValues = z.infer<typeof proveedorSchema>;

export const emptyProveedor: ProveedorFormValues = {
  nombre: '', rubro: '', email: '', direccion: '', localidad: '', provincia: '',
  codigo_postal: '', horario: '', notas: '', activo: true, contactos: [],
};
