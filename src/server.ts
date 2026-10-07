import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server as SocketServer } from 'socket.io';
import { authRouter } from './api/auth';
import { conversationRouter } from './api/conversations';
import { campaignRouter } from './api/campaigns';
import { reportRouter } from './api/reports';
import { accountRouter } from './api/accounts';
import { contactRouter } from './api/contacts';
import { botRuleRouter } from './api/bot-rules';
import { gatewayRouter } from './api/gateway';
import { sessionEvents } from './whatsapp/session-manager';
import { requireAuth, requireRole } from './middleware/auth';

export function createServer() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const server = http.createServer(app);
  const io = new SocketServer(server, {
    cors: { origin: '*' }
  });

  // REST API Routes
  app.use('/api/auth', authRouter);

  // External Integration Gateway API (Protected by API Key)
  app.use('/api/v1', gatewayRouter);

  // Protected routes (Admin & Agent)
  app.use('/api/conversations', requireAuth, conversationRouter);
  app.use('/api/contacts', requireAuth, contactRouter);

  // Admin-only routes
  app.use('/api/accounts', requireAuth, requireRole(['ADMIN']), accountRouter);
  app.use('/api/bot-rules', requireAuth, requireRole(['ADMIN']), botRuleRouter);
  app.use('/api/campaigns', requireAuth, requireRole(['ADMIN']), campaignRouter);
  app.use('/api/reports', requireAuth, requireRole(['ADMIN']), reportRouter);

  app.use(express.static('public'));

  // Wire Baileys Events to Socket.IO
  sessionEvents.on('qr', (data) => io.emit('wa:qr', data));
  sessionEvents.on('connected', (data) => io.emit('wa:connected', data));
  sessionEvents.on('banned', (data) => io.emit('wa:banned', data));
  sessionEvents.on('message:inbound', (data) => io.emit('chat:inbound', data));
  sessionEvents.on('contacts:synced', (data) => io.emit('contacts:synced', data));

  io.on('connection', (socket) => {
    // Client connected to realtime dashboard
    socket.on('disconnect', () => {});
  });

  return { app, server, io };
}
