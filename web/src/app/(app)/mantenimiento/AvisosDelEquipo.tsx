'use client';
import { useCallback, useEffect, useState } from 'react';
import { AVISOS, TIPOS_DE_AVISO, type TipoDeAviso } from '@/features/mantenimiento/avisosCelular';
import { Button } from '@/components/ui/button';
import { Icono } from '@/components/Icono';
import { useToast } from '@/components/ToastProvider';
import { type PersonaConAvisos, avisosDelEquipo, cambiarAviso, probarAviso } from './accionesAvisos';

// Configuración → Mantenimiento → Avisos (pedido del dueño, 12/11/2026): los avisos al celular vienen prendidos para todos; acá el dueño y el
// responsable los apagan o prenden por persona. Se ve también quién ya los activó en su celular (si no, no le llega nada: el teléfono pide
// que la persona toque "Permitir" una vez, en el cartel que le aparece al entrar).

const ROL: Record<PersonaConAvisos['rol'], string> = { responsable: 'Responsable', jefe: 'Jefe de taller', tecnico: 'Técnico' };

export default function AvisosDelEquipo() {
  const toast = useToast();
  const [personas, setPersonas] = useState<PersonaConAvisos[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const leer = useCallback(async () => {
    const r = await avisosDelEquipo();
    setError(r.error);
    setPersonas(r.personas);
  }, []);
  useEffect(() => { void leer(); }, [leer]);

  async function cambiar(p: PersonaConAvisos, tipo: TipoDeAviso, activo: boolean) {
    // se ve al instante; si falla, vuelve como estaba
    setPersonas(l => l?.map(x => (x.id === p.id ? { ...x, apagados: activo ? x.apagados.filter(t => t !== tipo) : [...x.apagados, tipo] } : x)) ?? null);
    const r = await cambiarAviso(p.id, tipo, activo);
    if (r.error) { toast(r.error, 'error'); void leer(); }
  }

  async function probar(p: PersonaConAvisos) {
    const r = await probarAviso(p.id);
    if (r.error) toast(r.error, 'error');
    else toast(`Aviso de prueba mandado a ${p.nombre}. Le tiene que llegar en un momento.`, 'success');
  }

  if (error) return <div className="mt-vacio">{error}</div>;
  if (!personas) return <div className="mt-vacio">Cargando...</div>;

  return (
    <div className="avisos-equipo">
      <p style={{ fontSize: 13, color: 'var(--text-mid)', margin: 0 }}>
        Cuando una OT avanza, le llega un aviso al celular a quien tiene que hacer el paso siguiente, aunque tenga la app cerrada. Vienen prendidos
        para todos; acá podés apagarle a cada persona los que no necesite. Para recibirlos, cada uno tiene que tocar «Activar» en el cartel que le
        aparece al entrar a la app desde su celular (en el iPhone, primero hay que agregar la app a la pantalla de inicio).
      </p>
      {!personas.length && <div className="mt-vacio">No hay nadie con un rol en Mantenimiento.</div>}
      {personas.map(p => (
        <div key={p.id} className="avisos-persona" data-persona={p.nombre}>
          <div className="avisos-persona-cabeza">
            <strong>{p.nombre}</strong>
            <span className="avisos-rol">{ROL[p.rol]}</span>
            <span className={`avisos-celular ${p.celulares ? 'si' : 'no'}`}>
              <Icono n="celular" /> {p.celulares ? (p.celulares === 1 ? 'Activado en 1 celular' : `Activado en ${p.celulares} celulares`) : 'Todavía no los activó'}
            </span>
            {p.celulares > 0 && (
              <Button type="button" variant="ghost" size="sm" style={{ marginLeft: 'auto' }} onClick={() => void probar(p)}>
                <Icono n="aviso" /> Probar
              </Button>
            )}
          </div>
          <div className="avisos-tipos">
            {TIPOS_DE_AVISO.filter(t => AVISOS[t].para.includes(p.rol)).map(t => (
              <label key={t}>
                <input type="checkbox" checked={!p.apagados.includes(t)} aria-label={`${AVISOS[t].nombre} — ${p.nombre}`}
                  onChange={e => void cambiar(p, t, e.target.checked)} />
                {AVISOS[t].nombre}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
