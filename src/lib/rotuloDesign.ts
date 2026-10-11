export interface RotuloDesign {
  headerBg: string;
  barColor: string;
  barHeight: number;
  titleColor: string;
  textColor: string;
  bodyBg: string;
  logoSize: number;
  logoPos: 'left' | 'center' | 'right';
  empresaFont: string;
  empresaSize: number;
  empresaPos: 'left' | 'center' | 'right' | 'hidden';
  empresaColor: string;
  provFont: string;
  provSize: number;
  provAlign: 'left' | 'center' | 'right';
  marcoColor: string;
  marcoWidth: number;
}

export interface RotuloCampos {
  horario: boolean;
  direccion: boolean;
  telefono: boolean;
  email: boolean;
}

export const DEFAULT_DESIGN: RotuloDesign = {
  headerBg: '#1a3a6b', barColor: '#c8222a', barHeight: 4,
  titleColor: '#1a3a6b', textColor: '#333333', bodyBg: '#ffffff',
  logoSize: 40, logoPos: 'left',
  empresaFont: 'Arial,sans-serif', empresaSize: 14, empresaPos: 'left', empresaColor: '#ffffff',
  provFont: 'Arial,sans-serif', provSize: 18, provAlign: 'left',
  marcoColor: '#1a3a6b', marcoWidth: 1,
};

export const DEFAULT_CAMPOS: RotuloCampos = { horario: true, direccion: true, telefono: true, email: true };

export function getCurrentDesign(rotuloDesign: unknown): RotuloDesign {
  return { ...DEFAULT_DESIGN, ...(rotuloDesign as Partial<RotuloDesign> | null) };
}

export function getCurrentCampos(rotuloCampos: unknown): RotuloCampos {
  return { ...DEFAULT_CAMPOS, ...(rotuloCampos as Partial<RotuloCampos> | null) };
}
