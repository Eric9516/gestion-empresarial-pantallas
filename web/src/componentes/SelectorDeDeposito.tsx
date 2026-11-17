'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { useToast } from '@/components/ToastProvider';
import { Icono } from '@/components/Icono';
import { iconoDeDeposito } from '@/features/depositos/iconos';
import { elegirDeposito, marcarDepositoPreferido } from '~/app/(app)/deposito/elegirDeposito';

export interface DepositoDelSelector { id: string; nombre: string; icono: string | null }

interface Props {
  depositos: DepositoDelSelector[];
  actual: string | null;
  /** El marcado con la estrellita: se abre al entrar. */
  preferido: string | null;
  /** A dónde ir al cambiar de depósito (null = quedarse en la pantalla, que se vuelve a leer). */
  irA?: string | null;
  /** En una página clara (Configuración) en vez de en la cabecera de color. */
  claro?: boolean;
}

// El depósito en el que se está, arriba de la pantalla (pedido del encargado): se toca y se elige otro de los suyos; la estrellita marca el
// que se abre al entrar. Con un solo depósito es solo el nombre. Va arriba (no en el menú) para que siempre se vea dónde se está retirando.
export default function SelectorDeDeposito({ depositos, actual, preferido, irA = '/deposito', claro = false }: Props) {
  const router = useRouter();
  const toast = useToast();
  const id = useId();
  const [abierto, setAbierto] = useState(false);
  const [ocupado, empezar] = useTransition();
  const caja = useRef<HTMLDivElement>(null);
  const elegido = depositos.find(d => d.id === actual) ?? depositos[0];

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', tecla); };
  }, [abierto]);

  if (!elegido) return null;
  if (depositos.length < 2) return claro ? <strong>{elegido.nombre}</strong> : <>{elegido.nombre}</>;

  function ir(destino: string) {
    setAbierto(false);
    if (destino === elegido?.id) return;
    empezar(async () => {
      const r = await elegirDeposito(destino);
      if (r.error) { toast(r.error, 'error'); return; }
      // a la búsqueda del depósito nuevo (lo que estaba abierto era del otro), o se queda y vuelve a leer
      if (irA) router.push(irA);
      router.refresh();
    });
  }

  function marcar(destino: string) {
    empezar(async () => {
      const r = await marcarDepositoPreferido(preferido === destino ? null : destino);
      if (r.error) { toast(r.error, 'error'); return; }
      toast(preferido === destino ? 'Al entrar se abre el depósito principal' : `Al entrar se abre ${depositos.find(d => d.id === destino)?.nombre}`, 'success');
      router.refresh();
    });
  }

  return (
    <div className={`dep-selector${claro ? ' claro' : ''}`} ref={caja}>
      <button type="button" className="dep-selector-boton" aria-expanded={abierto} aria-controls={id} aria-label={`Depósito: ${elegido.nombre}. Cambiar de depósito`}
        onClick={() => setAbierto(v => !v)} disabled={ocupado}>
        <Icono n={iconoDeDeposito(elegido.icono)} /> <span>{elegido.nombre}</span> <Icono n="abajo" />
      </button>
      {abierto && (
        <div className="dep-selector-lista" id={id} role="group" aria-label="Tus depósitos">
          {depositos.map(d => (
            <div key={d.id} className={`dep-selector-fila${d.id === elegido.id ? ' actual' : ''}`}>
              <button type="button" className="dep-selector-ir" onClick={() => ir(d.id)} aria-current={d.id === elegido.id ? 'true' : undefined}>
                <Icono n={iconoDeDeposito(d.icono)} /> {d.nombre}
              </button>
              <button type="button" className={`dep-selector-estrella${d.id === preferido ? ' marcada' : ''}`} onClick={() => marcar(d.id)} aria-pressed={d.id === preferido}
                title={d.id === preferido ? 'Se abre al entrar (tocá para sacarla)' : 'Abrir este al entrar'} aria-label={`Abrir ${d.nombre} al entrar`}>
                <Icono n="estrella" />
              </button>
            </div>
          ))}
          <p className="dep-selector-ayuda"><Icono n="estrella" /> = el que se abre al entrar</p>
        </div>
      )}
    </div>
  );
}
