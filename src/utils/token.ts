import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-me';
// 7 days in seconds (jwt SignOptions expiresIn accepts number = seconds)
const JWT_EXPIRES_SECONDS = 7 * 24 * 60 * 60;

export interface ITokenPayload {
  userId: string;
  email: string;
}

export function generateToken(userId: Types.ObjectId, email: string): string {
  return jwt.sign(
    { userId: userId.toString(), email } as ITokenPayload,
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_SECONDS }
  );
}

export function verifyToken(token: string): ITokenPayload {
  const decoded = jwt.verify(token, JWT_SECRET) as ITokenPayload;
  return decoded;
}
