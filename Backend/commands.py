"""Slash commands such as /improve, /summarize and /reply.

Each command is a class with a run() method (Experiments 2 and 3). The @register
decorator (Experiment 4) adds it to the COMMANDS dictionary, so a new command only
needs a new class. The result is shown privately to the person who typed it.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field

import ai_client
import ai_service
from exceptions import InvalidInputError

COMMANDS = {}


def register(cls):
    """Class decorator: create one instance and store it under its name."""
    instance = cls()
    COMMANDS[instance.name] = instance
    return cls


@dataclass
class CommandContext:
    user_id: int
    partner_id: int | None        # the person whose chat is open (None in the Chat AI chat)
    args: str


@dataclass
class CommandResult:
    title: str
    text: str = ""
    suggestions: list = field(default_factory=list)
    use_text: str | None = None    # text the user can put into the message box with one click


class Command(ABC):
    name = ""
    description = ""
    usage = ""

    @abstractmethod
    def run(self, ctx):
        """Do the work and return a CommandResult."""

    def info(self):
        return {"name": self.name, "description": self.description, "usage": self.usage}


@register
class HelpCommand(Command):
    name = "help"
    description = "Show all commands"
    usage = "/help"

    def run(self, ctx):
        lines = [f"{c.usage}  -  {c.description}" for c in COMMANDS.values()]
        lines.append("The AI commands send the text or recent messages to the AI service.")
        return CommandResult(title="Commands", text="\n".join(lines))


@register
class ImproveCommand(Command):
    name = "improve"
    description = "Make your message clearer and more polite"
    usage = "/improve <your message>"

    def run(self, ctx):
        improved = ai_service.improve_text(ctx.user_id, ctx.args)
        return CommandResult(title="Improved message", text=improved, use_text=improved)


@register
class SummarizeCommand(Command):
    name = "summarize"
    description = "Summarize the recent messages of this chat"
    usage = "/summarize [number of messages]"

    def run(self, ctx):
        count = 30
        if ctx.args.strip():
            if not ctx.args.strip().isdigit() or not 1 <= int(ctx.args.strip()) <= 100:
                raise InvalidInputError("Use a number from 1 to 100, for example /summarize 20")
            count = int(ctx.args.strip())
        if ctx.partner_id is None:
            raise InvalidInputError("Open a chat with another person to summarize it")
        summary = ai_service.summarize_chat(ctx.user_id, ctx.partner_id, count)
        return CommandResult(title=f"Summary of the last {count} messages", text=summary)


@register
class ReplyCommand(Command):
    name = "reply"
    description = "Suggest replies to the last message you received"
    usage = "/reply"

    def run(self, ctx):
        if ctx.partner_id is None:
            raise InvalidInputError("Open a chat with another person to get reply suggestions")
        options = ai_service.suggest_replies(ctx.user_id, ctx.partner_id)
        return CommandResult(title="Suggested replies", suggestions=options)


def parse_input(raw):
    """'/improve hello there' -> ('improve', 'hello there')."""
    raw = (raw or "").strip()
    if not raw.startswith("/") or len(raw) < 2:
        raise InvalidInputError("A command starts with / (try /help)")
    name, _, args = raw[1:].partition(" ")
    return name.lower(), args.strip()


def execute(raw, user_id, partner_id=None):
    name, args = parse_input(raw)
    command = COMMANDS.get(name)
    if command is None:
        raise InvalidInputError(f"Unknown command /{name}. Type /help to see all commands")
    result = command.run(CommandContext(user_id, partner_id, args))
    return {
        "command": name,
        "title": result.title,
        "text": result.text,
        "suggestions": result.suggestions,
        "use_text": result.use_text,
        "provider": ai_client.get_provider().name if name != "help" else "",
    }