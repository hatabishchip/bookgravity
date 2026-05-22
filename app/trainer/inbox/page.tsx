import { Suspense } from "react"
import Inbox from "@/app/_components/Inbox"

export default function TrainerInboxPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-gray-400">Loading…</div>}>
      <Inbox role="TRAINER" />
    </Suspense>
  )
}
