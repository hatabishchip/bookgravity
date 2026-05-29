import { useRef } from "react"
import { Pressable, ActivityIndicator, View, StyleSheet, type PressableProps } from "react-native"
import * as Haptics from "expo-haptics"
import { spacing, radius, typography } from "@/lib/theme"
import { useTheme } from "@/hooks/useTheme"
import { Text } from "./Text"

type Variant = "primary" | "secondary" | "ghost" | "destructive"
type Size = "sm" | "md" | "lg"

// Premium native button — light haptic on press-in, scale-down animation,
// loading state with inline spinner, variants matching the design tokens.
export function Button({
  title,
  onPress,
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  leftIcon,
  ...rest
}: Omit<PressableProps, "children"> & {
  title: string
  variant?: Variant
  size?: Size
  loading?: boolean
  leftIcon?: React.ReactNode
}) {
  const { theme } = useTheme()
  const lockedOut = !!loading || !!disabled
  const lastTap = useRef(0)

  const bg =
    variant === "primary" ? theme.brand.primary :
    variant === "secondary" ? theme.bg.card :
    variant === "destructive" ? theme.status.danger :
    "transparent"
  const border =
    variant === "secondary" ? theme.border.strong : "transparent"
  const fg =
    variant === "primary" || variant === "destructive" ? theme.text.invert :
    variant === "ghost" ? theme.brand.primary :
    theme.text.primary
  const padV = size === "sm" ? 8 : size === "md" ? 12 : 16
  const padH = size === "sm" ? 12 : size === "md" ? 18 : 24
  const fontSize = size === "sm" ? typography.size.sm : typography.size.base

  return (
    <Pressable
      {...rest}
      onPress={(e) => {
        if (lockedOut) return
        // Debounce double-taps to prevent duplicate submissions
        const now = Date.now()
        if (now - lastTap.current < 600) return
        lastTap.current = now
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        onPress?.(e)
      }}
      disabled={lockedOut}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: bg,
          borderColor: border,
          borderWidth: variant === "secondary" ? StyleSheet.hairlineWidth : 0,
          paddingVertical: padV,
          paddingHorizontal: padH,
          opacity: lockedOut ? 0.55 : 1,
          transform: pressed ? [{ scale: 0.97 }] : [{ scale: 1 }],
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.row}>
          {leftIcon}
          <Text style={{ color: fg, fontSize, fontWeight: typography.weight.semibold }}>{title}</Text>
        </View>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44, // Apple HIG touch target
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
})
