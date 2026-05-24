// One-shot script: take the studio logo from Studio.logoUrl (stored as a
// data: URI in our DB), upload it to Meta's resumable upload session, then
// set it as the WhatsApp Business profile picture so the avatar shows up
// next to every message we send through the Cloud API.
//
// Run: cd bookgravity && npx tsx scripts/set-wa-profile-picture.ts canggu
//
// Meta requirements:
//   • Square image (preferred)
//   • 192-640px on each side
//   • JPG or PNG, ≤ 5MB
//
// The Canggu studio's logo is a 500x500 JPEG — fits the requirements.

import "dotenv/config"
import { createClient } from "@libsql/client"

const APP_ID = "1872775433439200"
const PHONE_NUMBER_ID = "1163623746829979"
const GRAPH = "https://graph.facebook.com/v21.0"

async function main() {
  const slug = process.argv[2]
  if (!slug) {
    console.error("Usage: tsx scripts/set-wa-profile-picture.ts <studio-slug>")
    process.exit(1)
  }
  const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN
  if (!TOKEN) {
    console.error("WHATSAPP_ACCESS_TOKEN env not set")
    process.exit(1)
  }

  const c = createClient({
    url: process.env.DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  })
  const r = await c.execute({
    sql: "SELECT name, slug, logoUrl FROM Studio WHERE slug = ?",
    args: [slug],
  })
  if (r.rows.length === 0) {
    console.error(`No studio with slug "${slug}"`)
    process.exit(1)
  }
  const { name, logoUrl } = r.rows[0] as { name: string; logoUrl?: string }
  console.log(`Studio: ${name}`)
  if (!logoUrl) {
    console.error("Studio has no logoUrl set — upload one in /admin/settings first")
    process.exit(1)
  }
  if (!logoUrl.startsWith("data:")) {
    console.error("logoUrl is not a data: URI — only data URIs are supported by this script")
    process.exit(1)
  }
  const match = logoUrl.match(/^data:(image\/(?:jpeg|png|jpg));base64,(.+)$/)
  if (!match) {
    console.error("logoUrl is not a valid JPEG/PNG data URI")
    process.exit(1)
  }
  const mimeType = match[1] === "image/jpg" ? "image/jpeg" : match[1]
  const buffer = Buffer.from(match[2], "base64")
  console.log(`Image: ${mimeType} ${(buffer.length / 1024).toFixed(1)}KB`)

  // 1) Start a resumable upload session under the app.
  console.log("\n— step 1: start upload session …")
  const startUrl = `${GRAPH}/${APP_ID}/uploads?file_length=${buffer.length}&file_type=${encodeURIComponent(mimeType)}&access_token=${encodeURIComponent(TOKEN)}`
  const startRes = await fetch(startUrl, { method: "POST" })
  const startJson = (await startRes.json()) as { id?: string; error?: { message: string } }
  if (!startRes.ok || !startJson.id) {
    console.error("Failed to start upload:", startJson)
    process.exit(1)
  }
  const sessionId = startJson.id
  console.log("  session:", sessionId)

  // 2) Upload bytes. Meta wants the body to be the raw image and the
  //    Authorization header in the OAuth scheme (not Bearer).
  console.log("\n— step 2: upload bytes …")
  const uploadRes = await fetch(`${GRAPH}/${sessionId}`, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${TOKEN}`,
      file_offset: "0",
    },
    body: new Uint8Array(buffer),
  })
  const uploadJson = (await uploadRes.json()) as { h?: string; error?: { message: string } }
  if (!uploadRes.ok || !uploadJson.h) {
    console.error("Failed to upload bytes:", uploadJson)
    process.exit(1)
  }
  const handle = uploadJson.h
  console.log("  handle:", handle.slice(0, 40) + "…")

  // 3) Set as profile picture on the phone number.
  console.log("\n— step 3: set profile picture …")
  const profileRes = await fetch(`${GRAPH}/${PHONE_NUMBER_ID}/whatsapp_business_profile`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      profile_picture_handle: handle,
    }),
  })
  const profileJson = (await profileRes.json()) as { success?: boolean; error?: { message: string } }
  if (!profileRes.ok || !profileJson.success) {
    console.error("Failed to set profile picture:", profileJson)
    process.exit(1)
  }
  console.log("\nDone — profile picture set. New conversations will show it as the avatar.")
  console.log("Existing chats may take a few minutes to refresh the avatar on the client side.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
