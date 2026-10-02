import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, type Account } from "@/src/api";
import { groupDigits, parseDigits, rupiah } from "@/src/format";
import { FONT } from "@/src/fonts";
import { makeStyles, useTheme } from "@/src/theme";
import { Btn, Card, Chip, EmptyState, Field, Icon, Screen, SectionLabel } from "@/src/components/ui";
import { ConfirmSheet, Sheet } from "@/src/components/sheet";
import { useToast } from "@/src/components/toast";

type Kind = "bank" | "cash" | "ewallet";

const KINDS: { id: Kind; label: string; icon: string }[] = [
  { id: "bank", label: "Bank", icon: "business-outline" },
  { id: "cash", label: "Tunai", icon: "cash-outline" },
  { id: "ewallet", label: "E-Wallet", icon: "wallet-outline" },
];

const useStyles = makeStyles((c) => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 8,
  },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  title: { color: c.onSurface, fontFamily: FONT.display, fontSize: 22, flex: 1 },
  scroll: { paddingHorizontal: 24, gap: 12 },
  accountCard: { gap: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: c.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  accName: { color: c.onSurface, fontFamily: FONT.textSemi, fontSize: 15 },
  accSub: { color: c.muted, fontFamily: FONT.text, fontSize: 12, marginTop: 2 },
  accBalance: { color: c.onSurface, fontFamily: FONT.textBold, fontSize: 15 },
  kindRow: { flexDirection: "row", gap: 8, marginBottom: 16, flexWrap: "wrap" },
}));

