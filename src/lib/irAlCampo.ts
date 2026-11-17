// Lleva a la persona al campo que falta completar (lo trae a la vista y lo deja con el foco): en el celular el formulario suele quedar
// fuera de la pantalla, y un aviso sin decir dónde no alcanza.
export function irAlCampo(id: string | null | undefined) {
  const campo = id ? document.getElementById(id) : null;
  if (!campo) return;
  campo.scrollIntoView({ block: 'center', behavior: 'smooth' });
  campo.focus({ preventScroll: true });
}
