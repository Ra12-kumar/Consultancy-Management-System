// An error that is safe to show to the client: an HTTP status, a stable code and a plain message.
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: Array<{ field: string; message: string }>;

  constructor(statusCode: number, code: string, message: string, details?: Array<{ field: string; message: string }>) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  static badRequest(message = 'Bad request') {
    return new ApiError(400, 'BAD_REQUEST', message);
  }
  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, 'UNAUTHORIZED', message);
  }
  static forbidden(message = 'You do not have permission to do this') {
    return new ApiError(403, 'FORBIDDEN', message);
  }
  static notFound(message = 'Not found') {
    return new ApiError(404, 'NOT_FOUND', message);
  }
  static conflict(message = 'Conflict') {
    return new ApiError(409, 'CONFLICT', message);
  }
}
