import { PrismaClient } from '@prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import { config } from 'dotenv'
config({ path: '/Users/oleksandrdiachuk/Documents/Claude/bookgravity/.env' })
const adapter = new PrismaLibSql({ url: process.env.DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN })
const prisma = new PrismaClient({ adapter })
const studios = await prisma.studio.findMany({ select: { id: true, slug: true, name: true, trainers: { where: { archived: false }, select: { name: true } } } })
console.log(JSON.stringify(studios, null, 2))
await prisma.$disconnect()
