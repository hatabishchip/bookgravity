import { PrismaClient } from "../app/generated/prisma/client.ts"
import { PrismaLibSql } from "@prisma/adapter-libsql"
import bcrypt from "bcryptjs"
import { addDays, format } from "date-fns"
import path from "path"

const dbUrl = `file:${path.resolve(process.cwd(), "dev.db")}`
const adapter = new PrismaLibSql({ url: dbUrl })
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log("Seeding database...")

  // Admin user
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

  // Trainers
  const trainerData = [
    { name: "Maya", email: "maya@gravitychanggu.com" },
    { name: "Ayu", email: "ayu@gravitychanggu.com" },
    { name: "Dewa", email: "dewa@gravitychanggu.com" },
  ]

  const trainers = []
  for (const t of trainerData) {
    const pw = await bcrypt.hash("trainer123", 10)
    const user = await prisma.user.upsert({
      where: { email: t.email },
      update: {},
      create: {
        email: t.email,
        password: pw,
        role: "TRAINER",
        trainer: { create: { name: t.name } },
      },
      include: { trainer: true },
    })
    trainers.push(user.trainer!)
    console.log("✓ Trainer created:", t.name)
  }

  // Additional services
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

  // Sample time slots for next 2 weeks
  const today = new Date()
  const times = [
    { start: "08:00", end: "09:30" },
    { start: "10:00", end: "11:30" },
    { start: "17:00", end: "18:30" },
  ]

  let slotCount = 0
  for (let i = 1; i <= 14; i++) {
    const date = format(addDays(today, i), "yyyy-MM-dd")
    const dayOfWeek = addDays(today, i).getDay()
    if (dayOfWeek === 0) continue // Skip Sundays

    // 2 sessions per day, rotating trainers
    const daySessions = dayOfWeek % 2 === 0
      ? [times[0], times[2]]
      : [times[1], times[2]]

    for (let j = 0; j < daySessions.length; j++) {
      const trainer = trainers[(i + j) % trainers.length]
      const existing = await prisma.timeSlot.findFirst({
        where: { date, startTime: daySessions[j].start },
      })
      if (!existing) {
        await prisma.timeSlot.create({
          data: {
            date,
            startTime: daySessions[j].start,
            endTime: daySessions[j].end,
            trainerId: trainer.id,
            maxCapacity: 6,
          },
        })
        slotCount++
      }
    }
  }
  console.log(`✓ ${slotCount} time slots created`)

  console.log("\nSeed complete! Login credentials:")
  console.log("  Admin:   admin@gravitychanggu.com / admin123")
  console.log("  Trainer: maya@gravitychanggu.com / trainer123")
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