export default function RekeningScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();

  const accounts = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api<Account[]>("/accounts"),
  });

  const [sheet, setSheet] = useState<null | {
    id?: string;
    name: string;
    kind: Kind;
    bank_name: string;
    account_number: string;
    initial_balance: string;
  }>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const saveMut = useMutation({
    mutationFn: () => {
      if (!sheet) return Promise.resolve();
      const body = {
        name: sheet.name.trim(),
        kind: sheet.kind,
        bank_name: sheet.bank_name.trim(),
        account_number: sheet.account_number.trim(),
        initial_balance: parseDigits(sheet.initial_balance),
      };
      if (sheet.id) {
        return api(`/accounts/${sheet.id}`, { method: "PUT", body });
      }
      return api("/accounts", { method: "POST", body });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      setSheet(null);
      toast.show("Rekening tersimpan");
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const deleteMut = useMutation({
    mutationFn: () => api(`/accounts/${sheet?.id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      setConfirmDelete(false);
      setSheet(null);
      toast.show("Rekening dihapus");
    },
    onError: (e: Error) => {
      toast.show(e.message, "error");
      setConfirmDelete(false);
    },
  });

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable testID="rekening-back-button" style={styles.backBtn} onPress={() => router.back()}>
          <Icon name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Rekening &amp; Sumber Uang</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ ...styles.scroll, paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        {accounts.isLoading ? (
          <View style={{ alignItems: "center", paddingVertical: 40 }}>
            <Icon name="leaf-outline" size={36} color={colors.brandPrimary} />
          </View>
        ) : (accounts.data ?? []).length === 0 ? (
          <EmptyState
            icon="wallet-outline"
            title="Belum ada rekening"
            subtitle="Tambahkan rekening bank, dompet tunai, atau e-wallet untuk mendokumentasikan sumber uang."
          />
        ) : (
          (accounts.data ?? []).map((a) => (
            <Card
              key={a.id}
              testID={`rekening-item-${a.id}`}
              style={styles.accountCard}
            >
              <Pressable
                onPress={() =>
                  setSheet({
                    id: a.id,
                    name: a.name,
                    kind: a.kind,
                    bank_name: a.bank_name,
                    account_number: a.account_number,
                    initial_balance: a.initial_balance ? String(a.initial_balance) : "",
                  })
                }
                style={styles.row}
              >
                <View style={styles.iconWrap}>
                  <Icon
                    name={a.kind === "bank" ? "business-outline" : a.kind === "ewallet" ? "wallet-outline" : "cash-outline"}
                    size={22}
                    color={colors.brandPrimary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.accName}>{a.name}</Text>
                  <Text style={styles.accSub}>
                    {KINDS.find((k) => k.id === a.kind)?.label ?? a.kind}
                    {a.bank_name ? ` · ${a.bank_name}` : ""}
                    {a.account_number ? ` · ${a.account_number}` : ""}
                  </Text>
                </View>
                <Text style={styles.accBalance} testID={`rekening-balance-${a.id}`}>
                  {rupiah(a.balance)}
                </Text>
              </Pressable>
            </Card>
          ))
        )}

        <Btn
          label="Tambah Rekening"
          icon="add"
          testID="rekening-add-button"
          onPress={() =>
            setSheet({ name: "", kind: "bank", bank_name: "", account_number: "", initial_balance: "" })
          }
        />
      </ScrollView>

      <Sheet
        visible={sheet !== null}
        onClose={() => setSheet(null)}
        title={sheet?.id ? "Ubah Rekening" : "Tambah Rekening"}
        testID="rekening-sheet"
      >
        {sheet ? (
          <>
            <Field
              label="Nama rekening"
              testID="rekening-name-input"
              value={sheet.name}
              onChangeText={(v) => setSheet({ ...sheet, name: v })}
              placeholder="mis. BCA Utama / Dompet Tunai"
            />
            <View>
              <SectionLabel>Jenis</SectionLabel>
              <View style={styles.kindRow}>
                {KINDS.map((k) => (
                  <Chip
                    key={k.id}
                    label={k.label}
                    icon={k.icon}
                    active={sheet.kind === k.id}
                    onPress={() => setSheet({ ...sheet, kind: k.id })}
                    testID={`rekening-kind-${k.id}`}
                  />
                ))}
              </View>
            </View>
            {sheet.kind === "bank" ? (
              <Field
                label="Nama bank"
                testID="rekening-bank-input"
                value={sheet.bank_name}
                onChangeText={(v) => setSheet({ ...sheet, bank_name: v })}
                placeholder="mis. BCA"
              />
            ) : null}
            <Field
              label="Nomor rekening (opsional)"
              testID="rekening-number-input"
              keyboardType="number-pad"
              value={sheet.account_number}
              onChangeText={(v) => setSheet({ ...sheet, account_number: v.replace(/\D/g, "") })}
              placeholder="mis. 1234567890"
            />
            <Field
              label="Saldo awal (Rp)"
              testID="rekening-initial-input"
              keyboardType="number-pad"
              value={sheet.initial_balance ? groupDigits(parseDigits(sheet.initial_balance)) : ""}
              onChangeText={(v) => setSheet({ ...sheet, initial_balance: v.replace(/\D/g, "") })}
              hint="Uang yang sudah ada di rekening ini sebelum mulai dicatat."
            />
            <Btn
              label="Simpan"
              testID="rekening-save-button"
              onPress={() => {
                if (!sheet.name.trim()) {
                  toast.show("Isi nama rekening dulu", "error");
                  return;
                }
                saveMut.mutate();
              }}
              loading={saveMut.isPending}
            />
            {sheet.id ? (
              <Btn
                label="Hapus Rekening"
                variant="ghost"
                icon="trash-outline"
                testID="rekening-delete-button"
                onPress={() => setConfirmDelete(true)}
                style={{ marginTop: 8 }}
              />
            ) : null}
          </>
        ) : null}
      </Sheet>

      <ConfirmSheet
        visible={confirmDelete}
        title="Hapus Rekening?"
        message="Riwayat transaksi yang memakai rekening ini tetap tersimpan."
        onConfirm={() => deleteMut.mutate()}
        onClose={() => setConfirmDelete(false)}
        testID="rekening-delete-confirm"
      />
    </Screen>
  );
}
