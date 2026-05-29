// Design tokens — single source of truth for color / spacing / typography.
// Mirrors the values used in the web app (#2C6E49 brand, etc.) so the two
// products feel like one product. Dark mode flips greys; brand stays the
// same in both schemes so studio identity is consistent.

export type Theme = {
  brand: {
    primary: string
    primaryDark: string
    primarySoft: string
    accentAmber: string
    accentRose: string
    accentPurple: string
  }
  bg: { page: string; card: string; elevated: string; inputIdle: string; tabBar: string }
  text: { primary: string; secondary: string; muted: string; invert: string }
  border: { subtle: string; strong: string; focus: string }
  status: { success: string; warning: string; danger: string; info: string }
}

export const lightTheme: Theme = {
  brand: {
    primary: "#2C6E49",
    primaryDark: "#1E4D34",
    primarySoft: "rgba(44,110,73,0.10)",
    accentAmber: "#D97706",
    accentRose: "#E76F51",
    accentPurple: "#7C3AED",
  },
  bg: {
    page: "#F5F4F0",
    card: "#FFFFFF",
    elevated: "#FFFFFF",
    inputIdle: "#FFFFFF",
    tabBar: "#FFFFFFEE",
  },
  text: {
    primary: "#0A0A0A",
    secondary: "#52525B",
    muted: "#A1A1AA",
    invert: "#FFFFFF",
  },
  border: {
    subtle: "#E5E7EB",
    strong: "#D4D4D8",
    focus: "rgba(44,110,73,0.4)",
  },
  status: {
    success: "#16A34A",
    warning: "#F59E0B",
    danger: "#DC2626",
    info: "#0EA5E9",
  },
}

export const darkTheme: Theme = {
  brand: {
    primary: "#3B8B5C",
    primaryDark: "#2C6E49",
    primarySoft: "rgba(59,139,92,0.18)",
    accentAmber: "#F59E0B",
    accentRose: "#F87171",
    accentPurple: "#A78BFA",
  },
  bg: {
    page: "#0A0A0A",
    card: "#18181B",
    elevated: "#27272A",
    inputIdle: "#18181B",
    tabBar: "#0A0A0AEE",
  },
  text: {
    primary: "#FAFAFA",
    secondary: "#D4D4D8",
    muted: "#71717A",
    invert: "#0A0A0A",
  },
  border: {
    subtle: "#27272A",
    strong: "#3F3F46",
    focus: "rgba(59,139,92,0.6)",
  },
  status: {
    success: "#22C55E",
    warning: "#FBBF24",
    danger: "#EF4444",
    info: "#38BDF8",
  },
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  "2xl": 32,
  "3xl": 48,
} as const

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 9999,
} as const

export const typography = {
  // System font on iOS — pairs with SF Symbols nicely.
  family: undefined as string | undefined,
  size: {
    xs: 11,
    sm: 13,
    base: 15,
    lg: 17,
    xl: 20,
    "2xl": 24,
    "3xl": 30,
    "4xl": 38,
  },
  weight: {
    regular: "400" as const,
    medium: "500" as const,
    semibold: "600" as const,
    bold: "700" as const,
  },
} as const

