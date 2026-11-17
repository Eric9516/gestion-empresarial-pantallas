'use client';
import { useState } from 'react';
import { Icono } from '@/components/Icono';
import { Button } from '@/components/ui/button';
import FormularioEnNext, { type DatosDelFormulario } from './FormularioEnNext';

// "Nuevo repuesto", para quien administra el Depósito.
export default function BotonNuevoRepuesto({ datos }: { datos: DatosDelFormulario }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Button variant="primary" size="sm" onClick={() => setAbierto(true)}><Icono n="mas" /> Nuevo artículo</Button>
      <FormularioEnNext open={abierto} onClose={() => setAbierto(false)} item={null} datos={datos} />
    </>
  );
}
