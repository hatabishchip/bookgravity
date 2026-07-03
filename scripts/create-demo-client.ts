// Create (or reset) a CLIENT demo account for Google Play / App Store review.
// Run: node_modules/.bin/tsx scripts/create-demo-client.ts <email> <password> <studio-slug>
// Idempotent: updates an existing user's password + role + studio instead of failing.
import "dotenv/config"
import bcrypt from "bcryptjs"
import { prisma } from "../lib/prisma"

async function main() {
  const [email, password, slug] = process.argv.slice(2)
  if (!email || !password || !slug) {
    console.error("Usage: create-demo-client.ts <email> <password> <studio-slug>")
    process.exit(1)
  }
  const studio = await prisma.studio.findFirst({ where: { slug }, select: { id: true, name: true } })
  if (!studio) {
    console.error(`Studio not found: slug=${slug}`)
    process.exit(1)
  }
  const hashed = await bcrypt.hash(password, 10)
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } })
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { password: hashed, initialPassword: password, role: "CLIENT", studioId: studio.id },
    })
    console.log(`Updated existing user -> CLIENT · ${email} · ${studio.name}`)
  } else {
    await prisma.user.create({
      data: { email, password: hashed, initialPassword: password, role: "CLIENT", studioId: studio.id },
    })
    console.log(`Created CLIENT · ${email} · ${studio.name}`)
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
