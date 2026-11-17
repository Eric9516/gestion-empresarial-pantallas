// Los tipos de comisionistas que usan las pantallas. Los datos los trae el servidor (app de Next).
import type { Database } from '../../lib/database.types';

export type Comisionista = Database['public']['Tables']['comisionistas']['Row'];

/** Lo que guarda el formulario: el comisionista y la versión sobre la que se editó (null = nunca se modificó; sin versión, al crear). */
export type GuardarComisionista = (g: { id: string | null; data: ComisionistaInput; version?: string | null }) => Promise<unknown>;

export type ComisionistaInput = {
  nombre: string;
  zona: string;
  empresa: string;
  telefono: string;
  celular: string;
  email: string;
  localidad: string;
  provincia: string;
  notas: string;
  activo: boolean;
  campos_extra: Record<string, string>;
};
