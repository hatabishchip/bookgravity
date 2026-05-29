import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import type { PublicSlot } from "@shared/types"

// Calendar feed — all bookable + past slots in the month-range window the
// server returns. Mirrors the web booking widget's /api/slots call.
export function useMonthSlots() {
  return useQuery<PublicSlot[]>({
    queryKey: ["slots", "month"],
    queryFn: () => api<PublicSlot[]>("/api/slots", { auth: false }),
    staleTime: 30_000,
  })
}

// Per-date slot list — fetched lazily when a user taps a calendar cell.
// The endpoint applies the 2-hour cutoff so we only see bookable rows.
export function useDateSlots(date: string | null) {
  return useQuery<PublicSlot[]>({
    queryKey: ["slots", "date", date],
    enabled: !!date,
    queryFn: () => api<PublicSlot[]>(`/api/slots?date=${date}`, { auth: false }),
    staleTime: 15_000,
  })
}
