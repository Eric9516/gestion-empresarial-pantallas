export interface SizePreset {
  name: string;
  label: string;
  w: number;
  h: number;
}

// Los mismos 5 tamaños de la app vieja, en un solo lugar — el editor de diseño
// (Admin) y el modal "Generar rótulo" usan exactamente esta lista.
export const SIZE_PRESETS: SizePreset[] = [
  { name: 'a4', label: 'A4', w: 21, h: 29.7 },
  { name: 'carta', label: 'Carta', w: 21.6, h: 27.9 },
  { name: 'media', label: 'Media A4', w: 21, h: 14.8 },
  { name: '15x10', label: '15×10', w: 15, h: 10 },
  { name: 'etiqueta', label: '10×7', w: 10, h: 7 },
];
