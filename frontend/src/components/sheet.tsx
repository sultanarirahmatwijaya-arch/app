import { Modal, Pressable, ScrollView, Text, View, type ReactNode } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FONT } from "@/src/fonts";
import { makeStyles, useTheme } from "@/src/theme";
import { Btn } from "./ui";

const useStyles = makeStyles((c) => ({
  flex: { flex: 1, justifyContent: "flex-end" },
  backdrop: { flex: 1, backgroundColor: "rgba(44, 48, 40, 0.4)" },
  panel: {
    backgroundColor: c.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 12,
    paddingHorizontal: 24,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: c.borderStrong,
    alignSelf: "center",
    marginBottom: 14,
  },
  title: {
    color: c.onSurface,
    fontFamily: FONT.display,
    fontSize: 20,
    marginBottom: 16,
  },
  message: {
    color: c.onSurfaceSecondary,
    fontFamily: FONT.text,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  btnRow: { flexDirection: "row", gap: 12, marginTop: 8 },
}));

export function Sheet({
  visible,
  onClose,
  title,
  children,
  testID,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  testID?: string;
}) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} testID={testID}>
      <View style={styles.flex}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.panel, { paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.grabber} />
          <Text style={styles.title}>{title}</Text>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel = "Hapus",
  destructive = true,
  onConfirm,
  onClose,
  testID,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  testID?: string;
}) {
  const styles = useStyles();
  return (
    <Sheet visible={visible} onClose={onClose} title={title} testID={testID}>
      <Text style={styles.message}>{message}</Text>
      <View style={styles.btnRow}>
        <Btn
          label="Batal"
          variant="ghost"
          onPress={onClose}
          testID={testID ? `${testID}-cancel` : undefined}
          style={{ flex: 1 }}
        />
        <Btn
          label={confirmLabel}
          variant={destructive ? "danger" : "primary"}
          onPress={onConfirm}
          testID={testID ? `${testID}-confirm` : undefined}
          style={{ flex: 1 }}
        />
      </View>
    </Sheet>
  );
}
