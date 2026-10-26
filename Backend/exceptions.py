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