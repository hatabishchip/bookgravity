import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { getStudioIdBySubdomain } from "@/lib/studio"
import BookingWidget from "./_components/BookingWidget"

export default async function HomePage() {
  const studioId = await getStudioIdBySubdomain()

  const studio = await prisma.studio.findUnique({
    where: { id: studioId },
    select: { name: true, slug: true, logoUrl: true },
  })

  const services = await prisma.additionalService.findMany({
    where: { active: true, studioId },
    orderBy: { name: "asc" },
  })

  return (
    <div className="min-h-screen bg-[#F5F4F0]">
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 py-4 sm:py-5 flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-base sm:text-xl font-bold text-[#2C6E49] tracking-tight truncate">
              {studio?.name || "Gravity Stretching"}
            </h1>
          </div>
          <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
            <div className="text-right text-sm text-gray-400 hidden sm:block">
              <div>Group classes</div>
              <div className="text-xs">Up to 6 people</div>
            </div>
            <Link
              href="/login"
              aria-label="Staff sign in"
              className="text-gray-300 hover:text-[#2C6E49] text-xs"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-10">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold text-gray-900 mb-3">Book Your Session</h2>
          <p className="text-gray-500 max-w-md mx-auto">
            Choose a date and time for your group stretching class. Small groups of up to 6 people for personalized attention.
          </p>
        </div>
        <BookingWidget services={services} studio={studio ?? undefined} />
      </div>
    </div>
  )
}
