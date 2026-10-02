import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { Animated, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FONT } from "@/src/fonts";
import { makeStyles, useTheme } from "@/src/theme";
import { Icon } from "./ui";

type ToastType = "success" | "error" | "info";
type ToastData = { msg: string; type: ToastType; key: number };

const ToastCtx = createContext<{ show: (msg: string, type?: ToastType) => void }>({
  show: () => {},
});

export const useToast = () => useContext(ToastCtx);

const useStyles = makeStyles((c) => ({
  toast: {
    position: "absolute",
    left: 24,
    right: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    zIndex: 1000,
    elevation: 1000,
  },
  toastText: { color: c.onSurfaceInverse, fontFamily: FONT.textMed, fontSize: 13, flex: 1 },
}));

export function ToastProvider({ children }: { children: ReactNode }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastData | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fade = useRef(new Animated.Value(0)).current;

  const show = (msg: string, type: ToastType = "success") => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ msg, type, key: Date.now() });
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    timer.current = setTimeout(() => {
      Animated.timing(fade, { toValue: 0, duration: 200, useNativeDriver: true }).start(
        () => setToast(null),
      );
    }, 2600);
  };

  const colorMap = { success: colors.success, error: colors.warning, info: colors.info };
  const iconMap = {
    success: "checkmark-circle",
    error: "warning",
    info: "information-circle",
  };

  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      {toast ? (
        <Animated.View
          key={toast.key}
          pointerEvents="none"
          style={[
            styles.toast,
            { top: insets.top + 12, backgroundColor: colors.surfaceInverse, opacity: fade },
          ]}
        >
          <Icon name={iconMap[toast.type]} size={18} color={colorMap[toast.type]} />
          <Text style={styles.toastText}>{toast.msg}</Text>
        </Animated.View>
      ) : null}
    </ToastCtx.Provider>
  );
}
