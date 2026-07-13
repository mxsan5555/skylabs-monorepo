import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../env';
import type { UserRole } from '../generated/prisma';

export interface JwtPayload {
  sub: string;
  roles: UserRole[];
}

export function signAccessToken(payload: JwtPayload): string {
  const options: SignOptions = { expiresIn: env.jwtExpiresIn as SignOptions['expiresIn'] };
  return jwt.sign(payload, env.jwtSecret, options);
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, env.jwtSecret) as JwtPayload;
}
