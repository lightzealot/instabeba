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

## Deploy en Netlify (modo manual)

Este repositorio incluye:

- [netlify.toml](netlify.toml)
- [package.json](package.json)

En Netlify:

1. **Add new site** -> **Import an existing project** -> selecciona tu repo.
2. Build command: `npm install`.
3. Publish directory: puede quedar vacío o `.` (no se publica frontend, solo función).
4. En **Environment variables** agrega:
	- `TELEGRAM_BOT_TOKEN`
	- `TELEGRAM_CHAT_ID`
	- `DASHBOARD_TOKEN=tu_clave_privada` (opcional, recomendado para proteger dashboard)
5. Deploy.

No hay cron automático: el envío se ejecuta manualmente desde el dashboard.

## Dashboard web en Netlify

Después del deploy, abre la raíz del sitio de Netlify (`/`).

- **Dashboard de Inicio**: envío rápido con link de Instagram y resumen de estado.
- **Selección de Plantilla**: elige plantillas orientadas a comentar, dar like y apoyar a Beba.
- **Editor de Mensaje**: permite ajustar el texto antes de enviar y ver preview.
- **Configuración de Telegram**: guarda `DASHBOARD_TOKEN`, recarga plantillas y envía mensaje de prueba.

El envío principal usa la función `dashboard-send` (POST) con:
- `templateId`
- `postUrl`
- `customMessage` (opcional)

Estado/configuración para KPIs en dashboard:
- `dashboard-config` (GET)

Si configuras `DASHBOARD_TOKEN`, escríbelo en el campo del dashboard para autorizar llamadas.

## Notas

- El dashboard funciona con envío manual de links de Instagram.
- El mensaje se construye con plantilla + link, y opcionalmente con texto editado.
