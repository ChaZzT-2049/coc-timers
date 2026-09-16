# COC Timers

PWA para seguir **mejoras en curso** de Clash of Clans (aldea principal y base de constructores) y avisar cuando terminan.

This material is unofficial and is not endorsed by Supercell. For more information see [Supercell’s Fan Content Policy](https://www.supercell.com/fan-content-policy).

## Usar en el móvil

Cuando GitHub Pages esté activo: `https://chazzt-2049.github.io/coc-timers/`

1. Abre esa URL en Chrome (Android) o Safari (iPhone).
2. **Android:** menú → Instalar aplicación (o el botón Instalar app).
3. **iPhone:** Compartir → Añadir a pantalla de inicio, y abre el icono.

Los avisos puntuales funcionan con la app abierta o recién usada. El JSON se queda solo en el dispositivo. [Privacidad](./privacidad.html).

## Por qué se pega un JSON

La API oficial (`/players/{tag}`) da perfil, tropas y héroes, **no** edificios ni timers. El juego sí exporta eso:

1. Ajustes → Más ajustes
2. Abajo: **Exportar datos de la aldea en JSON** → Copiar
3. Pegar en la app

El JSON es una instantánea. Si usas pociones, Pase de Oro o cambias una mejora, vuelve a exportar.

## Cómo ejecutarla en local

Sirve la carpeta por HTTP (el service worker no funciona en `file://`):

```bash
npx --yes serve . -p 5173
```
