// Los tipos de proveedores que usan las pantallas. Los datos los trae el servidor (app de Next).
import type { Database } from '../../lib/database.types';

export type Contacto = Database['public']['Tables']['contactos']['Row'];

export type Proveedor = Database['public']['Tables']['proveedores']['Row'] & { contactos: Contacto[] };

/** Lo que guarda el formulario: el proveedor, sus contactos y la versión sobre la que se editó (null = nunca se modificó; sin versión, al crear). */
export type GuardarProveedor = (g: { id: string | null; data: ProveedorInput; contactos: ContactoInput[]; version?: string | null }) => Promise<unknown>;

export type ContactoInput = { id?: string; nombre: string; cargo: string; telefono: string; celular: string; email: string };

export type ProveedorInput = {
  nombre: string;
  rubro: string;
  email: string;
  direccion: string;
  localidad: string;
  provincia: string;
  codigo_postal: string;
  horario: string;
  notas: string;
  activo: boolean;
};
