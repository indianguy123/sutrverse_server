import { PrismaClient } from '@prisma/client';

// Pooled client - for regular queries (uses PgBouncer)
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaTransaction: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: { url: process.env.DATABASE_URL },
    },
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

// Direct client - for advisory locks and transactions (bypasses PgBouncer)
export const prismaTransaction =
  globalForPrisma.prismaTransaction ??
  new PrismaClient({
    datasources: {
      db: { url: process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL },
    },
    log: ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaTransaction = prismaTransaction;
}
