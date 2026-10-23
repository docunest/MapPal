"""DeepSeek chat completions over plain HTTPS (stdlib only, no extra dependency).

DeepSeek's API is OpenAI-style: POST {base_url}/chat/completions with a
Bearer key. Set the key in Settings or the DEEPSEEK_API_KEY env var.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request

from .base import AIError, LogFn


class DeepSeekProvider:
    id = "deepseek"
    label = "DeepSeek"

    def __init__(self, api_key: str | None, model: str, base_url: str, timeout: float = 180.0) -> None:
        self.api_key = api_key
        self.model = model or "deepseek-chat"
        self.base_url = (base_url or "https://api.deepseek.com").rstrip("/")
        self.timeout = timeout

    def complete(self, system: str, user: str, log: LogFn) -> str:
        if not self.api_key:
            raise AIError("Nėra DeepSeek API rakto. Įveskite jį Nustatymuose arba DEEPSEEK_API_KEY.")
        body = json.dumps({
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "stream": False,
        }).encode("utf-8")
        request = urllib.request.Request(
            f"{self.base_url}/chat/completions",
            data=body,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}",
            },
            method="POST",
        )
        log(f"→ {self.model} per {self.base_url}…")
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:300]
            if exc.code == 401:
                raise AIError("DeepSeek raktas neteisingas (401).") from None
            if exc.code == 429:
                raise AIError("DeepSeek: per daug užklausų (429). Bandykite vėliau.") from None
            raise AIError(f"DeepSeek klaida {exc.code}: {detail}") from None
        except (urllib.error.URLError, TimeoutError) as exc:
            raise AIError(f"Nepavyko prisijungti prie DeepSeek: {exc}") from None
        try:
            return payload["choices"][0]["message"]["content"] or ""
        except (KeyError, IndexError, TypeError):
            raise AIError("DeepSeek grąžino netikėtą atsakymą.") from None
