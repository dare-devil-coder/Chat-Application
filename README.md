# Smart Chat

A real-time chat application built for the **Advanced Python Programming** course.
The web page is written with Next.js and React. All the logic runs in a **Python server**
(Flask and Socket.IO) with an SQLite database. A second client, written with Tkinter,
shows the same chat as a desktop window.

## Features

| Feature | What it does |
|---|---|
| Accounts | Register and log in, passwords are hashed |
| Real-time chat | Private messages between two users, saved history, online status |
| Photos, videos, documents | Send files up to 25 MB, shown inside the chat |
| Voice messages | Record in the browser and send as an audio player |
| Large files | Files up to 500 MB are uploaded in chunks and sent as an expiring download link |
| Scheduled messages | Send a message at a chosen date and time, cancel while pending |
| Disappearing messages | Per-chat timer (1 minute, 1 hour, 24 hours, 7 days) |
| Search | Search all messages and file names, filter by photos, videos, documents, voice, large files |
| Auto-reply | Keyword rules that answer automatically, with loop protection and a cooldown |
| AI assistant | Real Chat AI contact and slash commands: `/improve`, `/summarize`, `/reply`, `/translate`, `/help` |
| Translator | Translate any message with one click, translations are saved |
| Desktop client | A Tkinter window that logs in to the same server |

## Where the course experiments are used

| Experiment | Where in the project |
|---|---|
| 1. Data structures | `online_users` dict of sets, `sid_to_user`, rate limiter with `deque` |
| 2. Classes and inheritance | `User` / `AdminUser`, `AIProvider` with `GroqProvider`, `Command` classes |
| 3. Polymorphism | `can_delete_any_message()` override, providers with the same `complete()` method, `__str__` / `__eq__` |
| 4. Advanced functions | `@log_time` and `@register` decorators, `paginate` and `iter_file_blocks` generators, SQL `casefold` function |
| 5. Files and exceptions | `log_event` to `chat.log`, `.env` loader, upload and chunk files, custom exceptions in `exceptions.py` |
| 6. Database | SQLite CRUD in `database.py`, migrations with `ALTER TABLE` |
| 7. Threading | background worker in `scheduler.py`, `threading.Lock` around database writes |
| 8. Sockets | Socket.IO rooms for private messages, client in `desktop_client.py` |
| 9. REST API | the REST routes below, calls to the AI service with `requests` |
| 10. Tkinter | `desktop_client.py` |
| 12. Flask | routing, JSON handling, file serving, error handlers |

## Project structure

```
Project/
├── Backend/
│   ├── app.py              Flask routes and Socket.IO events
│   ├── database.py         SQLite tables and all queries
│   ├── models.py           User, Message, ScheduledMessage, AutoReplyRule classes
│   ├── exceptions.py       custom errors with HTTP status codes
│   ├── utils.py            decorators, generator, logging, time helpers
│   ├── uploads.py          photo / video / document / audio uploads
│   ├── large_files.py      chunked upload and expiring download links
│   ├── scheduler.py        background worker (scheduled, expiring, cleanup)
│   ├── auto_reply.py       keyword auto-reply with safety rules
│   ├── ai_client.py        AI providers (Groq, OpenAI-compatible, Anthropic, offline demo)
│   ├── ai_service.py       chat, improve, summarize, reply suggestions, translation
│   ├── commands.py         slash commands
│   ├── desktop_client.py   Tkinter client
│   ├── requirements.txt
│   └── .env.example
└── Frontend/               Next.js application (src/app, src/components, src/lib)
```

The server creates `chat.db`, `chat.log`, `uploads/`, `large_files/` and `large_tmp/` by itself.

## Setup

You need **Python 3.10 or newer** and **Node.js 18 or newer**.

### 1. Backend

```powershell
cd Backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

Copy `.env.example` to `.env` and choose the AI service:

```
AI_PROVIDER=groq
AI_API_KEY=your key from https://console.groq.com/keys
AI_MODEL=
```

Leave `AI_PROVIDER=mock` to run without a key. The AI features then give simple offline
answers that are marked as demo mode. Never share or upload the `.env` file.

Start the server:

```powershell
python app.py
```

It listens on `http://localhost:5000`.

### 2. Frontend

```powershell
cd Frontend
npm install
npm run dev
```

Open `http://localhost:3000`. Use `localhost` (not a network address), because browsers only
allow the microphone on `localhost` or HTTPS.

### 3. Desktop client (optional)

With the backend running, in the `Backend` folder:

```powershell
python desktop_client.py
```

## Using the app

1. Register two accounts and log in with each one in a separate browser tab.
2. Open a chat with the other user and send messages, photos and voice messages.
3. Type `/` in the message box to see the slash commands.
4. The clock button schedules a message, the reply-arrow in the sidebar opens the auto-reply rules,
   and the **Messages** switch in the sidebar searches all chats.

## Server interface

REST routes (all JSON unless noted):

| Route | Purpose |
|---|---|
| `POST /api/register`, `POST /api/login`, `GET /api/users` | accounts |
| `GET /api/messages/<a>/<b>`, `POST /api/messages`, `DELETE /api/messages/<id>` | chat history |
| `POST /api/upload`, `GET /uploads/<file>` | attachments up to 25 MB |
| `POST /api/large/start`, `PUT /api/large/<id>/chunk/<n>`, `GET .../status`, `POST .../complete`, `GET /f/<token>` | large files |
| `POST /api/scheduled`, `GET /api/scheduled/<user>`, `DELETE /api/scheduled/<id>` | scheduled messages |
| `GET/PUT /api/chats/<a>/<b>/timer` | disappearing messages |
| `GET /api/search` | message search |
| `GET/POST /api/autoreply`, `PATCH/DELETE /api/autoreply/<id>` | auto-reply rules |
| `GET/POST /api/commands`, `POST /api/ai/chat` | slash commands and Chat AI |
| `GET /api/languages`, `POST /api/translate` | translation |

Socket.IO events: `join`, `private message`, `presence`, `timer changed`, `messages expired`,
`scheduled sent`, `error message`.

## Limits and security notes

- There is no token login yet. The browser sends its `user_id`, so this app is meant for
  learning and demonstration, not for the open internet.
- Download links for large files point to `localhost`, so they work on the same computer or
  network only.
- With a real AI provider, the text you use a command on (or the latest chat messages)
  is sent to that company.
- Disappearing messages are deleted from the server only. They cannot stop screenshots.
- Uploaded files are checked by file type, large files are always downloaded (never shown
  inside a page), and programs such as `.exe` are refused.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Failed to fetch" in the browser | the Python server is not running or stopped after a file change; stop it with Ctrl+C and run `python app.py` again |
| `ImportError` when starting the server | a Backend file is missing or old; run `python -c "import app"` to see which one |
| AI answers say "Offline demo mode" | `.env` is missing or `AI_API_KEY` is empty |
| Microphone does not work | open the app at `http://localhost:3000` and allow the microphone |