import json
import logging
import os
import time
from dataclasses import dataclass
from typing import List, Optional

import instaloader
import requests
from dotenv import load_dotenv


@dataclass
class PostData:
    shortcode: str
    caption: str
    post_url: str


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


class InstagramWatcher:
    def __init__(self, username: str) -> None:
        self.username = username
        self.loader = instaloader.Instaloader(
            sleep=False,
            quiet=True,
            max_connection_attempts=1,
        )

    def get_latest_posts(self, limit: int = 5) -> List[PostData]:
        profile = instaloader.Profile.from_username(self.loader.context, self.username)
        posts: List[PostData] = []
        for index, post in enumerate(profile.get_posts()):
            if index >= limit:
                break
            caption = (post.caption or "").strip().replace("\n", " ")
            if len(caption) > 180:
                caption = caption[:177] + "..."
            posts.append(
                PostData(
                    shortcode=post.shortcode,
                    caption=caption,
                    post_url=f"https://www.instagram.com/p/{post.shortcode}/",
                )
            )
        return posts


def load_state(path: str) -> Optional[str]:
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as state_file:
        data = json.load(state_file)
    return data.get("last_shortcode")


def save_state(path: str, shortcode: str) -> None:
    with open(path, "w", encoding="utf-8") as state_file:
        json.dump({"last_shortcode": shortcode}, state_file)


def format_message(username: str, post: PostData) -> str:
    summary = post.caption if post.caption else "(Sin texto)"
    return (
        f"Nueva publicación de @{username}\n"
        f"{summary}\n"
        f"{post.post_url}"
    )


def read_bool(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


def run() -> None:
    load_dotenv()
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )

    token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    chat_id = os.getenv("TELEGRAM_CHAT_ID", "").strip()
    instagram_username = os.getenv("INSTAGRAM_USERNAME", "").strip().lstrip("@")
    poll_seconds = int(os.getenv("POLL_SECONDS", "300"))
    state_file = os.getenv("STATE_FILE", "state.json").strip()
    send_on_first_run = read_bool(os.getenv("SEND_ON_FIRST_RUN", "false"))

    missing_vars = []
    if not token:
        missing_vars.append("TELEGRAM_BOT_TOKEN")
    if not chat_id:
        missing_vars.append("TELEGRAM_CHAT_ID")
    if not instagram_username:
        missing_vars.append("INSTAGRAM_USERNAME")

    if missing_vars:
        raise ValueError(f"Faltan variables: {', '.join(missing_vars)}")

    telegram = TelegramClient(token=token, chat_id=chat_id)
    watcher = InstagramWatcher(username=instagram_username)

    logging.info("Bot iniciado. Monitoreando @%s cada %ss", instagram_username, poll_seconds)

    while True:
        try:
            posts = watcher.get_latest_posts(limit=5)
            if not posts:
                logging.info("No se encontraron publicaciones para @%s", instagram_username)
                time.sleep(poll_seconds)
                continue

            newest_shortcode = posts[0].shortcode
            last_shortcode = load_state(state_file)

            if last_shortcode is None and not send_on_first_run:
                save_state(state_file, newest_shortcode)
                logging.info("Primera ejecución: estado inicial guardado sin enviar mensajes")
                time.sleep(poll_seconds)
                continue

            new_posts: List[PostData] = []
            for post in posts:
                if post.shortcode == last_shortcode:
                    break
                new_posts.append(post)

            if new_posts:
                for post in reversed(new_posts):
                    message = format_message(instagram_username, post)
                    telegram.send_message(message)
                    logging.info("Enviado post %s", post.shortcode)
                save_state(state_file, newest_shortcode)
            else:
                logging.info("Sin publicaciones nuevas")

        except Exception as error:
            logging.exception("Error en ciclo principal: %s", error)

        time.sleep(poll_seconds)


if __name__ == "__main__":
    run()
