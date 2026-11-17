'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Icono } from '@/components/Icono';
import { guardarCelular, probarAviso } from '~/app/(app)/mantenimiento/accionesAvisos';

// Los avisos al celular de Mantenimiento (pedido del dueño, 12/11/2026): vienen prendidos para todos, pero el teléfono no deja mandarlos
// hasta que la persona toca "Permitir" una vez. Este cartel aparece solo, UNA vez por navegador y solo en el celular (pedido del dueño,
// 12/11/2026: volvía en cada entrada y también en la computadora); queda anotado aunque no se toque nada. Para activarlos después, en el menú
// del nombre está "Avisos al celular" (abre este mismo cartel: MOSTRAR_CARTEL_DE_AVISOS).
// Con el permiso ya dado, en cada entrada se vuelve a anotar el celular en silencio (el navegador puede cambiar su dirección).
// En el iPhone, Safari solo deja recibir avisos a la app agregada a la pantalla de inicio: el cartel explica cómo.

/** Ya se le preguntó en este navegador (no vuelve a aparecer solo). */
const PREGUNTADO = 'avisos-preguntado';
/** (el de antes: "Ahora no" lo cerraba por 3 días; quien lo tenga ya fue preguntado) */
const CERRADO_ANTES = 'avisos-cartel-cerrado';
/** El evento con el que el menú del nombre vuelve a mostrar el cartel. */
export const MOSTRAR_CARTEL_DE_AVISOS = 'avisos:mostrar';

type Estado = 'nada' | 'pedir' | 'iphone' | 'activando' | 'listo' | 'error' | 'yaActivos' | 'bloqueados' | 'sinSoporte';

const anotarPreguntado = () => { try { localStorage.setItem(PREGUNTADO, '1'); } catch { /* sin almacenamiento */ } };
const yaPreguntado = () => {
  try { return localStorage.getItem(PREGUNTADO) === '1' || localStorage.getItem(CERRADO_ANTES) !== null; } catch { return false; }
};
const esCelular = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
const esIphone = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const instalada = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const soporta = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** La clave pública del servidor, como la pide el navegador. */
function aBytes(base64: string): Uint8Array<ArrayBuffer> {
  const b = atob((base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(new ArrayBuffer(b.length));
  for (let i = 0; i < b.length; i++) bytes[i] = b.charCodeAt(i);
  return bytes;
}

const mismaClave = (s: PushSubscription, clave: Uint8Array) => {
  const k = s.options.applicationServerKey;
  if (!k) return false;
  const a = new Uint8Array(k);
  return a.length === clave.length && a.every((x, i) => x === clave[i]);
};

const navegador = () => {
  const ua = navigator.userAgent;
  const so = /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'otro';
  const nav = /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
  return `${nav} en ${so}`;
};

/** Anota este celular en el servidor (pide el permiso si hace falta). Devuelve un error para mostrar, o null. */
async function anotar(clave: string, pedirPermiso: boolean): Promise<string | null> {
  if (pedirPermiso && (await Notification.requestPermission()) !== 'granted') return 'El celular no dio el permiso. Podés activarlo desde la configuración del navegador.';
  const registro = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const bytes = aBytes(clave);
  let s = await registro.pushManager.getSubscription();
  if (s && !mismaClave(s, bytes)) { await s.unsubscribe(); s = null; }
  s ??= await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
  const j = s.toJSON();
  if (!j.endpoint || !j.keys?.p256dh || !j.keys.auth) return 'Este navegador no dio una dirección para los avisos.';
  const r = await guardarCelular({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }, navegador());
  return r.error;
}

export default function ActivarAvisos({ clave }: { clave: string }) {
  const [estado, setEstado] = useState<Estado>('nada');
  const [error, setError] = useState('');

  useEffect(() => {
    if (soporta() && Notification.permission === 'granted') {
      // ya los activó: se vuelve a anotar en silencio
      void anotar(clave, false).catch(() => {});
      return;
    }
    // solo, una vez por navegador y solo en el celular
    if (!esCelular() || yaPreguntado()) return;
    if (!soporta()) {
      if (esIphone() && !instalada()) { anotarPreguntado(); setEstado('iphone'); }
      return;
    }
    if (Notification.permission === 'default') { anotarPreguntado(); setEstado('pedir'); }
  }, [clave]);

  // desde el menú del nombre ("Avisos al celular"): el cartel según cómo está este navegador
  useEffect(() => {
    const mostrar = () => {
      if (!soporta()) { setEstado(esIphone() && !instalada() ? 'iphone' : 'sinSoporte'); return; }
      setEstado(Notification.permission === 'granted' ? 'yaActivos' : Notification.permission === 'denied' ? 'bloqueados' : 'pedir');
    };
    window.addEventListener(MOSTRAR_CARTEL_DE_AVISOS, mostrar);
    return () => window.removeEventListener(MOSTRAR_CARTEL_DE_AVISOS, mostrar);
  }, []);

  function cerrar() {
    anotarPreguntado();
    setEstado('nada');
  }

  async function activar() {
    setEstado('activando');
    try {
      const e = await anotar(clave, true);
      if (e) { setError(e); setEstado('error'); return; }
      await probarAviso(null);
      setEstado('listo');
      setTimeout(() => setEstado('nada'), 8000);
    } catch {
      setError('No se pudieron activar los avisos en este celular.');
      setEstado('error');
    }
  }

  if (estado === 'nada') return null;
  return (
    <div className="cartel-avisos" role="dialog" aria-label="Avisos al celular">
      <Icono n="aviso" />
      <div className="cartel-avisos-texto">
        {estado === 'iphone' && <>
          <strong>Para recibir los avisos de las OT en el iPhone</strong>
          <span>En Safari, tocá Compartir → «Agregar a inicio» y abrí la app desde ese ícono. Ahí te va a aparecer este cartel para activarlos.</span>
        </>}
        {(estado === 'pedir' || estado === 'activando') && <>
          <strong>Recibí las OT en el celular</strong>
          <span>Te avisamos cuando te asignan, te devuelven o te llega una OT para revisar, aunque tengas la app cerrada.</span>
        </>}
        {estado === 'listo' && <>
          <strong>Listo, avisos activados</strong>
          <span>En un momento te llega un aviso de prueba.</span>
        </>}
        {estado === 'yaActivos' && <>
          <strong>Los avisos ya están activados en este equipo</strong>
          <span>Si no te llegan, mandate uno de prueba.</span>
        </>}
        {estado === 'bloqueados' && <>
          <strong>Este navegador tiene los avisos bloqueados</strong>
          <span>Para recibirlos, permití las notificaciones de esta página en la configuración del navegador (el candado junto a la dirección) y volvé a entrar.</span>
        </>}
        {estado === 'sinSoporte' && <>
          <strong>Este navegador no puede recibir avisos</strong>
          <span>Probá desde Chrome en el celular.</span>
        </>}
        {estado === 'error' && <>
          <strong>No se activaron los avisos</strong>
          <span>{error}</span>
        </>}
      </div>
      <div className="cartel-avisos-botones">
        {(estado === 'pedir' || estado === 'activando') && (
          <Button type="button" variant="primary" size="sm" disabled={estado === 'activando'} onClick={() => void activar()}>
            {estado === 'activando' ? 'Activando...' : 'Activar'}
          </Button>
        )}
        {estado === 'yaActivos' && (
          <Button type="button" variant="primary" size="sm" onClick={() => void activar()}>Probar</Button>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={cerrar}>{estado === 'pedir' || estado === 'activando' ? 'Ahora no' : 'Cerrar'}</Button>
      </div>
    </div>
  );
}
