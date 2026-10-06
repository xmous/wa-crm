import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server as SocketServer } from 'socket.io';
import { authRouter } from './api/auth';
import { conversationRouter } from './api/conversations';
import { campaignRouter } from './api/campaigns';
import { reportRouter } from './api/reports';
import { accountRouter } from './api/accounts';
import { sessionEvents } from './whatsapp/session-manager';

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
  app.use('/api/conversations', conversationRouter);
  app.use('/api/campaigns', campaignRouter);
  app.use('/api/reports', reportRouter);
  app.use('/api/accounts', accountRouter);
  app.use(express.static('public'));

  // Wire Baileys Events to Socket.IO
  sessionEvents.on('qr', (data) => io.emit('wa:qr', data));
  sessionEvents.on('connected', (data) => io.emit('wa:connected', data));
  sessionEvents.on('banned', (data) => io.emit('wa:banned', data));

  io.on('connection', (socket) => {
    // Client connected to realtime dashboard
    socket.on('disconnect', () => {});
  });

  return { app, server, io };
}
