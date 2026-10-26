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
    def __init__(self, id, sender_id, receiver_id, text, timestamp):
        self.id = id
        self.sender_id = sender_id
        self.receiver_id = receiver_id
        self.text = text
        self.timestamp = timestamp

    def to_dict(self):
        return {
            "id": self.id,
            "sender_id": self.sender_id,
            "receiver_id": self.receiver_id,
            "text": self.text,
            "timestamp": self.timestamp,
        }

    def __str__(self):
        return f"[{self.timestamp}] {self.sender_id} -> {self.receiver_id}: {self.text}"

    @staticmethod
    def from_row(row):
        return Message(row["id"], row["sender_id"], row["receiver_id"],
                       row["text"], row["timestamp"])