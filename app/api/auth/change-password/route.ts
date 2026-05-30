import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { currentPassword, newPassword } = await request.json()
  if (!currentPassword || !newPassword || newPassword.length < 4) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } })
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

  const valid = await bcrypt.compare(currentPassword, user.password)
  if (!valid) return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 })

  const hashed = await bcrypt.hash(newPassword, 10)
  // Clearing initialPassword signals the super-admin that this user now has a
  // private password (shown as "•••• changed" in /sadmin).
  await prisma.user.update({ where: { id: user.id }, data: { password: hashed, initialPassword: null } })

  return NextResponse.json({ success: true })
}
