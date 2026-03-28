import logging
import os
import sys
from typing import Optional

import requests
from dotenv import load_dotenv


class TelegramClient:
    def __init__(self, token: str, chat_id: str) -> None:
        self.base_url = f"https://api.telegram.org/bot{token}"
        self.chat_id = chat_id

    def send_message(self, text: str) -> None:
        response = requests.post(
            f"{self.base_url}/sendMessage",
            json={
                "chat_id": self.chat_id,
                "text": text,
                "disable_web_page_preview": False,
            },
            timeout=20,
        )
        response.raise_for_status()


def resolve_post_url() -> Optional[str]:
    arg_url = sys.argv[1].strip() if len(sys.argv) > 1 else ""
    env_url = os.getenv("POST_URL", "").strip()
    return arg_url or env_url or None


def format_message(post_url: str) -> str:
    template = os.getenv("TELEGRAM_MESSAGE_TEMPLATE", "Nueva publicacion:\n{post_url}")
    if "{post_url}" not in template:
        template = template + "\n{post_url}"
    return template.format(post_url=post_url)


def run() -> None:
    load_dotenv()
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )

    token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    chat_id = os.getenv("TELEGRAM_CHAT_ID", "").strip()
    post_url = resolve_post_url()

    missing_vars = []
    if not token:
        missing_vars.append("TELEGRAM_BOT_TOKEN")
    if not chat_id:
        missing_vars.append("TELEGRAM_CHAT_ID")

    if missing_vars:
        raise ValueError(f"Faltan variables: {', '.join(missing_vars)}")

    if not post_url:
        logging.info("No se envio ningun link. Usa: python src/main.py <post_url> o define POST_URL en .env")
        return

    telegram = TelegramClient(token=token, chat_id=chat_id)
    message = format_message(post_url)
    telegram.send_message(message)
    logging.info("Link enviado correctamente a Telegram: %s", post_url)


if __name__ == "__main__":
    run()
