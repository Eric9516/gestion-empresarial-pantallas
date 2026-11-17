// Algunos tipos compartidos (por ejemplo Familia o RepuestoDeLista) viven en archivos de la app de Vite que también leen sus variables
// (import.meta.env). Next solo importa los tipos, nunca ese código; esto le dice a TypeScript cómo son esas variables.
/// <reference types="vite/client" />
