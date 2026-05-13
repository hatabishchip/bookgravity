import Link from "next/link"
import { LogIn } from "lucide-react"
import { prisma } from "@/lib/prisma"
import BookingWidget from "./_components/BookingWidget"

export default async function HomePage() {
  const services = await prisma.additionalService.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  })

  return (
    <div className="min-h-screen bg-[#F5F4F0]">
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[#2C6E49] tracking-tight">Gravity Stretching</h1>
            <p className="text-xs text-gray-400 mt-0.5">Changgu, Bali</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right text-sm text-gray-400 hidden sm:block">
              <div>Group classes</div>
              <div className="text-xs">Up to 6 people</div>
            </div>
            <Link
              href="/trainer/login"
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#2C6E49] text-white text-sm font-medium hover:bg-[#1E4D34] transition-colors"
            >
              <LogIn size={16} />
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
        <BookingWidget services={services} />
      </div>
    </div>
  )
}
