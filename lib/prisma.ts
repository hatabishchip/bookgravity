import { PrismaClient } from "@/app/generated/prisma"
import { PrismaLibSql } from "@prisma/adapter-libsql"
import path from "path"

function resolveDbUrl() {
  const raw = process.env.DATABASE_URL ?? "file:./dev.db"
  if (raw.startsWith("file:")) {
    const rel = raw.slice(5)
    return `file:${path.resolve(process.cwd(), rel)}`
  }
  return raw
}

function createPrismaClient() {
  const adapter = new PrismaLibSql({ url: resolveDbUrl() })
  return new PrismaClient({ adapter })
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
