/**
 * Create a new studio + admin user.
 *
 * Usage:
 *   npx tsx scripts/create-admin.ts "Studio Name" admin@example.com password123 [slug]
 *
 * Connects to production Turso DB by default. To target dev, set DATABASE_URL.
 */
import { createClient } from "@libsql/client"
import bcrypt from "bcryptjs"

const TURSO_URL = "libsql://bookgravity-hatabishchip.aws-ap-northeast-1.turso.io"
const TURSO_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3Nzg2ODA5MTEsImlkIjoiMDE5ZTIxYTQtMjQwMS03YmU4LWJjY2QtNDU5YzM0ZjU0YTlkIiwicmlkIjoiODNjNWUzMmEtNDY1NC00YjhkLTgzZDMtODNjYzU0ZWYwYzA2In0.pJsRSOr-qOfWTF8vKM3vQrugrSbhmWBBOl56J7Nf19Uu_yknpVwofCC_6qcNSprG73x1LoS2Rstg4v64rhYBCg"

function cuid() {
  const t = Date.now().toString(36)
  const r = Math.random().toString(36).slice(2, 10)
  return `c${t}${r}`
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

async function main() {
  const [studioName, email, password, slugArg] = process.argv.slice(2)
  if (!studioName || !email || !password) {
    console.error("Usage: npx tsx scripts/create-admin.ts \"Studio Name\" admin@example.com password [slug]")
    process.exit(1)
  }
  const slug = slugArg || slugify(studioName)

  const c = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN })

  // Check uniqueness
  const dupSlug = await c.execute({ sql: `SELECT id FROM Studio WHERE slug = ?`, args: [slug] })
  if (dupSlug.rows.length > 0) {
    console.error(`✗ Studio with slug "${slug}" already exists.`)
    process.exit(1)
  }
  const dupEmail = await c.execute({ sql: `SELECT id FROM User WHERE email = ?`, args: [email] })
  if (dupEmail.rows.length > 0) {
    console.error(`✗ User with email "${email}" already exists.`)
    process.exit(1)
  }

  const studioId = cuid()
  const userId = cuid()
  const hash = await bcrypt.hash(password, 10)
  const now = new Date().toISOString().replace("T", " ").replace(/\.\d+Z$/, "")

  await c.batch([
    {
      sql: `INSERT INTO Studio (id, name, slug, isDefault, createdAt) VALUES (?, ?, ?, 0, ?)`,
      args: [studioId, studioName, slug, now],
    },
    {
      sql: `INSERT INTO User (id, email, password, role, studioId, createdAt, updatedAt) VALUES (?, ?, ?, 'ADMIN', ?, ?, ?)`,
      args: [userId, email, hash, studioId, now, now],
    },
  ], "write")

  console.log(`✓ Studio created: ${studioName} (${slug})`)
  console.log(`✓ Admin created: ${email}`)
  console.log(`\nAdmin can sign in at https://bookgravity.com/login`)
  console.log(`  Email:    ${email}`)
  console.log(`  Password: ${password}`)
  console.log(`\nNote: this studio's bookings/trainers are isolated from other studios.`)
  console.log(`The public client booking page (bookgravity.com root) still serves the DEFAULT studio.`)
}
main().catch((e) => { console.error(e); process.exit(1) })
