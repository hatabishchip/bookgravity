import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendPasswordResetEmail } from "@/lib/mailer"
import { getStudioIdBySubdomain } from "@/lib/studio"
import crypto from "crypto"

export async function POST(request: NextRequest) {
  const { email } = await request.json()
  if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 })

  const studioId = await getStudioIdBySubdomain()
  const user = await prisma.user.findFirst({ where: { email, studioId } })
  // Always return success to avoid email enumeration
  if (!user) return NextResponse.json({ success: true })

  // Invalidate previous tokens
  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } })

  const token = crypto.randomBytes(32).toString("hex")
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

  await prisma.passwordResetToken.create({
    data: { userId: user.id, token, expiresAt },
  })

  await sendPasswordResetEmail(email, token)

  return NextResponse.json({ success: true })
}
