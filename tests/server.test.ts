import { describe, it, expect } from 'vitest';
import { createServer } from '../src/server';

describe('Server Setup', () => {
  it('should initialize express app and socket server', () => {
    const { app, io } = createServer();
    expect(app).toBeDefined();
    expect(io).toBeDefined();
  });
});
