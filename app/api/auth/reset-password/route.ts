import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

export async function POST(request: NextRequest) {
  const { token, password } = await request.json()
  if (!token || !password || password.length < 4) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { token },
    include: { user: true },
  })

  if (!resetToken || resetToken.expiresAt < new Date()) {
    return NextResponse.json({ error: "Link has expired or is invalid" }, { status: 400 })
  }

  const hashed = await bcrypt.hash(password, 10)
  await prisma.user.update({ where: { id: resetToken.userId }, data: { password: hashed } })
  await prisma.passwordResetToken.delete({ where: { token } })

  return NextResponse.json({ success: true })
}
