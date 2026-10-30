"""Talks to an AI service.

Every provider has the same method, complete(), so the rest of the app does not
care which service is used (Experiments 2 and 3: abstract class, polymorphism).
The provider is chosen in the .env file:

    AI_PROVIDER = mock        works offline with no key (demo mode)
    AI_PROVIDER = anthropic   needs AI_API_KEY and AI_MODEL
    AI_PROVIDER = groq        Groq: needs AI_API_KEY (AI_MODEL is optional)
    AI_PROVIDER = openai      any OpenAI-compatible service: needs AI_API_KEY,
                              AI_MODEL and (for non-OpenAI services) AI_BASE_URL
"""
import json
import os
import re
from abc import ABC, abstractmethod

import requests

from exceptions import AIUnavailableError, InvalidInputError
from utils import log_event

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
REQUEST_TIMEOUT = 25            # seconds


# ------------------------------------------------------------------ settings
def load_env_file(path=None):
    """Read KEY=VALUE lines from the .env file into the environment (Experiment 5)."""
    path = path or os.path.join(BASE_DIR, ".env")
    try:
        with open(path, encoding="utf-8") as f:
            lines = f.read().splitlines()
    except FileNotFoundError:
        return
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def normalize_messages(messages):
    """Make a chat history acceptable for every AI service: it must start with a
    'user' message, and two messages in a row from the same role are merged."""
    cleaned = []
    for m in messages:
        role = "assistant" if m.get("role") == "assistant" else "user"
        content = str(m.get("content", "")).strip()
        if not content:
            continue
        if not cleaned and role == "assistant":
            continue                                   # drop leading assistant messages
        if cleaned and cleaned[-1]["role"] == role:
            cleaned[-1]["content"] += "\n" + content
        else:
            cleaned.append({"role": role, "content": content})
    if not cleaned:
        raise InvalidInputError("There is nothing to send to the AI")
    return cleaned


# ------------------------------------------------------------------ providers
class AIProvider(ABC):
    name = "base"
    model = ""

    @abstractmethod
    def complete(self, system, messages, max_tokens=400):
        """Return the AI's answer (plain text) to `messages`, guided by `system`."""

    def _post(self, url, headers, payload):
        headers = {**headers, "User-Agent": "ChatApp/1.0 (course project)"}
        try:
            response = requests.post(url, headers=headers, json=payload, timeout=REQUEST_TIMEOUT)
        except requests.Timeout:
            raise AIUnavailableError("The AI service took too long to answer")
        except requests.RequestException:
            raise AIUnavailableError("Could not reach the AI service")

        if response.status_code >= 400:
            reason = self._reason(response)
            if response.status_code in (401, 403):
                message = "The AI key is missing or not accepted (check AI_API_KEY in .env)"
            elif response.status_code == 429:
                wait = response.headers.get("retry-after", "")
                hint = f" Try again in about {wait} seconds." if wait.isdigit() else " Try again later."
                message = "The AI service is busy or the quota is used up." + hint
            else:
                message = f"The AI service returned an error ({response.status_code})"
            raise AIUnavailableError(f"{message} Details: {reason}" if reason else message)
        try:
            return response.json()
        except ValueError:
            raise AIUnavailableError("The AI service sent an answer that could not be read")

    def _reason(self, response):
        """The service's own explanation (for example 'model not found'), without the key."""
        try:
            error = response.json().get("error")
            text = error.get("message") if isinstance(error, dict) else error
        except (ValueError, AttributeError):
            text = response.text
        text = " ".join(str(text or "").split())[:200]
        key = getattr(self, "api_key", "")
        return text.replace(key, "***") if key else text


class AnthropicProvider(AIProvider):
    name = "anthropic"

    def __init__(self, api_key, model, base_url=None):
        self.api_key = api_key
        self.model = model
        self.base_url = (base_url or "https://api.anthropic.com").rstrip("/")

    def complete(self, system, messages, max_tokens=400):
        data = self._post(
            f"{self.base_url}/v1/messages",
            {"x-api-key": self.api_key, "anthropic-version": "2023-06-01",
             "content-type": "application/json"},
            {"model": self.model, "max_tokens": max_tokens, "system": system,
             "messages": normalize_messages(messages)})
        blocks = data.get("content") or []
        text = "".join(b.get("text", "") for b in blocks if b.get("type") == "text").strip()
        if not text:
            raise AIUnavailableError("The AI service sent an empty answer")
        return text


