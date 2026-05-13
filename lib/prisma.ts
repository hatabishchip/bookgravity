import { PrismaClient } from "@prisma/client"
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
  const url = resolveDbUrl()
  const authToken = process.env.TURSO_AUTH_TOKEN
  const adapter = new PrismaLibSql({ url, ...(authToken ? { authToken } : {}) })
  return new PrismaClient({ adapter })
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

// Reuse the same client across hot reloads in dev AND across serverless invocations in prod
globalForPrisma.prisma = prisma
