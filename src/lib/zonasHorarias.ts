// Zonas horarias que se ofrecen en la configuración de la empresa. La base usa la elegida para saber qué día es "hoy"
// (tareas, corrección de retiros del mismo día). Cualquier nombre válido de zona se acepta en la base.
export const ZONA_HORARIA_POR_DEFECTO = 'America/Argentina/Buenos_Aires';

export const ZONAS_HORARIAS: { id: string; etiqueta: string }[] = [
  { id: 'America/Argentina/Buenos_Aires', etiqueta: 'Argentina (Buenos Aires)' },
  { id: 'America/Santiago', etiqueta: 'Chile (Santiago)' },
  { id: 'America/Montevideo', etiqueta: 'Uruguay (Montevideo)' },
  { id: 'America/Asuncion', etiqueta: 'Paraguay (Asunción)' },
  { id: 'America/La_Paz', etiqueta: 'Bolivia (La Paz)' },
  { id: 'America/Lima', etiqueta: 'Perú (Lima)' },
  { id: 'America/Bogota', etiqueta: 'Colombia (Bogotá)' },
  { id: 'America/Mexico_City', etiqueta: 'México (Ciudad de México)' },
  { id: 'America/Sao_Paulo', etiqueta: 'Brasil (São Paulo)' },
  { id: 'Europe/Madrid', etiqueta: 'España (Madrid)' },
  { id: 'UTC', etiqueta: 'Hora universal (UTC)' },
];
