import type { CSSProperties } from 'react';
import {
  ArrowLeft, Bug, Building2, Calendar, CalendarDays, Camera, ChartColumn, Check, ChevronDown, ChevronRight, ChevronUp, CircleCheck, CircleX, Clock, Crown, Download,
  Eye, Factory, FileSpreadsheet, FileText, Folder, FolderOpen, Handshake, Hourglass, House, Image, KeyRound, Lightbulb, Lock, LockOpen, LogOut, Mail, MapPin, MessageSquare,
  Minus, NotebookPen, Package, PackageMinus, Palette, Pencil, Phone, Plus, Printer, Puzzle, RectangleHorizontal, RefreshCw, Rocket, Ruler, Save, Scale, ScrollText, Search,
  Settings, ShoppingCart, Smartphone, Sparkles, Square, SquareDashed, Star, Table, Tag, Target, Trash2, TrafficCone, TriangleAlert, Undo2, Upload, User, Users, Wrench, X,
  ClipboardList, EllipsisVertical, LayoutGrid, List,
} from 'lucide-react';

// Los íconos de toda la app salen de acá, con un nombre que dice qué significan. Así todos tienen el mismo tamaño, trazo y color
// (heredan el color y el tamaño del texto que los rodea) y, si algún día se quiere otro estilo, se cambia en un solo lugar.
// No se usan emojis como íconos: se ven distinto en cada celular y computadora (hay una prueba que lo vigila).
const ICONOS = {
  aprobar: Check, ok: Check, exito: CircleCheck, fallo: CircleX, cerrar: X, alerta: TriangleAlert,
  editar: Pencil, borrar: Trash2, guardar: Save, mas: Plus, menos: Minus, ver: Eye, buscar: Search, volver: ArrowLeft, repetir: RefreshCw, devolver: Undo2,
  importar: Upload, exportar: Download, imprimir: Printer, retirar: PackageMinus,
  arriba: ChevronUp, abajo: ChevronDown, desplegar: ChevronRight,
  candado: Lock, candadoAbierto: LockOpen, clave: KeyRound, corona: Crown,
  usuario: User, usuarios: Users, empresa: Building2, fabrica: Factory, acuerdo: Handshake, paquete: Package, herramienta: Wrench, etiqueta: Tag,
  lista: ClipboardList, informe: ChartColumn, documento: FileText, planilla: FileSpreadsheet, tabla: Table, historial: ScrollText, nota: NotebookPen,
  fecha: Calendar, calendario: CalendarDays, reloj: Clock, espera: Hourglass,
  telefono: Phone, celular: Smartphone, correo: Mail, lugar: MapPin, mensaje: MessageSquare, idea: Lightbulb,
  config: Settings, modulos: Puzzle, error: Bug, semaforo: TrafficCone, inicio: House, salir: LogOut, cohete: Rocket, nuevo: Sparkles, objetivo: Target,
  camara: Camera, imagen: Image, carpeta: Folder, carpetaAbierta: FolderOpen, paleta: Palette, regla: Ruler, marco: SquareDashed, vacio: Square, ancho: RectangleHorizontal,
  balanza: Scale, estrella: Star, carrito: ShoppingCart, vistaLista: List, vistaGrilla: LayoutGrid, masAcciones: EllipsisVertical,
} as const;

export type NombreIcono = keyof typeof ICONOS;

interface Props {
  n: NombreIcono;
  /** Tamaño; por defecto el del texto que lo rodea. */
  tam?: number | string;
  /** Grosor del trazo (por defecto 2; usar 2.25 o más si se ve muy fino). */
  trazo?: number;
  className?: string;
  style?: CSSProperties;
}

export function Icono({ n, tam = '1.1em', trazo = 2, className, style }: Props) {
  const Componente = ICONOS[n];
  return <Componente size={tam} strokeWidth={trazo} className={className} aria-hidden="true" focusable="false" style={{ verticalAlign: '-0.18em', flexShrink: 0, ...style }} />;
}

/** Un punto de color (por ejemplo, el semáforo de las tareas o un estado). Hereda el color del texto si no se indica otro; `hueco` lo dibuja como un aro. */
export function Punto({ color = 'currentColor', tam = '0.7em', hueco = false }: { color?: string; tam?: number | string; hueco?: boolean }) {
  return <span aria-hidden="true" style={{ display: 'inline-block', boxSizing: 'border-box', width: tam, height: tam, borderRadius: '50%', background: hueco ? 'transparent' : color, border: hueco ? `1.5px solid ${color}` : undefined, verticalAlign: '0.02em', flexShrink: 0 }} />;
}

