import { describe, it, expect } from 'vitest';
import express from 'express';
import { conversationRouter } from '../src/api/conversations';
import { authRouter } from '../src/api/auth';
import { campaignRouter } from '../src/api/campaigns';

describe('API Routers', () => {
  it('should register conversation routes', () => {
    const app = express();
    app.use('/api/conversations', conversationRouter);
    app.use('/api/auth', authRouter);
    app.use('/api/campaigns', campaignRouter);
    expect(conversationRouter.stack.length).toBeGreaterThan(0);
    expect(authRouter.stack.length).toBeGreaterThan(0);
    expect(campaignRouter.stack.length).toBeGreaterThan(0);
  });
});
