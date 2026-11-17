// Los campos que el dueño agrega a los comisionistas (Configuración). Aparte de useCamposCustom (que habla con la base) para usarlo en cualquier
// pantalla, también en la app de Next.
export interface CampoCustom {
  id: string;
  label: string;
  tipo: 'text' | 'tel' | 'number' | 'email' | 'textarea';
}
