/**
 * Unified error handler — all errors return { success, message, code }
 */
const errorHandler = (err, req, res, next) => {
  const status = err.statusCode || err.status || 500;

  // Only log 500+ errors to avoid cluttering the console with expected 4xx errors
  if (status >= 500) {
    console.error('❌ Internal Server Error:', err.message);
    if (process.env.NODE_ENV === 'development') {
      console.error(err.stack);
    }
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({
      success: false,
      message: messages.join('. '),
      code: 'VALIDATION_ERROR',
    });
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(409).json({
      success: false,
      message: `${field} already exists.`,
      code: 'DUPLICATE_KEY',
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token.',
      code: 'INVALID_TOKEN',
    });
  }

  // Default
  return res.status(status).json({
    success: false,
    message: err.message || 'Internal server error',
    code: err.code || 'INTERNAL_ERROR',
  });
};

/**
 * Helper to create app errors with status codes
 */
const createError = (message, statusCode = 500, code = 'INTERNAL_ERROR') => {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
};

module.exports = { errorHandler, createError };
