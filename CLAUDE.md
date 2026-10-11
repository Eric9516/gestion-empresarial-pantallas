# Reglas del proyecto (leer antes de hacer cualquier cosa)

## Qué es esto y con quién hablás
Esta carpeta es una copia **solo de las pantallas** de "Gestión empresarial", una aplicación interna para fábricas (React 19 + TypeScript + Vite).
La persona que te habla es el **encargado de mantenimiento de la fábrica** y **no sabe programar**. Explicale todo en español simple, sin jerga, de a una cosa por vez, y preguntale cómo trabajan ellos en la fábrica antes de inventar pantallas.
Eric conectará después las pantallas con la base de datos. No hay base de datos en esta carpeta y no se crea ninguna.

## Lo que SÍ hacés
- Crear el módulo de Mantenimiento: **solo las pantallas y su lógica de pantalla**. Todo lo nuevo va en la carpeta `src/features/mantenimiento/` y se engancha desde `src/pages/MantenimientoPage.tsx` (nueva pestaña o pantalla).
- Parecerte a lo que ya existe: usá los componentes de `src/components/` y `src/components/ui/`, las clases de `src/styles/`, y mirá cómo están hechas `src/features/reparaciones/` y `src/features/items/` para copiar el estilo.
- Íconos: siempre `<Icono n="nombre" />` (`src/components/Icono.tsx`). **Nunca emojis ni símbolos sueltos** (✓, ●, ⋮…): hay una prueba que lo controla. Si falta un ícono, se agrega una línea en ese archivo.
- Textos en español rioplatense (vos), como el resto de la app.

## Datos nuevos: siempre detrás de un "hook"
Las tablas que ya existen (repuestos, proveedores, envíos, retiros, reparaciones, equipos…) se piden con el cliente de datos que ya usa la app (mirá cómo lo hacen los archivos `use*.ts` de cada carpeta de `src/features/`).
Para lo que **todavía no existe en la base**, no inventes tablas ni llames a nada nuevo del servidor. Hacé esto:
1. Definí los tipos en `src/features/mantenimiento/tipos.ts`.
2. Poné datos de ejemplo en `src/features/mantenimiento/datosDemo.ts`, claramente marcados como ejemplo.
3. Hacé que cada pantalla pida sus datos a una función propia (`useAlgo()` en un archivo aparte) que **hoy devuelve los datos de ejemplo** y devuelva la misma forma que devolvería la base. Así, Eric solo cambia el interior de esa función cuando conecte la base.

## Lo que NO hacés (sin preguntarle antes a Eric)
- No toques: `src/auth/`, `src/lib/types.ts`, `src/lib/database.types.ts`, `src/lib/modulos.ts`, `src/lib/modulos.json`, `src/lib/supabaseClient.ts`, ni nada de permisos o de licencias.
- No cambies las pantallas que ya existen (Directorio, Depósito, Tareas, Configuración) salvo para enganchar el módulo nuevo.
- No agregues librerías (`pnpm add`) ni cambies `package.json`, `vite.config.ts` o `tsconfig*.json`.
- No subas, imprimas ni pidas contraseñas o claves. El archivo `.env` de este repositorio trae solo la dirección y la clave **pública** de una base de pruebas: no lo cambies ni agregues otras claves o contraseñas (ni de servicio, ni de Supabase, ni de nadie) a ningún archivo.- No borres ni modifiques datos en masa de la base a la que se conecta la app: es una copia de datos reales de la fábrica. Para probar, creá registros con nombres que digan "PRUEBA".
- No compartas ni copies este código fuera de esta computadora.

## Cómo trabajás
1. Trabajá directamente en la rama `main` (es la única que hay).
2. Antes de dar algo por terminado, corré: `pnpm test`, `pnpm lint` y `pnpm build`. Los tres tienen que pasar sin errores. Si fallan, arreglalo o explicá por qué.
3. Probalo en el navegador (`pnpm run dev`), también en un ancho de celular, y decile al usuario qué mirar.
4. Guardá los cambios con `git commit` en pasos chicos, con mensajes claros, y **subilos con `git push`** al terminar cada tramo (Eric los mira en GitHub).
5. Al terminar un tramo, escribí `NOTAS-PARA-ERIC.md` en la raíz con: qué se hizo, qué pantallas hay, **qué datos necesita cada pantalla** (tablas, columnas, relaciones, permisos: quién puede ver, crear, editar o borrar) y qué dudas quedaron. Eric usa ese archivo para armar la base de datos.

## Datos útiles del proyecto
- Idioma de la interfaz: español (Argentina), fechas con `es-AR`.
- Los módulos de la app se prenden y apagan por cliente; Mantenimiento ya existe como módulo (reparaciones). El módulo nuevo va dentro de Mantenimiento.
- Las pruebas (`pnpm test`) son rápidas y no necesitan internet.
