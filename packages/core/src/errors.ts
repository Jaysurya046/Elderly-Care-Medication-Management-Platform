export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = true;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 400 Bad Request - Malformed request or domain validation failure */
export class ValidationError extends AppError {
  constructor(message: string = 'Validation failed.') {
    super(message, 400);
  }
}

/** 401 Unauthorized - Authentication credentials missing or invalid */
export class AuthError extends AppError {
  constructor(message: string = 'Authentication required or invalid credentials.') {
    super(message, 401);
  }
}

/** 403 Forbidden - Caller authenticated but not authorized for resource/scope */
export class ForbiddenError extends AppError {
  constructor(message: string = 'You do not have permission to access this resource.') {
    super(message, 403);
  }
}

/** 404 Not Found - Requested entity does not exist */
export class NotFoundError extends AppError {
  constructor(message: string = 'The requested resource was not found.') {
    super(message, 404);
  }
}

/** 409 Conflict - Resource state conflict (e.g. duplicate email, concurrent dose mutation) */
export class ConflictError extends AppError {
  constructor(message: string = 'Resource conflict or concurrent modification.') {
    super(message, 409);
  }
}

/** 422 Unprocessable Entity - Semantic error in request payload */
export class UnprocessableEntityError extends AppError {
  constructor(message: string = 'Unprocessable entity.') {
    super(message, 422);
  }
}

/** 429 Too Many Requests - Rate limit exceeded */
export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests. Please slow down and try again later.') {
    super(message, 429);
  }
}

/** 503 Service Unavailable - Critical downstream service down (e.g. Redis in production) */
export class ServiceUnavailableError extends AppError {
  constructor(message: string = 'Service temporarily unavailable. Please try again later.') {
    super(message, 503);
  }
}
