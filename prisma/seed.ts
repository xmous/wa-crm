import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding initial data...');

  const passwordHash = await bcrypt.hash('password123', 10);

  // 1. Seed Admin
  const admin = await prisma.user.upsert({
    where: { email: 'admin@wa-crm.io' },
    update: {},
    create: {
      email: 'admin@wa-crm.io',
      name: 'Admin Utama',
      passwordHash,
      role: 'ADMIN'
    }
  });

  // 2. Seed Customer Service Agents
  const agent1 = await prisma.user.upsert({
    where: { email: 'siti@wa-crm.io' },
    update: {},
    create: {
      email: 'siti@wa-crm.io',
      name: 'Siti Nurhaliza',
      passwordHash,
      role: 'AGENT'
    }
  });

  const agent2 = await prisma.user.upsert({
    where: { email: 'budi@wa-crm.io' },
    update: {},
    create: {
      email: 'budi@wa-crm.io',
      name: 'Budi Santoso',
      passwordHash,
      role: 'AGENT'
    }
  });

  // 3. Seed Default Bot Rules
  const botRules = [
    {
      triggerType: 'EXACT',
      keyword: 'halo',
      replyText: 'Halo! Selamat datang di layanan kami. Ketik *MENU* untuk melihat opsi layanan.',
      action: 'REPLY',
      priority: 10
    },
    {
      triggerType: 'EXACT',
      keyword: 'menu',
      replyText: '📋 *Menu Layanan Kami*:\n1. Info Produk & Katalog\n2. Cek Status Order\n3. Bantuan Staf CS\n\n_Balas dengan mengetik angka (1/2/3)._',
      action: 'REPLY',
      priority: 10
    },
    {
      triggerType: 'CONTAINS',
      keyword: 'harga',
      replyText: '💰 Info harga & paket promo terbaru dapat dilihat dengan mengetik *1* atau kunjungi website kami.',
      action: 'REPLY',
      priority: 5
    },
    {
      triggerType: 'NUMERIC_MENU',
      keyword: '1',
      replyText: '📦 *Katalog Produk*: Tersedia Paket Starter, Regular, dan Enterprise. Mau konsultasi paket yang mana kak?',
      action: 'REPLY',
      priority: 8
    },
    {
      triggerType: 'NUMERIC_MENU',
      keyword: '3',
      replyText: '👨‍💼 Sedang menghubungkan Anda ke Customer Service kami. Mohon tunggu sebentar, staf kami akan segera membalas...',
      action: 'HANDOVER_AGENT',
      priority: 9
    }
  ];

  for (const rule of botRules) {
    const existing = await prisma.botRule.findFirst({
      where: { keyword: rule.keyword, triggerType: rule.triggerType }
    });
    if (!existing) {
      await prisma.botRule.create({ data: rule });
    }
  }

  console.log('✅ Seed completed successfully!');
  console.log('Admin:', admin.email);
  console.log('Agents:', agent1.name, ',', agent2.name);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
