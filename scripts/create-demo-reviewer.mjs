import { PrismaClient } from '@prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import bcrypt from 'bcryptjs'
import { config } from 'dotenv'
config({ path: '/Users/oleksandrdiachuk/Documents/Claude/bookgravity/.env' })

const adapter = new PrismaLibSql({ url: process.env.DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN })
const prisma = new PrismaClient({ adapter })

const EMAIL = 'demo-reviewer@bookgravity.com'
const PASSWORD = 'GravityReview2026!'

try {
  const studios = await prisma.studio.findMany({ select: { id: true, slug: true, name: true } })
  console.log('Studios:', studios.map(s => s.slug).join(', '))
  const canggu = studios.find(s => s.slug === 'canggu')
  if (!canggu) { console.error('No canggu studio'); process.exit(1) }

  const existing = await prisma.user.findUnique({ where: { email: EMAIL }, include: { trainer: true } })
  const hashed = await bcrypt.hash(PASSWORD, 10)
  if (existing) {
    await prisma.user.update({
      where: { email: EMAIL },
      data: { password: hashed, role: 'TRAINER', studioId: canggu.id, initialPassword: PASSWORD },
    })
    if (!existing.trainer) {
      await prisma.trainer.create({ data: { name: 'Apple Reviewer (Demo)', whatsapp: '', studioId: canggu.id, userId: existing.id, notifyEmail: false, notifyWhatsapp: false, archived: false } })
    } else if (existing.trainer.archived) {
      await prisma.trainer.update({ where: { id: existing.trainer.id }, data: { archived: false, studioId: canggu.id } })
    }
    console.log('Updated', EMAIL)
  } else {
    const user = await prisma.user.create({
      data: {
        email: EMAIL,
        password: hashed,
        role: 'TRAINER',
        initialPassword: PASSWORD,
        studioId: canggu.id,
        trainer: { create: { name: 'Apple Reviewer (Demo)', whatsapp: '', studioId: canggu.id, notifyEmail: false, notifyWhatsapp: false, archived: false } },
      },
      include: { trainer: true },
    })
    console.log('Created user', user.email, 'trainer', user.trainer?.id, 'studio', canggu.name)
  }
} finally {
  await prisma.$disconnect()
}
