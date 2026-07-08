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
  | {
      state: "assisting"
      id: string
      date: string
      startTime: string
      endTime: string
      classType: string
      maxCapacity: number
      _count: { bookings: number }
      mainTrainerName: string | null
    }
  | { state: "unassigned"; id: string; date: string; startTime: string; endTime: string; maxCapacity: number; _count: { bookings: number } }
  // "other-bookable" (delegated trainers, 07.07) and any future states carry at
  // least the base slot fields; screens filter by the states they render.
  | { state: "other" | "other-bookable"; id: string; date: string; startTime: string; endTime: string }

export function useTrainerSchedule(from?: string, to?: string) {
  return useQuery<TrainerSlot[]>({
    queryKey: ["trainer", "schedule", from, to],
    queryFn: async () => {
      const qs = new URLSearchParams()
      if (from) qs.set("from", from)
      if (to) qs.set("to", to)
      const url = qs.toString() ? `/api/trainer/schedule?${qs}` : "/api/trainer/schedule"
      // 07.07 the endpoint changed from a bare array to { slots, perms } (trainer
      // delegation). Accept both shapes - an unexpected object here crashed every
      // trainer's schedule tab ("undefined is not a function" white screen).
      const res = await api<TrainerSlot[] | { slots?: TrainerSlot[] }>(url)
      return Array.isArray(res) ? res : (res?.slots ?? [])
    },
    staleTime: 30_000,
  })
}
