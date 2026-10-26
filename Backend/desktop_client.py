"""
Desktop chat client (Tkinter) for the Flask-SocketIO chat server.

Experiments covered: 10 (Tkinter widgets + layout managers), 7 (threads: the
socket runs in a background thread and talks to the GUI through a Queue),
5 (custom exception + try/except), 8 (client-server communication).
"""
import queue
import tkinter as tk
from tkinter import ttk, messagebox
from datetime import datetime, timezone

import requests
import socketio

API_URL = "http://localhost:5000"


class ApiError(Exception):
    """Raised when the server answers with an error message."""


def error_text(response):
    try:
        return response.json().get("error", "Something went wrong")
    except ValueError:
        return "Something went wrong"


def format_time(ts):
    """Server sends UTC like '2026-10-26 04:44:37' -> local '10:14 AM'."""
    dt = datetime.strptime(ts, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
    return dt.astimezone().strftime("%I:%M %p")


class ChatClient:
    def __init__(self, root):
        self.root = root
        root.title("Chat - Desktop Client")
        root.geometry("780x520")
        root.minsize(640, 420)
        root.protocol("WM_DELETE_WINDOW", self.on_close)

        self.events = queue.Queue()   # socket thread -> GUI thread
        self.sio = None
        self.me = None
        self.users = []               # [{'id':.., 'username':..}, ...]
        self.online = set()
        self.unread = set()
        self.selected_id = None

        self.username_var = tk.StringVar()
        self.password_var = tk.StringVar()
        self.status_var = tk.StringVar()
        self.entry_var = tk.StringVar()

        self.build_login()
        self.root.after(100, self.process_events)

    # ------------------------------------------------------------ login screen
    def build_login(self):
        self.login_frame = ttk.Frame(self.root, padding=30)
        self.login_frame.place(relx=0.5, rely=0.5, anchor="center")
        f = self.login_frame

        ttk.Label(f, text="Chat", font=("Segoe UI", 22, "bold")).grid(
            row=0, column=0, columnspan=2, pady=(0, 15))

        ttk.Label(f, text="Username").grid(row=1, column=0, sticky="e", padx=5, pady=5)
        username_entry = ttk.Entry(f, textvariable=self.username_var, width=26)
        username_entry.grid(row=1, column=1, pady=5)

        ttk.Label(f, text="Password").grid(row=2, column=0, sticky="e", padx=5, pady=5)
        password_entry = ttk.Entry(f, textvariable=self.password_var, width=26, show="*")
        password_entry.grid(row=2, column=1, pady=5)

        buttons = ttk.Frame(f)
        buttons.grid(row=3, column=0, columnspan=2, pady=(12, 5))
        ttk.Button(buttons, text="Log in", command=lambda: self.authenticate(False)).pack(side="left", padx=5)
        ttk.Button(buttons, text="Register", command=lambda: self.authenticate(True)).pack(side="left", padx=5)

        ttk.Label(f, textvariable=self.status_var, foreground="#DC2626").grid(
            row=4, column=0, columnspan=2)

        password_entry.bind("<Return>", lambda e: self.authenticate(False))
        username_entry.focus_set()

    def authenticate(self, register):
        username = self.username_var.get().strip()
        password = self.password_var.get()
        body = {"username": username, "password": password}
        try:
            if register:
                r = requests.post(f"{API_URL}/api/register", json=body, timeout=5)
                if r.status_code != 201:
                    raise ApiError(error_text(r))
            r = requests.post(f"{API_URL}/api/login", json=body, timeout=5)
            if not r.ok:
                raise ApiError(error_text(r))
            self.me = r.json()
        except ApiError as err:
            self.status_var.set(str(err))
            return
        except requests.RequestException:
            self.status_var.set("Cannot reach the server")
            return

        self.status_var.set("")
        self.login_frame.destroy()
        self.build_chat()
        self.load_users()
        self.connect_socket()

    # ------------------------------------------------------------- chat screen
    def build_chat(self):
        self.chat_frame = ttk.Frame(self.root)
        self.chat_frame.pack(fill="both", expand=True)
        self.chat_frame.columnconfigure(1, weight=1)
        self.chat_frame.rowconfigure(1, weight=1)

        # top bar
        top = ttk.Frame(self.chat_frame, padding=8)
        top.grid(row=0, column=0, columnspan=2, sticky="ew")
        ttk.Label(top, text=f"Signed in as {self.me['username']}",
                  font=("Segoe UI", 11, "bold")).pack(side="left")
        ttk.Button(top, text="Log out", command=self.logout).pack(side="right")

        # left: contact list
        left = ttk.Frame(self.chat_frame)
        left.grid(row=1, column=0, sticky="ns", padx=(8, 4), pady=(0, 8))
        self.user_list = tk.Listbox(left, width=24, exportselection=False,
                                    activestyle="none", font=("Segoe UI", 11))
        self.user_list.pack(fill="y", expand=True)
        self.user_list.bind("<<ListboxSelect>>", self.on_select_user)

        # right: conversation
        right = ttk.Frame(self.chat_frame)
        right.grid(row=1, column=1, sticky="nsew", padx=(4, 8), pady=(0, 8))
        right.columnconfigure(0, weight=1)
        right.rowconfigure(1, weight=1)

        self.chat_title = ttk.Label(right, text="Select a contact to start chatting",
                                    font=("Segoe UI", 12, "bold"))
        self.chat_title.grid(row=0, column=0, columnspan=2, sticky="w", pady=(0, 4))

        self.text = tk.Text(right, state="disabled", wrap="word", padx=8, pady=8,
                            font=("Segoe UI", 11), bg="#F8FAFC", relief="flat",
                            borderwidth=1, highlightthickness=1,
                            highlightbackground="#E5E7EB")
        scroll = ttk.Scrollbar(right, command=self.text.yview)
        self.text.configure(yscrollcommand=scroll.set)
        self.text.grid(row=1, column=0, sticky="nsew")
        scroll.grid(row=1, column=1, sticky="ns")
        self.text.tag_configure("me", justify="right", foreground="#1D4ED8")
        self.text.tag_configure("them", justify="left", foreground="#111827")
        self.text.tag_configure("meta", foreground="#6B7280", font=("Segoe UI", 8))

        bottom = ttk.Frame(right)
        bottom.grid(row=2, column=0, columnspan=2, sticky="ew", pady=(6, 0))
        bottom.columnconfigure(0, weight=1)
        entry = ttk.Entry(bottom, textvariable=self.entry_var)
        entry.grid(row=0, column=0, sticky="ew", padx=(0, 6))
        entry.bind("<Return>", self.send_message)
        ttk.Button(bottom, text="Send", command=self.send_message).grid(row=0, column=1)

    def load_users(self):
        try:
            r = requests.get(f"{API_URL}/api/users", timeout=5)
            self.users = [u for u in r.json() if u["id"] != self.me["id"]]
        except (requests.RequestException, ValueError):
            messagebox.showerror("Error", "Could not load the user list")
            self.users = []
        self.refresh_user_list()

    def refresh_user_list(self):
        self.user_list.delete(0, "end")
        for index, u in enumerate(self.users):
            dot = "\u25CF" if u["id"] in self.online else "\u25CB"   # filled / empty circle
            new = "   (new)" if u["id"] in self.unread else ""
            self.user_list.insert("end", f"{dot}  {u['username']}{new}")
            if u["id"] == self.selected_id:
                self.user_list.selection_set(index)

    def username_of(self, user_id):
        for u in self.users:
            if u["id"] == user_id:
                return u["username"]
        return "?"

    def on_select_user(self, event=None):
        selection = self.user_list.curselection()
        if not selection:
            return
        user = self.users[selection[0]]
        self.selected_id = user["id"]
        self.unread.discard(user["id"])
        self.chat_title.config(text=user["username"])
        self.refresh_user_list()
        self.load_history(user)

    def load_history(self, user):
        self.text.configure(state="normal")
        self.text.delete("1.0", "end")
        self.text.configure(state="disabled")
        try:
            r = requests.get(f"{API_URL}/api/messages/{self.me['id']}/{user['id']}",
                             params={"size": 1000}, timeout=5)
            messages = r.json()["messages"]
        except (requests.RequestException, ValueError, KeyError):
            messagebox.showerror("Error", "Could not load chat history")
            return
        for m in messages:
            mine = m["sender_id"] == self.me["id"]
            self.append_message("You" if mine else user["username"],
                                m["text"], m["timestamp"], mine)

    def append_message(self, name, text, ts, mine):
        tag = "me" if mine else "them"
        self.text.configure(state="normal")
        self.text.insert("end", f"{name}  {format_time(ts)}\n", (tag, "meta"))
        self.text.insert("end", f"{text}\n\n", tag)
        self.text.configure(state="disabled")
        self.text.see("end")

    def send_message(self, event=None):
        text = self.entry_var.get().strip()
        if not text:
            return
        if self.selected_id is None:
            messagebox.showinfo("Chat", "Pick a contact first")
            return
        if self.sio is None or not self.sio.connected:
            messagebox.showwarning("Chat", "Not connected to the server")
            return
        self.sio.emit("private message", {
            "sender_id": self.me["id"],
            "receiver_id": self.selected_id,
            "text": text,
        })
        self.entry_var.set("")

    # ------------------------------------------------------------ socket thread
    def connect_socket(self):
        sio = socketio.Client()
        self.sio = sio

        # These handlers run in the socket's background thread, so they only
        # put events into the queue. The GUI thread reads the queue below.
        @sio.on("connect")
        def on_connect():
            sio.emit("join", {"user_id": self.me["id"]})

        @sio.on("private message")
        def on_private_message(data):
            self.events.put(("message", data))

        @sio.on("presence")
        def on_presence(data):
            self.events.put(("presence", data["online"]))

        @sio.on("error message")
        def on_error(data):
            self.events.put(("error", data["error"]))

        try:
            sio.connect(API_URL)
        except socketio.exceptions.ConnectionError:
            messagebox.showerror("Error", "Could not connect to the chat server")
            self.sio = None

    def process_events(self):
        """Runs in the GUI thread every 100 ms and drains the queue."""
        try:
            while True:
                kind, payload = self.events.get_nowait()
                if self.me is None:
                    continue                      # logged out meanwhile
                if kind == "presence":
                    self.online = set(payload)
                    self.refresh_user_list()
                elif kind == "message":
                    self.handle_message(payload)
                elif kind == "error":
                    messagebox.showwarning("Error", payload)
        except queue.Empty:
            pass
        self.root.after(100, self.process_events)

    def handle_message(self, m):
        mine = m["sender_id"] == self.me["id"]
        other_id = m["receiver_id"] if mine else m["sender_id"]
        if other_id == self.selected_id:
            name = "You" if mine else self.username_of(other_id)
            self.append_message(name, m["text"], m["timestamp"], mine)
        elif not mine:
            self.unread.add(other_id)
            self.refresh_user_list()

    # ------------------------------------------------------------ logout / exit
    def disconnect_socket(self):
        if self.sio is not None:
            try:
                self.sio.disconnect()
            except Exception:
                pass
            self.sio = None

    def logout(self):
        self.disconnect_socket()
        self.chat_frame.destroy()
        self.me = None
        self.users, self.online, self.unread = [], set(), set()
        self.selected_id = None
        self.password_var.set("")
        self.build_login()

    def on_close(self):
        self.disconnect_socket()
        self.root.destroy()


if __name__ == "__main__":
    root = tk.Tk()
    ChatClient(root)
    root.mainloop()