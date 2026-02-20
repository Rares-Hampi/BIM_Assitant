/**
 * Global error handling middleware
 * Should be registered last in Express app
 */

/**
 * Custom error class for application errors
 */
class AppError extends Error {
  constructor(message, statusCode, errors = []) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = true; // Distinguish operational errors from programming errors
    
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Handle Prisma errors
 */
const handlePrismaError = (error) => {
  console.error('Prisma error:', error);
  
  // P2002: Unique constraint violation
  if (error.code === 'P2002') {
    const field = error.meta?.target?.[0] || 'field';
    return new AppError(`${field} already exists`, 409);
  }
  
  // P2025: Record not found
  if (error.code === 'P2025') {
    return new AppError('Record not found', 404);
  }
  
  // P2003: Foreign key constraint violation
  if (error.code === 'P2003') {
    return new AppError('Referenced record does not exist', 400);
  }
  
  // P2014: Invalid relation
  if (error.code === 'P2014') {
    return new AppError('Invalid relation in query', 400);
  }
  
  // Default Prisma error
  return new AppError('Database operation failed', 500);
};

/**
 * Handle JWT errors
 */
const handleJWTError = () => {
  return new AppError('Invalid token. Please login again.', 401);
};

const handleJWTExpiredError = () => {
  return new AppError('Token expired. Please login again.', 401);
};

/**
 * Development error response (with stack trace)
 */
const sendErrorDev = (err, res) => {
  res.status(err.statusCode || 500).json({
    success: false,
    error: {
      message: err.message,
      statusCode: err.statusCode,
      errors: err.errors,
      stack: err.stack
    }
  });
};

/**
 * Production error response (no stack trace)
 */
const sendErrorProd = (err, res) => {
  // Operational errors: send to client
  if (err.isOperational) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      errors: err.errors
    });
  } else {
    // Programming errors: don't leak details
    console.error('UNEXPECTED ERROR:', err);
    
    res.status(500).json({
      success: false,
      message: 'Something went wrong on the server'
    });
  }
};

/**
 * Global error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;
  error.statusCode = err.statusCode || 500;
  
  // Log error details
  console.error('[ERROR]', {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
  
  // Handle specific error types
  if (err.name === 'PrismaClientKnownRequestError') {
    error = handlePrismaError(err);
  }
  
  if (err.name === 'PrismaClientValidationError') {
    error = new AppError('Invalid data provided', 400);
  }
  
  if (err.name === 'JsonWebTokenError') {
    error = handleJWTError();
  }
  
  if (err.name === 'TokenExpiredError') {
    error = handleJWTExpiredError();
  }
  
  // Send appropriate error response
  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(error, res);
  } else {
    sendErrorProd(error, res);
  }
};

/**
 * Catch async errors wrapper
 * Wraps async route handlers to catch errors automatically
 */
const catchAsync = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * 404 Not Found handler
 */
const notFound = (req, res, next) => {
  const error = new AppError(
    `Route ${req.method} ${req.originalUrl} not found`,
    404
  );
  next(error);
};

module.exports = {
  AppError,
  errorHandler,
  catchAsync,
  notFound
};
