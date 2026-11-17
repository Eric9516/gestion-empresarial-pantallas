// El número rojo de los avisos: se cuenta hasta LIMITE (y se muestra "99+"): no hace falta saber cuántas son si hay cientos, y así la consulta nunca pesa.
// Aparte de useAvisos (que habla con la base) para poder usarlo en cualquier pantalla, también en la app de Next.
export const LIMITE_DE_AVISOS = 100;

// El texto del número: "99+" si son muchos.
export const textoDeAviso = (n: number) => (n >= LIMITE_DE_AVISOS ? `${LIMITE_DE_AVISOS - 1}+` : String(n));
