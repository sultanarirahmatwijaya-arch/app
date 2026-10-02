import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { api, type Account, type Transaction } from "@/src/api";
import { CATEGORIES_IN, CATEGORIES_OUT } from "@/src/categories";
import {
  dayLabel,
  groupDigits,
  parseDigits,
  rupiah,
  shiftYMD,
  todayYMD,
} from "@/src/format";
import { FONT } from "@/src/fonts";
import { makeStyles, useTheme } from "@/src/theme";
import { Btn, Chip, Icon, Screen, SectionLabel } from "@/src/components/ui";
import { useToast } from "@/src/components/toast";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "000", "0", "del"];

const useStyles = makeStyles((c) => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  title: { color: c.onSurface, fontFamily: FONT.display, fontSize: 22 },
  scroll: { paddingHorizontal: 24, gap: 16 },
  toggle: {
    flexDirection: "row",
    backgroundColor: c.surfaceTertiary,
    borderRadius: 999,
    padding: 4,
    gap: 4,
  },
  toggleBtn: { flex: 1, height: 44, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  toggleText: { fontFamily: FONT.textSemi, fontSize: 15 },
  amountLabel: { marginBottom: 4 },
  amountText: { fontFamily: FONT.display, fontSize: 44 },
  amountHint: { color: c.muted, fontFamily: FONT.text, fontSize: 12 },
  chipRow: { height: 56, alignItems: "center" },
  chipContent: { gap: 8, paddingHorizontal: 24, alignItems: "center" },
  chipLabel: { color: c.onSurfaceSecondary, fontFamily: FONT.textSemi, fontSize: 13 },
  noteInput: {
    backgroundColor: c.surfaceSecondary,
    borderWidth: 1,
    borderColor: c.divider,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: c.onSurface,
    fontFamily: FONT.text,
    marginTop: 8,
  },
  dateRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 20 },
  dateArrow: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  dateText: { color: c.onSurface, fontFamily: FONT.textSemi, fontSize: 14 },
  keypad: { gap: 10, paddingHorizontal: 24 },
  keyRow: { flexDirection: "row", gap: 10 },
  key: {
    flex: 1,
    height: 64,
    borderRadius: 14,
    backgroundColor: c.surfaceSecondary,
    borderWidth: 1,
    borderColor: c.divider,
    alignItems: "center",
    justifyContent: "center",
  },
  keyText: { color: c.onSurface, fontFamily: FONT.textSemi, fontSize: 22 },
  saveBtn: { marginHorizontal: 24, marginBottom: 8, height: 54 },
}));

