import 'dotenv/config'
import { prisma } from '../config/database'

/**
 * One-time, idempotent backfill for product media:
 *  - existing rows are marked IMAGE,
 *  - each product gets exactly one primary (its first image by sortOrder).
 *
 * Safe to run repeatedly.
 */
async function main(): Promise<void> {
  console.log('[backfill] marking existing product media as IMAGE…')
  const images = await prisma.productImage.updateMany({
    where: { mediaType: '' },
    data: { mediaType: 'IMAGE' },
  })
  console.log(`[backfill] mediaType fixed for ${images.count} rows`)

  const products = await prisma.product.findMany({ select: { id: true } })
  let primaries = 0
  for (const product of products) {
    const hasPrimary = await prisma.productImage.count({
      where: { productId: product.id, isPrimary: true },
    })
    if (hasPrimary > 0) continue
    const first = await prisma.productImage.findFirst({
      where: { productId: product.id },
      orderBy: { sortOrder: 'asc' },
      select: { id: true },
    })
    if (!first) continue
    await prisma.productImage.update({
      where: { id: first.id },
      data: { isPrimary: true },
    })
    primaries += 1
  }

  console.log(`[backfill] primary media set for ${primaries} products`)
}

main()
  .catch((error) => {
    console.error('[backfill] failed:', error)
    process.exitCode = 1
  })
  .finally(() => {
    void prisma.$disconnect()
  })
