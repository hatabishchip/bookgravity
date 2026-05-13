import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { format, addMonths, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isBefore, startOfDay } from "date-fns"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date
  return format(d, "MMMM d, yyyy")
}

export function formatTime(time: string): string {
  const [hours, minutes] = time.split(":")
  const h = parseInt(hours)
  const ampm = h >= 12 ? "PM" : "AM"
  const h12 = h % 12 || 12
  return `${h12}:${minutes} ${ampm}`
}

export function getCalendarDays(year: number, month: number) {
  const firstDay = startOfMonth(new Date(year, month))
  const lastDay = endOfMonth(new Date(year, month))
  const days = eachDayOfInterval({ start: firstDay, end: lastDay })
  const startPadding = getDay(firstDay)
  return { days, startPadding }
}

export function isDateInPast(dateStr: string): boolean {
  return isBefore(new Date(dateStr), startOfDay(new Date()))
}

export function isDateTooFarAhead(dateStr: string): boolean {
  return isBefore(addMonths(new Date(), 1), new Date(dateStr))
}

export function toISODate(date: Date): string {
  return format(date, "yyyy-MM-dd")
}
