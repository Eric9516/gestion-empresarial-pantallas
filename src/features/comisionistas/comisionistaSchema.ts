import { z } from 'zod';

export const comisionistaSchema = z.object({
  nombre: z.string().min(1, 'El nombre es obligatorio'),
  zona: z.string(),
  empresa: z.string(),
  telefono: z.string(),
  celular: z.string(),
  email: z.string(),
  localidad: z.string(),
  provincia: z.string(),
  notas: z.string(),
  activo: z.boolean(),
  campos_extra: z.record(z.string(), z.string()),
});

export type ComisionistaFormValues = z.infer<typeof comisionistaSchema>;

export const emptyComisionista: ComisionistaFormValues = {
  nombre: '', zona: '', empresa: '', telefono: '', celular: '', email: '',
  localidad: '', provincia: '', notas: '', activo: true, campos_extra: {},
};
