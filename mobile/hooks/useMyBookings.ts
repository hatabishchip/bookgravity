import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import type { Booking } from "@shared/types"

export function useMyBookings(enabled = true) {
  return useQuery<Booking[]>({
    queryKey: ["my-bookings"],
    queryFn: () => api<Booking[]>("/api/native/my-bookings"),
    staleTime: 30_000,
    enabled,
  })
}
