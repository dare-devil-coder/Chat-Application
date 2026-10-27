class User:
    role = "user"

    def __init__(self, id, username, created_at=None):
        self.id = id
        self.username = username
        self.created_at = created_at

    def can_delete_any_message(self):
        return False

    def to_dict(self):
        return {"id": self.id, "username": self.username, "role": self.role}

    def __str__(self):
        return f"{self.username} ({self.role})"

    def __eq__(self, other):
        return isinstance(other, User) and self.id == other.id

    def __hash__(self):
        return hash(self.id)

    @staticmethod
    def from_row(row):
        cls = AdminUser if row["role"] == "admin" else User
        return cls(row["id"], row["username"], row["created_at"])


class AdminUser(User):
    role = "admin"

    def can_delete_any_message(self):   # method overriding
        return True


class Message:
    def __init__(self, id, sender_id, receiver_id, text, timestamp, attachment=None, expires_at=None):
        self.id = id
        self.sender_id = sender_id
        self.receiver_id = receiver_id
        self.text = text
        self.timestamp = timestamp
        self.attachment = attachment      # None, or {url, name, kind, size}
        self.expires_at = expires_at      # None, or UTC 'YYYY-MM-DD HH:MM:SS'

    def to_dict(self):
        return {
            "id": self.id,
            "sender_id": self.sender_id,
            "receiver_id": self.receiver_id,
            "text": self.text,
            "timestamp": self.timestamp,
            "attachment": self.attachment,
            "expires_at": self.expires_at,
        }

    def __str__(self):
        extra = f" [{self.attachment['kind']}: {self.attachment['name']}]" if self.attachment else ""
        return f"[{self.timestamp}] {self.sender_id} -> {self.receiver_id}: {self.text}{extra}"

    @staticmethod
    def from_row(row):
        attachment = None
        if row["attachment_url"]:
            attachment = {
                "url": row["attachment_url"],
                "name": row["attachment_name"],
                "kind": row["attachment_kind"],
                "size": row["attachment_size"],
            }
        return Message(row["id"], row["sender_id"], row["receiver_id"],
                       row["text"], row["timestamp"], attachment, row["expires_at"])


class ScheduledMessage:
    def __init__(self, id, sender_id, receiver_id, text, send_at, status):
        self.id = id
        self.sender_id = sender_id
        self.receiver_id = receiver_id
        self.text = text
        self.send_at = send_at          # UTC, 'YYYY-MM-DD HH:MM:SS'
        self.status = status            # pending / sent / failed / cancelled

    def to_dict(self):
        return {
            "id": self.id,
            "sender_id": self.sender_id,
            "receiver_id": self.receiver_id,
            "text": self.text,
            "send_at": self.send_at,
            "status": self.status,
        }

    def __str__(self):
        return f"[{self.status}] {self.sender_id} -> {self.receiver_id} at {self.send_at}: {self.text}"

    @staticmethod
    def from_row(row):
        return ScheduledMessage(row["id"], row["sender_id"], row["receiver_id"],
                                row["text"], row["send_at"], row["status"])