class OpenAICompatibleProvider(AIProvider):
    name = "openai"

    def __init__(self, api_key, model, base_url=None):
        self.api_key = api_key
        self.model = model
        self.base_url = (base_url or "https://api.openai.com/v1").rstrip("/")

    def complete(self, system, messages, max_tokens=400):
        data = self._post(
            f"{self.base_url}/chat/completions",
            {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
            {"model": self.model,
             "messages": [{"role": "system", "content": system}] + normalize_messages(messages)})
        try:
            text = (data["choices"][0]["message"]["content"] or "").strip()
        except (KeyError, IndexError, TypeError):
            raise AIUnavailableError("The AI service sent an answer that could not be read")
        if not text:
            raise AIUnavailableError("The AI service sent an empty answer")
        return text


class GroqProvider(OpenAICompatibleProvider):
    """Groq speaks the OpenAI format, so only the address and a default model differ."""
    name = "groq"
    DEFAULT_BASE_URL = "https://api.groq.com/openai/v1"
    DEFAULT_MODEL = "openai/gpt-oss-20b"

    def __init__(self, api_key, model=None, base_url=None):
        super().__init__(api_key, model or self.DEFAULT_MODEL, base_url or self.DEFAULT_BASE_URL)


# Common short forms the offline demo expands
_ABBREVIATIONS = {
    "u": "you", "ur": "your", "pls": "please", "plz": "please", "thx": "thanks",
    "gonna": "going to", "wanna": "want to", "gotta": "have to", "idk": "I don't know",
    "im": "I'm", "dont": "don't", "cant": "can't", "wont": "won't", "ive": "I've",
    "didnt": "didn't", "doesnt": "doesn't", "isnt": "isn't",
}


class MockProvider(AIProvider):
    """Works without internet or a key, so the app can always be demonstrated.

    The command code puts a tag such as [task:improve] into the system text; this
    class reads the tag and answers with simple rules instead of a real AI.
    """
    name = "mock"
    model = "offline-demo"

    def complete(self, system, messages, max_tokens=400):
        match = re.search(r"\[task:(\w+)\]", system)
        task = match.group(1) if match else "chat"
        last = normalize_messages(messages)[-1]["content"]
        handler = getattr(self, f"_{task}", self._chat)
        return handler(last)

    def _chat(self, text):
        lowered = text.lower()
        if re.search(r"\b(hi|hello|hey)\b", lowered):
            return "Hello! I'm running in offline demo mode, so my answers are simple. Add an AI key in .env for real answers."
        if "?" in text:
            return "Good question! In offline demo mode I can't answer it. Add an AI key in the .env file and I will."
        return f"I received: \"{text[:80]}\". (Offline demo mode: add an AI key in .env for real answers.)"

    def _improve(self, text):
        def expand(match):
            return _ABBREVIATIONS[match.group(0).lower()]
        pattern = r"\b(" + "|".join(map(re.escape, _ABBREVIATIONS)) + r")\b"
        text = re.sub(pattern, expand, " ".join(text.split()), flags=re.IGNORECASE)
        sentences = re.split(r"(?<=[.!?])\s+", text)
        text = " ".join(s[:1].upper() + s[1:] for s in sentences if s)
        if text and text[-1] not in ".!?":
            text += "."
        return text

    def _summarize(self, text):
        body = text.split("<conversation>")[-1].split("</conversation>")[0]
        lines = [l for l in body.strip().splitlines() if ": " in l]
        if not lines:
            return "- There is nothing to summarize."
        counts = {}
        for line in lines:
            who = line.split(": ", 1)[0]
            counts[who] = counts.get(who, 0) + 1
        busiest = max(counts, key=counts.get)
        last_who, last_text = lines[-1].split(": ", 1)
        return (f"- {len(lines)} messages between {' and '.join(sorted(counts))}\n"
                f"- Most active: {busiest} ({counts[busiest]} messages)\n"
                f"- Last message ({last_who}): {last_text[:100]}\n"
                f"- (Offline demo summary: add an AI key in .env for a real one)")

    def _reply(self, text):
        last = text.split("<conversation>")[-1].split("</conversation>")[0].strip().splitlines()
        message = last[-1].split(": ", 1)[-1].lower() if last else ""
        if "?" in message:
            options = ["Yes, that works for me.", "Let me check and get back to you.", "Can you tell me a bit more?"]
        elif "thank" in message:
            options = ["You're welcome!", "Anytime!", "Happy to help."]
        else:
            options = ["Okay, got it.", "Thanks for letting me know.", "Sounds good, let's talk later."]
        return json.dumps(options)


# ------------------------------------------------------------------ factory
_provider = None


def get_provider():
    """Create the provider named in .env the first time it is needed."""
    global _provider
    if _provider is not None:
        return _provider
    load_env_file()
    kind = os.environ.get("AI_PROVIDER", "mock").strip().lower()
    key = os.environ.get("AI_API_KEY", "").strip()
    model = os.environ.get("AI_MODEL", "").strip()
    base_url = os.environ.get("AI_BASE_URL", "").strip() or None

    if kind == "groq" and not key:
        log_event("AI: AI_PROVIDER=groq needs AI_API_KEY; using the offline demo instead")
        kind = "mock"
    elif kind in ("anthropic", "openai") and (not model or not (key or base_url)):
        log_event(f"AI: AI_PROVIDER={kind} needs AI_API_KEY and AI_MODEL; using the offline demo instead")
        kind = "mock"
    if kind == "groq":
        _provider = GroqProvider(key, model or None, base_url)
    elif kind == "anthropic":
        _provider = AnthropicProvider(key, model, base_url)
    elif kind == "openai":
        _provider = OpenAICompatibleProvider(key, model, base_url)
    else:
        _provider = MockProvider()
    log_event(f"AI provider: {_provider.name} ({_provider.model})")
    return _provider


def reset_provider():
    """Forget the chosen provider (used by tests)."""
    global _provider
    _provider = None