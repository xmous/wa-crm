import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/waweb?schema=public',
  jwtSecret: process.env.JWT_SECRET || 'super-secret-jwt-key-for-crm',
  apiKey: process.env.API_KEY || 'wa-crm-secret-api-key-2026',
  antiBan: {
    minDelayMs: parseInt(process.env.ANTI_BAN_MIN_DELAY || '8000', 10),
    maxDelayMs: parseInt(process.env.ANTI_BAN_MAX_DELAY || '22000', 10),
    batchCooldownSize: parseInt(process.env.ANTI_BAN_BATCH_SIZE || '20', 10),
    batchCooldownMs: parseInt(process.env.ANTI_BAN_COOLDOWN_MS || '60000', 10)
  }
};
