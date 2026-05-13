import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

async function main() {
  console.log("Seeding production database...")

  const adminPassword = await bcrypt.hash("admin123", 10)
  const admin = await prisma.user.upsert({
    where: { email: "admin@gravitychanggu.com" },
    update: {},
    create: {
      email: "admin@gravitychanggu.com",
      password: adminPassword,
      role: "ADMIN",
    },
  })
  console.log("✓ Admin created:", admin.email)

  await prisma.additionalService.upsert({
    where: { id: "service-mat" },
    update: {},
    create: { id: "service-mat", name: "Mat Rental", price: 3 },
  })
  await prisma.additionalService.upsert({
    where: { id: "service-strap" },
    update: {},
    create: { id: "service-strap", name: "Strap & Block Set", price: 2 },
  })
  console.log("✓ Services created")

  console.log("\nSeed complete!")
  console.log("  Admin: admin@gravitychanggu.com / admin123")
  console.log("  (Change password after first login!)")
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
