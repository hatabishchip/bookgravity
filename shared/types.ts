// Shared TypeScript types used by both the web app (app/) and the mobile
// app (mobile/). Keep this file pure — no runtime imports, no Node-only
// types — so it can be consumed from React Native without a build step.

export type UserRole = "ADMIN" | "TRAINER" | "SUPER_ADMIN" | "CLIENT"

export type ClassType = "GROUP" | "KIDS" | "PRIVATE"

export type StudioSummary = {
  id: string
  name: string
  slug: string
  isDefault: boolean
  whatsappEnabled: boolean
}

export type PublicSlot = {
  id: string
  date: string         // YYYY-MM-DD
  startTime: string    // HH:mm
  endTime: string      // HH:mm
  classType?: ClassType
  maxCapacity: number
  bookedCount: number
  available: boolean
  bookable?: boolean
  price?: number
}

export type Booking = {
  id: string
  ticketCode: string
  clientName: string
  clientPhone: string
  clientEmail: string
  status: "CONFIRMED" | "CANCELLED"
  paymentType: string
  paymentStatus: string
  slot: {
    id: string
    date: string
    startTime: string
    endTime: string
    classType?: ClassType
    trainer?: { id: string; name: string } | null
    studio: { id: string; name: string; slug: string }
  }
}

export type NativeLoginResponse = {
  token: string
  refreshToken: string
  user: {
    id: string
    email: string
    role: UserRole
    studioId: string
    studioSlug: string
    studioLogoUrl: string | null
  }
  expiresAt: number  // unix ms
}
