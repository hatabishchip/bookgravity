import { prisma } from "@/lib/prisma"
import { getCurrentUserStudioId } from "@/lib/studio"
import { format } from "date-fns"
import Link from "next/link"
import { Calendar, Landmark, TrendingUp, AlertCircle } from "lucide-react"
import { baliDateStr } from "@/lib/tz"
import SellMembershipButton from "@/app/_components/SellMembershipButton"

export default async function AdminDashboard() {
  // Studio-local "today" (the server runs in UTC - format(new Date()) flipped
  // the dashboard to tomorrow every evening Bali time).
  const today = baliDateStr(new Date())
  const studioId = await getCurrentUserStudioId()

  // The old "Total Bookings (all time)" and "Trainers" cards were vanity
  // numbers; the cards now answer the admin's actual morning questions:
  // who hasn't paid today, and is there bank money waiting to be linked.
  const [todaySlots, upcomingSlots, unpaidToday, bankToLink] = await Promise.all([
    prisma.timeSlot.findMany({
      where: { date: today, studioId },
      include: {
        trainer: { select: { name: true } },
        _count: { select: { bookings: { where: { status: "CONFIRMED" } } } },
      },
      orderBy: { startTime: "asc" },
    }),
    prisma.timeSlot.findMany({
      where: { date: { gt: today }, studioId },
      include: {
        trainer: { select: { name: true } },
        _count: { select: { bookings: { where: { status: "CONFIRMED" } } } },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      take: 5,
    }),
    prisma.booking.count({
      where: { status: "CONFIRMED", paymentStatus: "UNPAID", slot: { studioId, date: today } },
    }),
    prisma.bankPayment.count({ where: { studioId, bookingId: null } }),
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

      {/* Stats - working numbers, each one tappable to where the work is. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-8">
        {[
          { label: "Today's Bookings", value: todayTotal, icon: Calendar, color: "text-brand", bg: "bg-brand/10", href: "/admin/bookings" },
          { label: "Unpaid Today", value: unpaidToday, icon: AlertCircle, color: unpaidToday > 0 ? "text-amber-600" : "text-gray-400", bg: unpaidToday > 0 ? "bg-amber-50" : "bg-gray-50", href: "/admin/bookings?pay=unpaid" },
          { label: "Bank to Link", value: bankToLink, icon: Landmark, color: bankToLink > 0 ? "text-emerald-600" : "text-gray-400", bg: bankToLink > 0 ? "bg-emerald-50" : "bg-gray-50", href: "/admin/payments" },
          { label: "Sessions Today", value: todaySlots.length, icon: TrendingUp, color: "text-orange-600", bg: "bg-orange-50", href: `/admin/schedule?date=${today}` },
        ].map(({ label, value, icon: Icon, color, bg, href }) => (
          <Link key={label} href={href} className="bg-white rounded-2xl p-4 lg:p-5 shadow-sm hover:shadow transition-shadow">
            <div className={`w-9 h-9 lg:w-10 lg:h-10 ${bg} rounded-xl flex items-center justify-center mb-2 lg:mb-3`}>
              <Icon size={18} className={color} />
            </div>
            <div className="text-xl lg:text-2xl font-bold text-gray-900">{value}</div>
            <div className="text-xs lg:text-sm text-gray-500 mt-0.5">{label}</div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        {/* Today's Schedule */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800">Today&apos;s Schedule</h2>
            <Link href="/admin/schedule" className="text-sm text-brand hover:underline">Manage →</Link>
          </div>
          {todaySlots.length === 0 ? (
            <p className="text-gray-400 text-sm py-4 text-center">No sessions today</p>
          ) : (
            <div className="space-y-3">
              {todaySlots.map((slot) => (
                <Link key={slot.id} href={`/admin/schedule?date=${slot.date}`} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                  <div>
                    <div className="font-medium text-sm text-gray-800">
                      {formatTime(slot.startTime)} – {formatTime(slot.endTime)}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">{slot.trainer?.name ?? "—"}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-brand">
                      {slot._count.bookings}/{slot.maxCapacity}
                    </div>
                    <div className="text-xs text-gray-400">booked</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Sessions */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800">Upcoming Sessions</h2>
            <Link href="/admin/bookings" className="text-sm text-brand hover:underline">All →</Link>
          </div>
          {upcomingSlots.length === 0 ? (
            <p className="text-gray-400 text-sm py-4 text-center">No upcoming sessions</p>
          ) : (
            <div className="space-y-3">
              {upcomingSlots.map((slot) => (
                <Link key={slot.id} href={`/admin/schedule?date=${slot.date}`} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                  <div>
                    <div className="font-medium text-sm text-gray-800">
                      {format(new Date(slot.date), "MMM d")} · {formatTime(slot.startTime)}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">{slot.trainer?.name ?? "—"}</div>
                  </div>
                  <div className="text-sm font-semibold text-brand">
                    {slot._count.bookings}/{slot.maxCapacity}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
