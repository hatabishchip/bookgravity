import { useState } from "react"
import { View, ScrollView, Pressable, StyleSheet, ActivityIndicator, RefreshControl } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { Stack, useLocalSearchParams, useRouter } from "expo-router"
import { ChevronLeft, Minus, Plus, CheckCircle2 } from "lucide-react-native"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import * as Haptics from "expo-haptics"
import { spacing, radius } from "@/lib/theme"
import { useTheme } from "@/hooks/useTheme"
import { Text } from "@/components/ui/Text"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { api, ApiError } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { format, parseISO } from "date-fns"
import { clientClassRange } from "@/lib/dates"
import type { PublicSlot } from "@shared/types"

type SlotDetail = PublicSlot & { date: string; classType?: "GROUP" | "KIDS" | "PRIVATE" }

// Booking confirmation sheet. Defaults the client's name + email to the
// signed-in user's email — they can override before confirming. POSTs to
// /api/bookings just like the web flow.
export default function BookScreen() {
  const { theme } = useTheme()
  const params = useLocalSearchParams<{ slotId?: string }>()
  const slotId = params.slotId ?? ""
  const router = useRouter()
  const user = useAuth((s) => s.user)
  const qc = useQueryClient()

  const [name, setName] = useState("")
  const [email, setEmail] = useState(user?.email ?? "")
  const [phone, setPhone] = useState("")
  const [partySize, setPartySize] = useState(1)
  const [done, setDone] = useState<{ ticketCode: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  // WhatsApp confirmation code step. `codeSent` reveals the code input; the
  // code is passed straight to /api/bookings (the server re-verifies it), so
  // no cookie persistence is needed on the device. Studios with the code turned
  // off (or a signed-in staff Bearer) return {skipped} and we book directly.
  const [codeSent, setCodeSent] = useState(false)
  const [code, setCode] = useState("")
  const [otpBusy, setOtpBusy] = useState(false)

  // Fetch the slot to render its date/time + class type in the sheet.
  // No dedicated endpoint exists yet, so we look it up in the month feed.
  const slotsQuery = useQuery<PublicSlot[]>({
    queryKey: ["slots", "month"],
    queryFn: () => api<PublicSlot[]>("/api/slots", { auth: false }),
    staleTime: 60_000,
  })
  const slot = slotsQuery.data?.find((s) => s.id === slotId) as SlotDetail | undefined

  const book = useMutation({
    mutationFn: async (otpCode?: string) => {
      return api<{ id: string; ticketCode: string }>("/api/bookings", {
        method: "POST",
        body: {
          slotId,
          clientName: name.trim(),
          clientPhone: phone.trim(),
          clientEmail: email.trim(),
          partySize,
          ...(otpCode ? { otpCode } : {}),
        },
      })
    },
    onSuccess: (res) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      qc.invalidateQueries({ queryKey: ["slots"] })
      qc.invalidateQueries({ queryKey: ["my-bookings"] })
      setDone({ ticketCode: res.ticketCode })
    },
    onError: (err) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      // A 401 here = the WhatsApp code was wrong/expired. Keep the code field
      // open so the client can re-enter or resend instead of dead-ending.
      if (err instanceof ApiError && err.status === 401) {
        setCodeSent(true)
        setError("That code is incorrect or expired. Re-enter it or tap Resend.")
        return
      }
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Booking failed")
    },
  })

  // Ask the server to send (or resend) the WhatsApp code. Returns "skip" when
  // no code is needed (studio has it off, or a signed-in staff Bearer), "sent"
  // when a code is on its way, or throws with a user-facing message.
  const requestCode = async (): Promise<"skip" | "sent"> => {
    try {
      const r = await api<{ sent?: boolean; skipped?: boolean }>("/api/otp/send", {
        method: "POST",
        body: { phone: phone.trim() },
      })
      return r.skipped ? "skip" : "sent"
    } catch (err) {
      if (err instanceof ApiError) {
        const b = (err.body ?? {}) as { code?: string }
        if (err.status === 429 && b.code === "too_soon") return "sent" // a fresh code already exists
        if (err.status === 429 && b.code === "rate_limited") throw new Error("Too many attempts from this network. Please try again later, or ask the studio to add you.")
        if (err.status === 502) throw new Error("We couldn't send a code to that number. Check it's correct and has WhatsApp.")
      }
      throw new Error("Couldn't send the confirmation code. Check the number and try again.")
    }
  }

  const submit = async () => {
    setError(null)
    if (name.trim().length < 2) { setError("Enter your full name"); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError("Enter a valid email"); return }
    if (phone.trim().length < 7) { setError("Enter your phone with country code (e.g. +62 …)"); return }

    // Already have the code on screen → book with it.
    if (codeSent) {
      if (code.trim().length < 1) { setError("Enter the code from WhatsApp"); return }
      book.mutate(code.trim())
      return
    }

    // First tap: ask for a code (or skip straight to booking).
    setOtpBusy(true)
    try {
      const outcome = await requestCode()
      if (outcome === "skip") {
        book.mutate(undefined)
      } else {
        setCodeSent(true)
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send the code.")
    } finally {
      setOtpBusy(false)
    }
  }

  const resendCode = async () => {
    setError(null)
    setOtpBusy(true)
    try {
      await requestCode()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't resend the code.")
    } finally {
      setOtpBusy(false)
    }
  }

  if (done) {
    return <SuccessScreen ticketCode={done.ticketCode} onClose={() => router.replace("/(client)/bookings")} />
  }

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { borderBottomColor: theme.border.subtle }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ width: 32 }}>
          <ChevronLeft size={24} color={theme.text.primary} />
        </Pressable>
        <Text variant="headline" tone="primary">Confirm booking</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
        refreshControl={<RefreshControl refreshing={slotsQuery.isRefetching} onRefresh={slotsQuery.refetch} tintColor={theme.brand.primary} />}
      >
        {/* Slot recap card */}
        {slot ? (
          <View style={[styles.recap, { backgroundColor: theme.brand.primarySoft }]}>
            <Text variant="caption" tone="brand">Booking for</Text>
            <Text variant="title3" tone="primary" style={{ marginTop: 2 }}>
              {format(parseISO(slot.date), "EEEE, MMMM d")}
            </Text>
            <Text variant="callout" tone="primary" style={{ marginTop: 4 }}>
              {clientClassRange(slot.startTime)}
            </Text>
          </View>
        ) : (
          <ActivityIndicator color={theme.brand.primary} />
        )}

        <Input
          label="Full name"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          placeholder="Alex Diachuk"
        />
        <Input
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          keyboardType="email-address"
          placeholder="you@example.com"
          hint="We'll send your ticket and reminders here."
        />
        <Input
          label="Phone (with country code)"
          value={phone}
          onChangeText={(v) => { setPhone(v); if (codeSent) { setCodeSent(false); setCode("") } }}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          placeholder="+62 812 3456 7890"
          hint="We send a quick confirmation code to this WhatsApp."
        />

        {/* WhatsApp code step - appears after the first Confirm tap. */}
        {codeSent && (
          <View style={{ gap: spacing.sm }}>
            <Input
              label="WhatsApp code"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              placeholder="Enter the code we sent"
              hint="Check the WhatsApp messages on this number."
            />
            <Pressable onPress={resendCode} disabled={otpBusy} hitSlop={8}>
              <Text variant="footnote" tone="brand">{otpBusy ? "Sending…" : "Resend code"}</Text>
            </Pressable>
          </View>
        )}

        {/* Party size stepper */}
        <View>
          <Text variant="caption" tone="muted">Number of people</Text>
          <View style={[styles.stepper, { backgroundColor: theme.bg.card, borderColor: theme.border.subtle }]}>
            <Pressable
              onPress={() => { Haptics.selectionAsync(); setPartySize(Math.max(1, partySize - 1)) }}
              disabled={partySize <= 1}
              style={styles.stepBtn}
              hitSlop={6}
            >
              <Minus size={18} color={partySize <= 1 ? theme.text.muted : theme.text.primary} />
            </Pressable>
            <Text variant="title3" tone="primary">{partySize}</Text>
            <Pressable
              onPress={() => { Haptics.selectionAsync(); setPartySize(Math.min(6, partySize + 1)) }}
              disabled={partySize >= 6}
              style={styles.stepBtn}
              hitSlop={6}
            >
              <Plus size={18} color={partySize >= 6 ? theme.text.muted : theme.text.primary} />
            </Pressable>
          </View>
        </View>

        {error && (
          <View style={[styles.errorBox, { backgroundColor: "rgba(220,38,38,0.08)", borderColor: theme.status.danger }]}>
            <Text variant="footnote" tone="danger">{error}</Text>
          </View>
        )}

        <Button
          title={codeSent ? "Confirm booking" : "Continue"}
          onPress={submit}
          loading={book.isPending || otpBusy}
        />
      </ScrollView>
    </SafeAreaView>
  )
}

