# Bot Instagram -> Telegram

Este bot revisa periódicamente las últimas publicaciones de una cuenta pública de Instagram y envía las nuevas a un chat de Telegram.

## Requisitos

- Python 3.10+
- Un bot de Telegram (token con `@BotFather`)
- El `chat_id` donde quieres recibir mensajes

## Configuración

1. Crea entorno virtual e instala dependencias:

```bash
python -m venv .venv
.venv\\Scripts\\activate
pip install -r requirements.txt
```

2. Copia `.env.example` a `.env` y completa valores:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `INSTAGRAM_USERNAME` (sin `@`)

Opcionales:
- `POLL_SECONDS` (por defecto `300`)
- `STATE_FILE` (por defecto `state.json`)
- `SEND_ON_FIRST_RUN` (`false` para no reenviar histórico)

## Ejecución

```bash
python src/main.py
```

## Deploy en Render (worker 24/7)

Este repositorio ya incluye [render.yaml](render.yaml), así que puedes usar Blueprint:

1. Sube el repo a GitHub.
2. En Render: **New +** -> **Blueprint** -> conecta el repo.
3. Render detecta el worker y usará:
	- build: `pip install -r requirements.txt`
	- start: `python src/main.py`
4. En variables de entorno del servicio, completa:
	- `TELEGRAM_BOT_TOKEN`
	- `TELEGRAM_CHAT_ID`
	- `INSTAGRAM_USERNAME`

Opcionales:
- `POLL_SECONDS` (ejemplo `300`)
- `SEND_ON_FIRST_RUN` (`false` recomendado)
- `STATE_FILE` (`state.json` por defecto)

## Deploy en Railway (worker 24/7)

Este repo también incluye [Procfile](Procfile) con el comando worker:

- `worker: python src/main.py`

Pasos:

1. Crea proyecto en Railway desde tu repo.
2. Configura las mismas variables de entorno:
	- `TELEGRAM_BOT_TOKEN`
	- `TELEGRAM_CHAT_ID`
	- `INSTAGRAM_USERNAME`
3. Deploy.

## Subir a GitHub

Ejecuta en la raíz del proyecto:

```bash
git init
git add .
git commit -m "Bot Instagram -> Telegram"
git branch -M main
git remote add origin TU_URL_DEL_REPO
git push -u origin main
```

## Deploy en Netlify (cron)

Este repositorio incluye:

- [netlify.toml](netlify.toml)
- [netlify/functions/instagram-check.js](netlify/functions/instagram-check.js)
- [package.json](package.json)

En Netlify:

1. **Add new site** -> **Import an existing project** -> selecciona tu repo.
2. Build command: `npm install`.
3. Publish directory: puede quedar vacío o `.` (no se publica frontend, solo función).
4. En **Environment variables** agrega:
	- `TELEGRAM_BOT_TOKEN`
	- `TELEGRAM_CHAT_ID`
	- `INSTAGRAM_USERNAME` (sin `@`)
	- `SEND_ON_FIRST_RUN=false` (recomendado)
	- `DASHBOARD_TOKEN=tu_clave_privada` (opcional, recomendado para proteger dashboard)
5. Deploy.

La función programada corre cada 5 minutos y solo envía si detecta un post nuevo.

## Dashboard web en Netlify

Después del deploy, abre la raíz del sitio de Netlify (`/`).

- Botón **Actualizar estado**: consulta configuración y último resultado.
- Botón **Ejecutar revisión ahora**: fuerza una revisión inmediata del perfil.

Si configuras `DASHBOARD_TOKEN`, escríbelo en el campo del dashboard para autorizar llamadas.

### Nota de estado en Netlify

En Netlify el estado se guarda en Blobs (clave por usuario), por eso no depende de `state.json`.
Para Netlify no necesitas `POLL_SECONDS` ni `STATE_FILE`.

## Persistencia de estado en cloud

El bot guarda el último post enviado en `state.json`.
Si el servicio reinicia y ese archivo no persiste, con `SEND_ON_FIRST_RUN=false` no enviará histórico: tomará el último post actual como referencia y seguirá desde ahí.

## Notas

- Funciona con cuentas públicas.
- Si Instagram limita peticiones temporalmente, el bot reintentará en el siguiente ciclo.
- El estado de la última publicación enviada se guarda en `state.json`.
