// services/cdsbot/src/utils/errors.js

export function createHttpError (status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function createErrorHandler (opts) {
  return async (ctx, next) => {
    try {
      await next();
    } catch (err) {
      ctx.response.status = err.status || 500;
      ctx.response.body = { error: err.message };
      console.error(`Error processing request. ${err.message}`);
    }
  };
}
