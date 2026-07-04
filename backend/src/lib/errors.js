// Error code definitions and throwApiError helper for K0 backend
// All route handlers use throwApiError for consistent { error: { code, message, details } } envelope

export const ErrorCode = {
  // Auth
  MISSING_AUTH: 'MISSING_AUTH',
  INVALID_AUTH_SCHEME: 'INVALID_AUTH_SCHEME',
  INVALID_TOKEN: 'INVALID_TOKEN',
  // Import
  INVALID_URL: 'INVALID_URL',
  SOURCE_NOT_SUPPORTED: 'SOURCE_NOT_SUPPORTED',
  YOUTUBE_MANUAL_ONLY: 'YOUTUBE_MANUAL_ONLY',
  SOURCE_UNREACHABLE: 'SOURCE_UNREACHABLE',
  // Episodes
  EPISODE_NOT_FOUND: 'EPISODE_NOT_FOUND',
  NO_TRANSCRIPT: 'NO_TRANSCRIPT',
  // GLM
  GLM_TIMEOUT: 'GLM_TIMEOUT',
  GLM_MALFORMED_JSON: 'GLM_MALFORMED_JSON',
  // Generic
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
};

/**
 * Create a structured API error object.
 * Attach to thrown Error as err.apiError = { code, message, details }
 * Route handlers catch these and respond with the correct HTTP status.
 */
export function throwApiError(code, message, details, httpStatus = 400) {
  const err = new Error(message);
  err.apiError = { code, message, details };
  err.status = httpStatus;
  throw err;
}

/**
 * Express error handler middleware — responds with the contract envelope.
 * Must be registered LAST in app.use() chain.
 */
export function apiErrorHandler(err, req, res, next) {
  if (err.apiError) {
    const { code, message, details } = err.apiError;
    const body = { error: { code, message } };
    if (details !== undefined) body.error.details = details;
    return res.status(err.status || 400).json(body);
  }
  // Fallback for unexpected errors
  const status = err.status || err.statusCode || 500;
  return res.status(status).json({
    error: {
      code: ErrorCode.INTERNAL_ERROR,
      message: err.message || 'Internal server error',
    },
  });
}
