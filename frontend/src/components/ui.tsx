import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { API_BASE } from "@/src/api";
import { useAuth } from "@/src/auth";
import { FONT } from "@/src/fonts";
import { makeStyles, useTheme } from "@/src/theme";

export type IoniconName = Parameters<typeof Ionicons>[0]["name"];

export function Icon({ name, size = 20, color }: { name: string; size?: number; color: string }) {
  return <Ionicons name={name as IoniconName} size={size} color={color} />;
}

const useScreenStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.surface },
}));

export function Screen({
  children,
  topPad = true,
  style,
}: {
  children: React.ReactNode;
  topPad?: boolean;
  style?: ViewStyle;
}) {
  const styles = useScreenStyles();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, topPad && { paddingTop: insets.top }, style]}>
      {children}
    </View>
  );
}

const useCardStyles = makeStyles((c) => ({
  card: {
    backgroundColor: c.surfaceSecondary,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: c.divider,
  },
}));

export function Card({
  children,
  style,
  testID,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  testID?: string;
}) {
  const styles = useCardStyles();
  return (
    <View style={[styles.card, style]} testID={testID}>
      {children}
    </View>
  );
}

const useBtnStyles = makeStyles((c) => ({
  btn: {
    height: 52,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
}));

export function Btn({
  label,
  onPress,
  variant = "primary",
  loading,
  disabled,
  testID,
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "soft" | "danger" | "ghost";
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
  icon?: string;
  style?: ViewStyle;
}) {
  const styles = useBtnStyles();
  const { colors } = useTheme();
  const map = {
    primary: { bg: colors.brandPrimary, fg: colors.onBrandPrimary },
    soft: { bg: colors.brandTertiary, fg: colors.onBrandTertiary },
    danger: { bg: colors.error, fg: colors.onError },
    ghost: { bg: colors.surfaceTertiary, fg: colors.onSurfaceTertiary },
  }[variant];
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: map.bg },
        (disabled || loading) && { opacity: 0.55 },
        pressed && { opacity: 0.85 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={map.fg} size="small" />
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {icon ? <Icon name={icon} size={18} color={map.fg} /> : null}
          <Text style={{ color: map.fg, fontFamily: FONT.textSemi, fontSize: 16 }}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const useChipStyles = makeStyles((c) => ({
  chip: {
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
    backgroundColor: c.surface,
  },
}));

export function Chip({
  label,
  active,
  onPress,
  testID,
  icon,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  testID?: string;
  icon?: string;
}) {
  const styles = useChipStyles();
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={[
        styles.chip,
        {
          borderColor: active ? colors.brandPrimary : colors.border,
          backgroundColor: active ? colors.brandTertiary : colors.surface,
        },
      ]}
    >
      {icon ? (
        <Icon name={icon} size={16} color={active ? colors.brandPrimary : colors.muted} />
      ) : null}
      <Text
        style={{
          color: active ? colors.brandPrimary : colors.onSurfaceTertiary,
          fontFamily: FONT.textMed,
          fontSize: 13,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const useAvatarStyles = makeStyles((c) => ({
  fallback: { backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
}));

export function Avatar({
  name,
  path,
  size = 40,
  testID,
}: {
  name?: string;
  path?: string | null;
  size?: number;
  testID?: string;
}) {
  const styles = useAvatarStyles();
  const { colors } = useTheme();
  const { token } = useAuth();
  const uri = path
    ? `${API_BASE}/api/files/${path}${token ? `?token=${encodeURIComponent(token)}` : ""}`
    : null;
  const initials =
    (name ?? "?")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => (w[0] ?? "").toUpperCase())
      .join("") || "?";
  if (uri) {
    return (
      <Image
        testID={testID}
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="cover"
        transition={150}
      />
    );
  }
  return (
    <View
      testID={testID}
      style={[styles.fallback, { width: size, height: size, borderRadius: size / 2 }]}
    >
      <Text
        style={{
          color: colors.brandPrimary,
          fontFamily: FONT.textSemi,
          fontSize: Math.max(12, Math.round(size * 0.38)),
        }}
      >
        {initials}
      </Text>
    </View>
  );
}

const useEmptyStyles = makeStyles((c) => ({
  wrap: { alignItems: "center", paddingVertical: 32, gap: 12 },
  circle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: c.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: c.onSurface, fontFamily: FONT.textSemi, fontSize: 16 },
  subtitle: {
    color: c.muted,
    fontFamily: FONT.text,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
  },
}));

export function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: string;
  title: string;
  subtitle?: string;
}) {
  const styles = useEmptyStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <View style={styles.circle}>
        <Icon name={icon} size={28} color={colors.brandPrimary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const useFieldStyles = makeStyles((c) => ({
  label: {
    color: c.onSurfaceSecondary,
    fontFamily: FONT.textSemi,
    fontSize: 13,
    marginBottom: 8,
  },
  input: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: c.onSurface,
    fontFamily: FONT.text,
  },
  hint: { color: c.muted, fontFamily: FONT.text, fontSize: 12, marginTop: 6 },
}));

export function Field({
  label,
  hint,
  testID,
  ...input
}: { label: string; hint?: string; testID?: string } & TextInputProps) {
  const styles = useFieldStyles();
  const { colors } = useTheme();
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        testID={testID}
        style={styles.input}
        placeholderTextColor={colors.muted}
        {...input}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const useSectionStyles = makeStyles((c) => ({
  label: {
    color: c.muted,
    fontFamily: FONT.textSemi,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 8,
  },
}));

export function SectionLabel({ children }: { children: React.ReactNode }) {
  const styles = useSectionStyles();
  return <Text style={styles.label}>{children}</Text>;
}
