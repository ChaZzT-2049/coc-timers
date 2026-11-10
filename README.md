# Revisión de clan

App aparte de [COC Timers](https://github.com/ChaZzT-2049/coc-timers). Muestra la ficha oficial de un clan de Clash of Clans y un ranking para **revisar** miembros. No expulsa a nadie y no tiene un botón para sacarlos.

This material is unofficial and is not endorsed by Supercell. For more information see [Supercell’s Fan Content Policy](https://www.supercell.com/fan-content-policy).

## Token

El navegador solo envía la etiqueta del clan. El servidor lee `COC_API_TOKEN` y llama a `https://api.clashofclans.com/v1`. El token no se escribe en el repositorio ni se manda al navegador.

En la app publicada, guarda ese nombre como secreto en Cursor (el diálogo de publicar lo muestra; el valor se añade en los secretos de Cursor, no en el chat). Si falta, la pantalla lo explica y no inventa un clan.

En local, con el servidor de esta app:

```bash
COC_API_TOKEN="el token de developer.clashofclans.com" npm run dev
```

El token sale de [developer.clashofclans.com](https://developer.clashofclans.com/). No lo pegues en el chat.

## Qué ordena el ranking

De más señales a menos. Cada señal se enseña en la ficha. Líder y colíderes se listan con sus datos y no entran en el ranking.

1. **Donaciones.** Las dadas no llegan a la mitad de las recibidas (y recibió al menos 100) **y** están por debajo de la mitad de la mediana del clan (la mediana tiene que ser de al menos 100). Hacen falta las dos cosas.
2. **Guerra.** Ataques sin usar en la guerra en curso o recién terminada, y en las últimas guerras públicas del registro que traen ataques por jugador. Si el registro es privado o la llamada falla, las columnas quedan vacías y no se cuenta.
3. **Liga de clanes.** Solo si hay un grupo activo. Cuenta quien estaba en la alineación de una guerra ya empezada y no usó su ataque. La preparación no cuenta.
4. **Capital.** Cero ataques en la temporada de asalto más reciente. Si la API no trae temporada, no se cuenta.
5. **Copas.** Por debajo de `requiredTrophies` del clan. Igualar el requisito no cuenta.

Quien junta varias de estas queda más arriba. A igual peso, gana quien tiene más tipos de señal.

## Datos

Solo la API oficial: clan, perfiles (`town hall`, héroes, estrellas de guerra, liga), guerra actual e historial si el registro es público, distritos y última temporada de capital, y el grupo de liga si el clan está en CWL.

## Local

```bash
npm install
npm test
npm run dev
```

Abre `http://127.0.0.1:4173`.
