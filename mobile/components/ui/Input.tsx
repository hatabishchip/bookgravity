import { useState } from "react"
import { TextInput, View, StyleSheet, type TextInputProps } from "react-native"
import { spacing, radius, typography } from "@/lib/theme"
import { useTheme } from "@/hooks/useTheme"
import { Text } from "./Text"

// Themed input with floating-label-style header, focus ring, and inline error.
export function Input({
  label,
  error,
  hint,
  ...rest
}: TextInputProps & { label?: string; error?: string | null; hint?: string }) {
  const { theme } = useTheme()
  const [focused, setFocused] = useState(false)
  return (
    <View style={{ gap: spacing.xs }}>
      {label && <Text variant="caption" tone="muted">{label}</Text>}
      <TextInput
        {...rest}
        onFocus={(e) => { setFocused(true); rest.onFocus?.(e) }}
        onBlur={(e) => { setFocused(false); rest.onBlur?.(e) }}
        placeholderTextColor={theme.text.muted}
        style={[
          styles.input,
          {
            backgroundColor: theme.bg.inputIdle,
            borderColor: error ? theme.status.danger : focused ? theme.brand.primary : theme.border.subtle,
            color: theme.text.primary,
            fontSize: typography.size.base,
          },
          rest.style,
        ]}
      />
      {error ? (
        <Text variant="footnote" tone="danger">{error}</Text>
      ) : hint ? (
        <Text variant="footnote" tone="muted">{hint}</Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 48,
  },
})
