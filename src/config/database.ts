import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    // The default interactive-transaction budget is 5s (maxWait 2s). On this
    // database a multi-statement payment update can exceed it and fail with
    // P2028 mid-flight, so give transactions room to commit.
    transactionOptions: {
      maxWait: 5000,
      timeout: 20000,
    },
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

export async function connectDatabase(): Promise<void> {
  await prisma.$connect()
}

export async function closeDatabase(): Promise<void> {
  await prisma.$disconnect()
}

export default prisma