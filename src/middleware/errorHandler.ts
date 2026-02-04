import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';

interface ErrorWithStatus extends Error {
  statusCode?: number;
}

export function errorHandler(
  err: ErrorWithStatus,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode ?? 500;
  let message = 'Something went wrong.';

  if (err instanceof mongoose.Error.ValidationError) {
    const fieldMessages = Object.values(err.errors).map((e) => e.message);
    res.status(400).json({ success: false, error: fieldMessages.join(' ') });
    return;
  }

  if (err.name === 'CastError') {
    res.status(400).json({ success: false, error: 'Invalid ID.' });
    return;
  }

  if ((err as { code?: number }).code === 11000) {
    res.status(409).json({ success: false, error: 'A user with this email already exists.' });
    return;
  }

  if (err.message && statusCode < 500) {
    message = err.message;
  }

  console.error('[errorHandler]', err.name, err.message, err.stack);
  res.status(statusCode).json({ success: false, error: message });
}