function SuccessScreen({ ticketCode, onClose }: { ticketCode: string; onClose: () => void }) {
  const { theme } = useTheme()
  return (
    <SafeAreaView style={{ flex: 1, padding: spacing.xl, justifyContent: "center", alignItems: "center", gap: spacing.lg }}>
      <View style={[styles.successCircle, { backgroundColor: theme.brand.primarySoft }]}>
        <CheckCircle2 size={56} color={theme.brand.primary} />
      </View>
      <Text variant="title2" tone="primary">You&apos;re booked!</Text>
      <Text variant="subhead" tone="muted" style={{ textAlign: "center" }}>
        Your ticket code is below. Show it to your trainer at the studio.
      </Text>
      <View style={[styles.ticketBlock, { backgroundColor: theme.bg.card, borderColor: theme.brand.primary }]}>
        <Text variant="caption" tone="muted">TICKET CODE</Text>
        <Text style={{ fontSize: 42, fontWeight: "700", color: theme.brand.primary, letterSpacing: 6, marginTop: spacing.xs }}>
          #{ticketCode}
        </Text>
      </View>
      <Button title="View my tickets" onPress={onClose} />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  recap: {
    padding: spacing.lg,
    borderRadius: radius.xl,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
  },
  stepBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  errorBox: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  successCircle: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  ticketBlock: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 2,
    alignItems: "center",
  },
})
