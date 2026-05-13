import { createClient } from "@libsql/client"
import bcrypt from "bcryptjs"

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

async function main() {
  const newPassword = await bcrypt.hash("0000", 10)
  const now = new Date().toISOString()

  // Replace first two trainers
  const replacements = [
    { oldEmail: "maya@gravitychanggu.com", newEmail: "seni@gmail.com", newName: "Seni" },
    { oldEmail: "ayu@gravitychanggu.com", newEmail: "dita@gmail.com", newName: "Dita" },
  ]

  for (const r of replacements) {
    const result = await client.execute({
      sql: `UPDATE User SET email = ?, password = ?, updatedAt = ? WHERE email = ?`,
      args: [r.newEmail, newPassword, now, r.oldEmail],
    })
    if (result.rowsAffected > 0) {
      const userRes = await client.execute({
        sql: `SELECT id FROM User WHERE email = ?`,
        args: [r.newEmail],
      })
      const userId = userRes.rows[0]?.id
      if (userId) {
        await client.execute({
          sql: `UPDATE Trainer SET name = ?, updatedAt = ? WHERE userId = ?`,
          args: [r.newName, now, userId],
        })
      }
      console.log(`✓ ${r.oldEmail} → ${r.newEmail} (${r.newName})`)
    } else {
      console.log(`⚠ ${r.oldEmail} not found`)
    }
  }

  // Reset password for ALL trainers to 0000
  const allTrainers = await client.execute({
    sql: `SELECT email FROM User WHERE role = 'TRAINER'`,
  })

  for (const row of allTrainers.rows) {
    await client.execute({
      sql: `UPDATE User SET password = ?, updatedAt = ? WHERE email = ?`,
      args: [newPassword, now, row.email],
    })
    console.log(`✓ Password reset: ${row.email}`)
  }

  console.log("\n✅ Done. All trainer passwords are now '0000'")
}

main().catch(console.error).finally(() => client.close())
