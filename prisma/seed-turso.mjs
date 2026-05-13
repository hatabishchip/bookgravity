import { createClient } from "@libsql/client"
import bcrypt from "bcryptjs"

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

async function main() {
  console.log("Seeding Turso database...")

  const adminPassword = await bcrypt.hash("admin123", 10)
  const trainerPassword = await bcrypt.hash("trainer123", 10)
  const now = new Date().toISOString()

  // Create cuid-like IDs
  const cuid = () => "c" + Math.random().toString(36).slice(2, 12) + Date.now().toString(36)

  // Admin
  const adminId = cuid()
  await client.execute({
    sql: `INSERT OR REPLACE INTO User (id, email, password, role, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`,
    args: [adminId, "admin@gravitychanggu.com", adminPassword, "ADMIN", now, now],
  })
  console.log("✓ Admin: admin@gravitychanggu.com / admin123")

  // Trainers
  const trainers = [
    { name: "Maya", email: "maya@gravitychanggu.com" },
    { name: "Ayu", email: "ayu@gravitychanggu.com" },
    { name: "Dewa", email: "dewa@gravitychanggu.com" },
  ]

  for (const t of trainers) {
    const userId = cuid()
    const trainerId = cuid()
    await client.execute({
      sql: `INSERT OR REPLACE INTO User (id, email, password, role, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [userId, t.email, trainerPassword, "TRAINER", now, now],
    })
    await client.execute({
      sql: `INSERT OR REPLACE INTO Trainer (id, name, whatsapp, userId, commissionRate, color, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [trainerId, t.name, "", userId, 15, "#6366F1", now, now],
    })
    console.log(`✓ Trainer: ${t.email} / trainer123`)
  }

  // Services
  await client.execute({
    sql: `INSERT OR REPLACE INTO AdditionalService (id, name, price, active) VALUES (?, ?, ?, ?)`,
    args: ["service-mat", "Mat Rental", 3, 1],
  })
  await client.execute({
    sql: `INSERT OR REPLACE INTO AdditionalService (id, name, price, active) VALUES (?, ?, ?, ?)`,
    args: ["service-strap", "Strap & Block Set", 2, 1],
  })
  console.log("✓ Services created")

  console.log("\nDone! Login at /admin/login")
}

main().catch(console.error).finally(() => client.close())
