import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const rawHeader = req.headers['x-api-key'] || req.headers['authorization'];
  let key: string | undefined;

  if (typeof rawHeader === 'string') {
    if (rawHeader.startsWith('Bearer ')) {
      key = rawHeader.slice(7).trim();
    } else {
      key = rawHeader.trim();
    }
  } else if (typeof req.query.api_key === 'string') {
    key = req.query.api_key.trim();
  }

  if (!key) {
    return res.status(401).json({
      success: false,
      error: 'Autentikasi API gagal: Header "x-api-key" atau "Authorization: Bearer <key>" diperlukan.'
    });
  }

  if (key !== config.apiKey) {
    return res.status(403).json({
      success: false,
      error: 'Autentikasi API gagal: Kunci API (API Key) tidak valid.'
    });
  }

  return next();
}
