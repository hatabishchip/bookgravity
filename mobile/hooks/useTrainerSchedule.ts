import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"

export type TrainerSlot =
  | {
      state: "mine"
      id: string
      date: string
      startTime: string
      endTime: string
      classType: string
      maxCapacity: number
      _count: { bookings: number }
    }
  | { state: "unassigned"; id: string; date: string; startTime: string; endTime: string; maxCapacity: number; _count: { bookings: number } }
  | { state: "other"; id: string; date: string; startTime: string; endTime: string }

export function useTrainerSchedule(from?: string, to?: string) {
  return useQuery<TrainerSlot[]>({
    queryKey: ["trainer", "schedule", from, to],
    queryFn: () => {
      const qs = new URLSearchParams()
      if (from) qs.set("from", from)
      if (to) qs.set("to", to)
      const url = qs.toString() ? `/api/trainer/schedule?${qs}` : "/api/trainer/schedule"
      return api<TrainerSlot[]>(url)
    },
    staleTime: 30_000,
  })
}
