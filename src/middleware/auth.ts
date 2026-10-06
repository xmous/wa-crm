import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface AuthUserPayload {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'AGENT';
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUserPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Akses ditolak: Token autentikasi diperlukan.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as AuthUserPayload;
    req.user = decoded;
    return next();
  } catch (err: any) {
    return res.status(401).json({ success: false, error: 'Sesi telah kedaluwarsa atau token tidak valid.' });
  }
}

export function requireRole(allowedRoles: ('ADMIN' | 'AGENT')[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Autentikasi diperlukan.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Akses ditolak: Anda tidak memiliki izin untuk fitur ini.' });
    }
    return next();
  };
}
