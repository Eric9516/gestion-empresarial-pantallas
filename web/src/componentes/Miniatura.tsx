'use client';
import { useState, type ImgHTMLAttributes } from 'react';
import { miniatura } from '~/lib/miniatura';

/** Una foto chica de lista: pide la miniatura y, si no se pudo armar (un formato raro), muestra la foto completa. */
export default function Miniatura({ url, ...resto }: { url: string } & Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'>) {
  const [completa, setCompleta] = useState(false);
  return <img {...resto} src={completa ? url : miniatura(url)} onError={() => setCompleta(true)} alt={resto.alt ?? ''} loading="lazy" decoding="async" />;
}
