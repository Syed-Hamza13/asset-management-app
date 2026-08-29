export class AppError extends Error {
  constructor(status, code, message, fields = undefined) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
