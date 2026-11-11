import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ahora } from './flujo';
import { useDatosDemo } from './almacenDemo';
import type { PersonaMantenimiento } from './tipos';

// Quién está usando el módulo y con qué perfil (responsable, jefe de taller o técnico).
// MODO DE EJEMPLO: se elige con "Ver como" (personas inventadas), para recorrer el circuito de las OT.
// PARA ERIC: sale del usuario que inició sesión y de su rol de Mantenimiento (rol nuevo, ver NOTAS-PARA-ERIC.md).

const CLAVE = 'mantenimiento-demo-usuario';
const oyentes = new Set<() => void>();

function leer(): string | null {
  try { return localStorage.getItem(CLAVE); } catch { return null; }
}

export function cambiarUsuarioDemo(id: string) {
  try { localStorage.setItem(CLAVE, id); } catch { /* sin almacenamiento: dura mientras la página esté abierta */ }
  actual = id;
  oyentes.forEach(o => o());
}

let actual: string | null = leer();

function suscribir(o: () => void) {
  oyentes.add(o);
  return () => { oyentes.delete(o); };
}

export interface UsuarioMantenimiento {
  persona: PersonaMantenimiento;
  personas: PersonaMantenimiento[];
  esResponsable: boolean;
  esJefe: boolean;
  esTecnico: boolean;
  /** Los técnicos (para asignar OT). */
  tecnicos: PersonaMantenimiento[];
}

const SIN_PERSONAS: PersonaMantenimiento = { id: 'responsable', nombre: 'Responsable', rol: 'responsable' };

export function useUsuarioMantenimiento(): UsuarioMantenimiento {
  const { personas } = useDatosDemo();
  const id = useSyncExternalStore(suscribir, () => actual, () => actual);
  return useMemo(() => {
    const persona = personas.find(p => p.id === id) ?? personas.find(p => p.rol === 'responsable') ?? personas[0] ?? SIN_PERSONAS;
    return {
      persona, personas,
      esResponsable: persona.rol === 'responsable',
      esJefe: persona.rol === 'jefe',
      esTecnico: persona.rol === 'tecnico',
      tecnicos: personas.filter(p => p.rol === 'tecnico'),
    };
  }, [personas, id]);
}

/** "aaaa-mm-ddThh:mm" de ahora, que se actualiza solo cada medio minuto (para saber qué OT ya llegaron). */
export function useAhora(): string {
  const [momento, setMomento] = useState(ahora);
  useEffect(() => {
    const t = setInterval(() => setMomento(ahora()), 30_000);
    return () => clearInterval(t);
  }, []);
  return momento;
}
