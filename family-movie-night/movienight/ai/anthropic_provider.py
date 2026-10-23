"""Claude via the official ``anthropic`` Python SDK."""

from __future__ import annotations

from .base import AIError, LogFn


class AnthropicProvider:
    id = "anthropic"
    label = "Claude API"

    def __init__(self, api_key: str | None, model: str, effort: str = "medium") -> None:
        self.api_key = api_key
        self.model = model
        self.effort = effort

    def complete(self, system: str, user: str, log: LogFn) -> str:
        import anthropic

        if not self.api_key:
            raise AIError(
                "Nėra Claude API rakto. Įveskite jį Nustatymuose arba nustatykite "
                "ANTHROPIC_API_KEY."
            )
        client = anthropic.Anthropic(api_key=self.api_key, timeout=180.0)
        log(f"→ {self.model} (effort={self.effort}) per anthropic SDK…")
        try:
            # Server-side fallbacks: if the model declines, the API re-runs the
            # request on a suitable fallback model inside the same call.
            response = client.beta.messages.create(
                model=self.model,
                max_tokens=16000,
                system=system,
                messages=[{"role": "user", "content": user}],
                output_config={"effort": self.effort},
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
            )
        except anthropic.AuthenticationError:
            raise AIError("Claude API raktas neteisingas (401). Patikrinkite Nustatymus.") from None
        except anthropic.PermissionDeniedError as exc:
            raise AIError(f"Claude API: prieiga uždrausta (403): {exc.message}") from None
        except anthropic.NotFoundError:
            raise AIError(f"Modelis „{self.model}“ nerastas (404).") from None
        except anthropic.RateLimitError:
            raise AIError("Per daug užklausų (429). Palaukite minutę ir bandykite dar kartą.") from None
        except anthropic.APIStatusError as exc:
            raise AIError(f"Claude API klaida {exc.status_code}: {exc.message}") from None
        except anthropic.APIConnectionError:
            raise AIError("Nepavyko prisijungti prie Claude API. Patikrinkite internetą.") from None

        if response.stop_reason == "refusal":
            raise AIError("Modelis atsisakė atsakyti į šią užklausą. Pabandykite pakeisti užklausą.")
        text = "".join(block.text for block in response.content if block.type == "text")
        log(f"← {response.model}: {response.usage.input_tokens} įvesties / "
            f"{response.usage.output_tokens} išvesties žetonų, stop={response.stop_reason}")
        if response.stop_reason == "max_tokens":
            log("⚠ atsakymas nukirstas (max_tokens) – bandysiu išgauti, kas yra.")
        return text