export default function CatatScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<"in" | "out">("out");
  const [digits, setDigits] = useState("");
  const [catId, setCatId] = useState("belanja");
  const [note, setNote] = useState("");
  const [sourceId, setSourceId] = useState("cash");
  const [dayOffset, setDayOffset] = useState(0);

  const cats = mode === "in" ? CATEGORIES_IN : CATEGORIES_OUT;
  const dateStr = shiftYMD(todayYMD(), -dayOffset);

  useEffect(() => {
    setCatId((mode === "in" ? CATEGORIES_IN : CATEGORIES_OUT)[0].id);
  }, [mode]);

  const accounts = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api<Account[]>("/accounts"),
  });

  const amount = parseDigits(digits);

  const pressKey = (k: string) => {
    Haptics.selectionAsync().catch(() => {});
    if (k === "del") {
      setDigits((d) => d.slice(0, -1));
      return;
    }
    setDigits((d) => (d === "" && k === "0" ? "" : (d + k).slice(0, 12)));
  };

  const saveMut = useMutation({
    mutationFn: () =>
      api<Transaction>("/transactions", {
        method: "POST",
        body: {
          type: mode,
          amount,
          category: catId,
          note: note.trim(),
          source_type: sourceId === "cash" ? "cash" : "account",
          account_id: sourceId === "cash" ? null : sourceId,
          date: dateStr,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast.show(mode === "in" ? "Uang masuk tercatat" : "Uang keluar tercatat");
      router.back();
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const save = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (amount <= 0) {
      toast.show("Isi nominal dulu ya", "error");
      return;
    }
    saveMut.mutate();
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <Pressable testID="catat-close-button" onPress={() => router.back()} style={styles.dateArrow}>
            <Icon name="close" size={22} color={colors.onSurfaceSecondary} />
          </Pressable>
          <Text style={styles.title}>Catat Keuangan</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView
          contentContainerStyle={{ ...styles.scroll, paddingVertical: 16 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.toggle} testID="catat-type-toggle">
            <Pressable
              testID="catat-type-in"
              onPress={() => setMode("in")}
              style={[
                styles.toggleBtn,
                { backgroundColor: mode === "in" ? colors.success : "transparent" },
              ]}
            >
              <Text
                style={[
                  styles.toggleText,
                  { color: mode === "in" ? colors.onSuccess : colors.onSurfaceTertiary },
                ]}
              >
                Uang Masuk
              </Text>
            </Pressable>
            <Pressable
              testID="catat-type-out"
              onPress={() => setMode("out")}
              style={[
                styles.toggleBtn,
                { backgroundColor: mode === "out" ? colors.error : "transparent" },
              ]}
            >
              <Text
                style={[
                  styles.toggleText,
                  { color: mode === "out" ? colors.onError : colors.onSurfaceTertiary },
                ]}
              >
                Uang Keluar
              </Text>
            </Pressable>
          </View>

          <View>
            <Text style={styles.amountLabel}>NOMINAL</Text>
            <Text
              style={[styles.amountText, { color: digits ? colors.onSurface : colors.muted }]}
              testID="catat-amount-display"
            >
              {digits ? `Rp${groupDigits(amount)}` : "Rp0"}
            </Text>
            <Text style={styles.amountHint}>
              {dateStr === todayYMD()
                ? "Tercatat untuk hari ini"
                : `Tercatat untuk ${dayLabel(dateStr)}`}
            </Text>
          </View>

          <View>
            <Text style={styles.chipLabel}>KATEGORI</Text>
            <View style={styles.chipRow}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipContent}
              >
                {cats.map((cat) => (
                  <Chip
                    key={cat.id}
                    label={cat.label}
                    icon={cat.icon}
                    active={catId === cat.id}
                    onPress={() => setCatId(cat.id)}
                    testID={`catat-category-${cat.id}`}
                  />
                ))}
              </ScrollView>
            </View>
          </View>

          <View>
            <Text style={styles.chipLabel}>KETERANGAN</Text>
            <TextInput
              style={styles.noteInput}
              value={note}
              onChangeText={setNote}
              placeholder="mis. Beli beras 5 kg (opsional)"
              placeholderTextColor={colors.muted}
              testID="catat-note-input"
              maxLength={200}
            />
          </View>

          <View>
            <Text style={styles.chipLabel}>SUMBER UANG</Text>
            <View style={styles.chipRow}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipContent}
              >
                <Chip
                  label="Tunai"
                  icon="cash-outline"
                  active={sourceId === "cash"}
                  onPress={() => setSourceId("cash")}
                  testID="catat-source-cash"
                />
                {(accounts.data ?? []).map((a) => (
                  <Chip
                    key={a.id}
                    label={a.name}
                    icon={a.kind === "bank" ? "business-outline" : a.kind === "ewallet" ? "wallet-outline" : "cash-outline"}
                    active={sourceId === a.id}
                    onPress={() => setSourceId(a.id)}
                    testID={`catat-source-${a.id}`}
                  />
                ))}
              </ScrollView>
            </View>
          </View>

          <View style={styles.dateRow}>
            <Pressable
              testID="catat-date-prev"
              style={styles.dateArrow}
              onPress={() => setDayOffset((d) => Math.min(d + 1, 365))}
            >
              <Icon name="chevron-back" size={18} color={colors.onSurfaceSecondary} />
            </Pressable>
            <Text style={styles.dateText} testID="catat-date-label">
              {dayLabel(dateStr)}
            </Text>
            <Pressable
              testID="catat-date-next"
              style={[styles.dateArrow, dayOffset === 0 && { opacity: 0.4 }]}
              onPress={() => setDayOffset((d) => Math.max(d - 1, 0))}
              disabled={dayOffset === 0}
            >
              <Icon name="chevron-forward" size={18} color={colors.onSurfaceSecondary} />
            </Pressable>
          </View>
        </ScrollView>

        <View style={{ paddingBottom: insets.bottom + 12, gap: 12 }}>
          <View style={styles.keypad}>
            {[0, 1, 2, 3].map((row) => (
              <View key={row} style={styles.keyRow}>
                {KEYS.slice(row * 3, row * 3 + 3).map((k) => (
                  <Pressable
                    key={k}
                    testID={k === "del" ? "catat-keypad-backspace" : `catat-keypad-${k}`}
                    style={({ pressed }) => [styles.key, pressed && { opacity: 0.6 }]}
                    onPress={() => pressKey(k)}
                  >
                    {k === "del" ? (
                      <Icon name="backspace-outline" size={24} color={colors.onSurface} />
                    ) : (
                      <Text style={styles.keyText}>{k}</Text>
                    )}
                  </Pressable>
                ))}
              </View>
            ))}
          </View>
          <Btn
            label="Simpan Transaksi"
            testID="catat-save-button"
            onPress={save}
            loading={saveMut.isPending}
            style={styles.saveBtn}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
