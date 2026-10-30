class ChatError(Exception):
    status_code = 400


class InvalidInputError(ChatError):
    status_code = 400


class UserAlreadyExistsError(ChatError):
    status_code = 409


class UserNotFoundError(ChatError):
    status_code = 404


class InvalidCredentialsError(ChatError):
    status_code = 401


class InvalidMessageError(ChatError):
    status_code = 400


class UnsupportedFileError(ChatError):
    status_code = 415


class AttachmentNotFoundError(ChatError):
    status_code = 404


class ScheduledNotFoundError(ChatError):
    status_code = 404


class RuleNotFoundError(ChatError):
    status_code = 404


class FileTooLargeError(ChatError):
    status_code = 413


class LinkExpiredError(ChatError):
    status_code = 410


class UploadNotFoundError(ChatError):
    status_code = 404


class AIUnavailableError(ChatError):
    status_code = 503


class RateLimitError(ChatError):
    status_code = 429