import { prisma } from "@/lib/prisma"
import { getCurrentUserStudioId } from "@/lib/studio"
import { format } from "date-fns"
import Link from "next/link"
import { Calendar, Users, BookOpen, TrendingUp } from "lucide-react"
import SellMembershipButton from "@/app/_components/SellMembershipButton"

export default async function AdminDashboard() {
  const today = format(new Date(), "yyyy-MM-dd")
  const studioId = await getCurrentUserStudioId()

  const [todaySlots, totalBookings, upcomingSlots, trainers] = await Promise.all([
    prisma.timeSlot.findMany({
      where: { date: today, studioId },
      include: {
        trainer: { select: { name: true } },
        _count: { select: { bookings: { where: { status: "CONFIRMED" } } } },
      },
      orderBy: { startTime: "asc" },
    }),
    prisma.booking.count({ where: { status: "CONFIRMED", slot: { studioId } } }),
    prisma.timeSlot.findMany({
      where: { date: { gt: today }, studioId },
      include: {
        trainer: { select: { name: true } },
        _count: { select: { bookings: { where: { status: "CONFIRMED" } } } },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      take: 5,
    }),
    prisma.trainer.count({ where: { studioId } }),
  ])

  const todayTotal = todaySlots.reduce((sum, s) => sum + s._count.bookings, 0)

  function formatTime(time: string) {
    const [h, m] = time.split(":").map(Number)
    const ampm = h >= 12 ? "PM" : "AM"
    return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-1 lg:mb-2">
        <h1 className="text-xl lg:text-2xl font-bold text-gray-900">Dashboard</h1>
        <SellMembershipButton />
      </div>
      <p className="text-gray-500 text-xs lg:text-sm mb-6 lg:mb-8">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-8">
        {[
          { label: "Today's Bookings", value: todayTotal, icon: Calendar, color: "text-[#2C6E49]", bg: "bg-[#2C6E49]/10" },
          { label: "Total Bookings", value: totalBookings, icon: BookOpen, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Trainers", value: trainers, icon: Users, color: "text-purple-600", bg: "bg-purple-50" },
          { label: "Sessions Today", value: todaySlots.length, icon: TrendingUp, color: "text-orange-600", bg: "bg-orange-50" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-2xl p-4 lg:p-5 shadow-sm">
            <div className={`w-9 h-9 lg:w-10 lg:h-10 ${bg} rounded-xl flex items-center justify-center mb-2 lg:mb-3`}>
              <Icon size={18} className={color} />
            </div>
            <div className="text-xl lg:text-2xl font-bold text-gray-900">{value}</div>
            <div className="text-xs lg:text-sm text-gray-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        {/* Today's Schedule */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800">Today&apos;s Schedule</h2>
            <Link href="/admin/schedule" className="text-sm text-[#2C6E49] hover:underline">Manage →</Link>
          </div>
          {todaySlots.length === 0 ? (
            <p className="text-gray-400 text-sm py-4 text-center">No sessions today</p>
          ) : (
            <div className="space-y-3">
              {todaySlots.map((slot) => (
                <div key={slot.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <div>
                    <div className="font-medium text-sm text-gray-800">
                      {formatTime(slot.startTime)} – {formatTime(slot.endTime)}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">{slot.trainer?.name ?? "—"}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-[#2C6E49]">
                      {slot._count.bookings}/{slot.maxCapacity}
                    </div>
                    <div className="text-xs text-gray-400">booked</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Sessions */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800">Upcoming Sessions</h2>
            <Link href="/admin/bookings" className="text-sm text-[#2C6E49] hover:underline">All →</Link>
          </div>
          {upcomingSlots.length === 0 ? (
            <p className="text-gray-400 text-sm py-4 text-center">No upcoming sessions</p>
          ) : (
            <div className="space-y-3">
              {upcomingSlots.map((slot) => (
                <div key={slot.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <div>
                    <div className="font-medium text-sm text-gray-800">
                      {format(new Date(slot.date), "MMM d")} · {formatTime(slot.startTime)}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">{slot.trainer?.name ?? "—"}</div>
                  </div>
                  <div className="text-sm font-semibold text-[#2C6E49]">
                    {slot._count.bookings}/{slot.maxCapacity}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
