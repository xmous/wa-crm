import { describe, it, expect } from 'vitest';
import { prisma } from '../src/database/client';

describe('Prisma Client Initialization', () => {
  it('should export an initialized prisma client instance', () => {
    expect(prisma).toBeDefined();
    expect(prisma.user).toBeDefined();
    expect(prisma.whatsappAccount).toBeDefined();
    expect(prisma.message).toBeDefined();
    expect(prisma.contact).toBeDefined();
    expect(prisma.conversation).toBeDefined();
    expect(prisma.botRule).toBeDefined();
    expect(prisma.broadcastCampaign).toBeDefined();
    expect(prisma.broadcastQueue).toBeDefined();
  });
});
