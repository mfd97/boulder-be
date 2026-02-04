/// <reference path="../types/express.d.ts" />
import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/token';
import mongoose from 'mongoose';

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: 'Access denied. No token provided.' });
      return;
    }

    const token = authHeader.slice(7);
    const payload = verifyToken(token);

    req.user = {
      _id: new mongoose.Types.ObjectId(payload.userId),
      email: payload.email,
    };
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired token.' });
  }
}
