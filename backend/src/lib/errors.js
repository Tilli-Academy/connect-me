// Typed application errors. Services throw these; the centralized error handler
// (plugins/errorHandler.js) maps statusCode/code to the { error: { code, message } } response.
export class AppError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const BadRequest = (message, code = 'BAD_REQUEST') => new AppError(400, code, message);
export const Unauthorized = (message, code = 'UNAUTHORIZED') => new AppError(401, code, message);
export const Forbidden = (message, code = 'FORBIDDEN') => new AppError(403, code, message);
export const NotFound = (message, code = 'NOT_FOUND') => new AppError(404, code, message);
export const Conflict = (message, code = 'CONFLICT') => new AppError(409, code, message);
