// Fecha de hoy como yyyy-mm-dd en hora local (toISOString usa UTC, y de noche
// en Argentina ya daría el día siguiente).
export function fechaHoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// El día (yyyy-mm-dd, hora local) de un momento guardado con hora, como el de un retiro. Cortar el texto
// con slice(0, 10) daría el día en hora universal: un retiro de las 22:00 en Argentina caería en "mañana".
export function fechaLocalDe(momento: string): string {
  const d = new Date(momento);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Principio y fin de un día local (yyyy-mm-dd) como momentos exactos, para filtrar columnas con hora
// sin que el servidor los tome como hora universal.
export function inicioDelDiaISO(fecha: string): string {
  return new Date(`${fecha}T00:00:00`).toISOString();
}
export function finDelDiaISO(fecha: string): string {
  return new Date(`${fecha}T23:59:59.999`).toISOString();
}

// Muestra una fecha guardada como yyyy-mm-dd (columna "date", sin hora) tal cual
// se cargó. new Date('2026-10-06') la toma como medianoche UTC y en Argentina
// mostraría el día anterior; con la hora local explícita no se corre.
export function formatearFechaSola(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('es-AR');
}
