// Design tokens for this app. Light theme only — Sage Natural palette from
// /app/design_guidelines.json. Keys match the "color" block of that file.
//
// How the names work: a plain key is a background, and its `on` partner is the
// text or icon color that sits on top of it. Always use them as a pair.
//
// Styling a screen or component: build the sheet with makeStyles so colors
// and layout live together:
//   const useStyles = makeStyles((colors) => ({
//     card: { backgroundColor: colors.surfaceSecondary, padding: 16 },
//     title: { color: colors.onSurfaceSecondary, fontSize: 16 },
//   }));
// For color props that are not styles (icon color, placeholderTextColor,
// ActivityIndicator) read useTheme().colors inside the component.

import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  // ---------------------------------------------------------------------------
  // Surfaces: backgrounds, from the screen down to small fills.
  // ---------------------------------------------------------------------------
  surface: "#FDFCF8", // warm cream canvas
  onSurface: "#2C3028", // deep ink text
  surfaceSecondary: "#F4F3EE", // cards, sheets, list rows
  onSurfaceSecondary: "#42473D", // text on cards
  surfaceTertiary: "#EAE8E0", // inputs, chips, deepest nesting
  onSurfaceTertiary: "#5A6152", // text on inputs and chips; also muted text
  surfaceInverse: "#2C3028", // toasts, anything popping against the theme
  onSurfaceInverse: "#FDFCF8",
  muted: "#7A8073", // subdued text: captions, timestamps, placeholders

  // ---------------------------------------------------------------------------
  // Brand: sage green identity.
  // ---------------------------------------------------------------------------
  brand: "#8A9A68",
  onBrand: "#FFFFFF",
  brandPrimary: "#728153", // primary CTA, active tab, selected states
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#9BB07A", // softer sage accents
  onBrandSecondary: "#2C3028",
  brandTertiary: "#E5EADF", // chips, tags, badges, icon fills
  onBrandTertiary: "#42473D",

  // ---------------------------------------------------------------------------
  // Status: semantic only, never decorative.
  // ---------------------------------------------------------------------------
  success: "#6B8E55",
  onSuccess: "#FFFFFF",
  warning: "#C29B38",
  onWarning: "#FFFFFF",
  error: "#B85C50",
  onError: "#FFFFFF",
  info: "#68849A",
  onInfo: "#FFFFFF",

  // ---------------------------------------------------------------------------
  // Lines
  // ---------------------------------------------------------------------------
  border: "#E2E0D5",
  borderStrong: "#C8C4B5",
  divider: "#EBE8DF",
};

export type ThemeColors = typeof light;

export const defaultScheme = "light" satisfies ColorScheme;

export const themes: { light: ThemeColors; dark?: ThemeColors } = { light };

// In-app theme toggle, only after `dark` exists in `themes`.
export function setColorScheme(scheme: ColorScheme | null) {
  // RN 0.86 re-reads the device scheme only for the literal "unspecified";
  // null would pin useColorScheme() to null and the app to light.
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}

// Keep native surfaces light — this app ships a light-only theme.
setColorScheme?.(themes.dark ? null : defaultScheme);

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = system && themes[system] ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

// Themed StyleSheet: returns a hook that builds the sheet from the active
// scheme's colors and memoizes it until the scheme changes.
export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}
