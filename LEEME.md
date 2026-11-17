# Gestión empresarial: copia para diseñar el módulo de Mantenimiento

Esta es **la misma app que usa la empresa** (la nueva), con una base de datos que corre en tu computadora y que trae **datos inventados**:
los equipos de ejemplo que armaste vos (bombas, compresor, caldera, pasteurizadores con sus sub-equipos…), unos repuestos en el Depósito
y una persona de cada rol. No se conecta a ningún servidor ni a datos reales: lo que cargues o borres acá no afecta a nadie.
Es privado: no se comparte ni se muestra a nadie.

## Para verla funcionando

1. Clonar el repositorio y abrir una terminal dentro de la carpeta.
2. Instalar (una sola vez, y cada vez que Eric te avise que hay una versión nueva):

   pnpm install

3. Arrancar la aplicación:

   pnpm run dev

   Se abre sola en el navegador (http://localhost:3020). La primera vez tarda un poco más: arma la base con los datos de ejemplo.

4. Entrar con uno de estos usuarios. **Todos tienen la contraseña `Ejemplo-2026`**:

   | Correo                    | Quién es                                   |
   |---------------------------|--------------------------------------------|
   | dueno@ejemplo.test        | Dueño: puede todo                          |
   | responsable@ejemplo.test  | Responsable de Mantenimiento               |
   | jefe@ejemplo.test         | Jefe de taller                             |
   | tecnico@ejemplo.test      | Técnico                                    |
   | tecnico2@ejemplo.test     | Otro técnico                               |
   | consulta@ejemplo.test     | Solo consulta (alguien de Producción)      |
   | deposito@ejemplo.test     | Encargado del Depósito                     |

   Para ver cómo le llega una OT a cada uno, abrí otra ventana de incógnito y entrá con otro usuario.

Para cortar la aplicación: `Ctrl + C` en la terminal. Lo que cargaste queda guardado para la próxima vez (en la carpeta `datos-de-prueba`,
que no se sube a GitHub). Para volver a empezar solo con los datos de ejemplo: `pnpm run datos-nuevos`.

Cuando Eric suba una versión nueva de la app, hacé `git pull` y `pnpm install`. Si la versión nueva cambia la base de datos, al arrancar
se vuelve a armar con los datos de ejemplo (lo que habías cargado se borra) y te avisa en la terminal.

## Lo que hiciste antes

Tu app anterior (la vieja) quedó guardada en este mismo repositorio con la marca `app-vieja`: no se borró nada.
Casi todo lo que diseñaste ya está andando en la app nueva: en `COMO-QUEDO-MANTENIMIENTO.md` está cómo quedó cada cosa y en qué cambió.

## Para trabajar con Claude

Abrí Claude en esta carpeta. Ya tiene un archivo (`CLAUDE.md`) con las reglas del proyecto, así que sabe qué puede tocar y qué no.
Contale en tus palabras qué querés cambiar o agregar, y pedile que te lo muestre en la app.

## Cuando termines un tramo

Decile a Claude: "guardá los cambios y subilos". Eric los ve en GitHub.

## Si algo no anda

- "No se encuentra pnpm": hay que instalarlo (`npm install -g pnpm`).
- "El puerto 3020 está en uso": ya hay otra copia de la app abierta. Cerrá esa terminal (o reiniciá la computadora) y volvé a arrancar.
- Cualquier otro error: copiá el mensaje y mostráselo a Claude o a Eric.
