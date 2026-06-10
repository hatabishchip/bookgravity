// Create (or reset) a STAFF user for a given studio. Run with:
//   node_modules/.bin/tsx scripts/create-staff.ts <email> <password> <studio-slug>
//
// STAFF users have a read-only schedule view at /staff — designed for the
// cleaning crew to see when the room is free. The script is idempotent: if a
// user with this email already exists, it updates their password + role +
// studio rather than failing.
import "dotenv/config"
import bcrypt from "bcryptjs"
import { prisma } from "../lib/prisma"

async function main() {
  const [email, password, slug] = process.argv.slice(2)
  if (!email || !password || !slug) {
    console.error("Usage: create-staff.ts <email> <password> <studio-slug>")
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
      data: { password: hashed, initialPassword: password, role: "STAFF", studioId: studio.id },
    })
    console.log(`Updated existing user → STAFF · ${email} · ${studio.name}`)
  } else {
    await prisma.user.create({
      data: { email, password: hashed, initialPassword: password, role: "STAFF", studioId: studio.id },
    })
    console.log(`Created STAFF · ${email} · ${studio.name}`)
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
