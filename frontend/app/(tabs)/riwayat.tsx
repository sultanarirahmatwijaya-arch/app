import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, type Transaction } from "@/src/api";
import { categoryOf } from "@/src/categories";
import { dayLabel, rupiah, timeLabel } from "@/src/format";
import { FONT } from "@/src/fonts";
import { usesNativeTabs } from "@/src/navigation";
import { makeStyles, useTheme } from "@/src/theme";
import { Btn, Card, Chip, EmptyState, Icon, Screen, SectionLabel } from "@/src/components/ui";
import { ConfirmSheet, Sheet } from "@/src/components/sheet";
import { TxRow } from "@/src/components/tx-row";
import { useToast } from "@/src/components/toast";

type Filter = "all" | "in" | "out";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Semua" },
  { id: "in", label: "Masuk" },
  { id: "out", label: "Keluar" },
];

const useStyles = makeStyles((c) => ({
  header: { paddingHorizontal: 24, gap: 12 },
  title: { color: c.onSurface, fontFamily: FONT.display, fontSize: 26, marginTop: 8 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: c.surfaceTertiary,
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: { flex: 1, color: c.onSurface, fontFamily: FONT.text, fontSize: 14, paddingVertical: 0 },
  chipRow: { height: 56, alignItems: "center" },
  chipContent: { gap: 8, paddingHorizontal: 24, alignItems: "center" },
  list: { paddingHorizontal: 24, paddingBottom: 24, gap: 12 },
  groupHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6, paddingHorizontal: 4 },
  groupDate: { color: c.onSurface, fontFamily: FONT.textSemi, fontSize: 14 },
  groupSums: { color: c.muted, fontFamily: FONT.text, fontSize: 11 },
  card: { paddingVertical: 4, paddingHorizontal: 16 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, gap: 16 },
  detailLabel: { color: c.muted, fontFamily: FONT.text, fontSize: 13 },
  detailValue: { color: c.onSurface, fontFamily: FONT.textMed, fontSize: 13, textAlign: "right", flex: 1 },
}));

export default function RiwayatScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const queryClient = useQueryClient();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<Transaction | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const txs = useQuery({
    queryKey: ["transactions", "list", filter, q],
    queryFn: () => {
      const p = new URLSearchParams();
      if (filter !== "all") p.set("type", filter);
      if (q.trim()) p.set("q", q.trim());
      p.set("limit", "300");
      return api<Transaction[]>(`/transactions?${p.toString()}`);
    },
  });

  const delMut = useMutation({
    mutationFn: (id: string) => api(`/transactions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["goal"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      toast.show("Transaksi dihapus");
      setDetail(null);
      setConfirmDelete(false);
    },
    onError: (e: Error) => {
      toast.show(e.message, "error");
      setConfirmDelete(false);
    },
  });

  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of txs.data ?? []) {
      const arr = map.get(t.date) ?? [];
      arr.push(t);
      map.set(t.date, arr);
    }
    return Array.from(map.entries()).map(([date, items]) => {
      const inSum = items.filter((t) => t.type === "in").reduce((s, t) => s + t.amount, 0);
      const outSum = items.filter((t) => t.type === "out").reduce((s, t) => s + t.amount, 0);
      return { date, items, inSum, outSum };
    });
  }, [txs.data]);

  const detailCat = detail ? categoryOf(detail.category) : undefined;

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title} testID="riwayat-title">
          Riwayat &amp; Dokumentasi
        </Text>
        <View style={styles.searchRow}>
          <Icon name="search-outline" size={18} color={colors.muted} />
          <TextInput
            testID="riwayat-search-input"
            style={styles.searchInput}
            value={q}
            onChangeText={setQ}
            placeholder="Cari keterangan atau kategori…"
            placeholderTextColor={colors.muted}
            returnKeyType="search"
          />
        </View>
        <View style={styles.chipRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipContent}
          >
            {FILTERS.map((f) => (
              <Chip
                key={f.id}
                label={f.label}
                active={filter === f.id}
                onPress={() => setFilter(f.id)}
                testID={`riwayat-chip-${f.id}`}
              />
            ))}
          </ScrollView>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ ...styles.list, paddingBottom: bottomChrome + 24 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {txs.isLoading ? (
          <View style={{ alignItems: "center", paddingVertical: 40 }}>
            <Icon name="leaf-outline" size={36} color={colors.brandPrimary} />
          </View>
        ) : groups.length === 0 ? (
          <EmptyState
            icon="file-tray-outline"
            title="Tidak ada transaksi"
            subtitle="Belum ada catatan yang cocok dengan filter atau pencarian."
          />
        ) : (
          groups.map((g) => (
            <View key={g.date}>
              <View style={styles.groupHeader}>
                <Text style={styles.groupDate} testID={`riwayat-group-${g.date}`}>
                  {dayLabel(g.date)}
                </Text>
                <Text style={styles.groupSums}>
                  +{rupiah(g.inSum)} · −{rupiah(g.outSum)}
                </Text>
              </View>
              <Card style={styles.card}>
                {g.items.map((t) => (
                  <TxRow key={t.id} t={t} onPress={() => setDetail(t)} testID={`riwayat-tx-${t.id}`} />
                ))}
              </Card>
            </View>
          ))
        )}
      </ScrollView>

      <Sheet
        visible={detail !== null}
        onClose={() => setDetail(null)}
        title="Dokumentasi Transaksi"
        testID="riwayat-detail-sheet"
      >
        {detail ? (
          <View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Jenis</Text>
              <Text style={[styles.detailValue, { color: detail.type === "in" ? colors.success : colors.error }]}>
                {detail.type === "in" ? "Uang Masuk" : "Uang Keluar"}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Nominal</Text>
              <Text style={styles.detailValue}>{rupiah(detail.amount)}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Kategori</Text>
              <Text style={styles.detailValue}>{detailCat?.label ?? detail.category}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Keterangan</Text>
              <Text style={styles.detailValue}>{detail.note?.trim() || "—"}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Sumber</Text>
              <Text style={styles.detailValue}>
                {detail.source_type === "account" ? detail.account_name || "Rekening" : "Tunai"}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Tanggal</Text>
              <Text style={styles.detailValue}>
                {dayLabel(detail.date)} · {timeLabel(detail.created_at)}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Dicatat oleh</Text>
              <Text style={styles.detailValue}>{detail.created_by_name}</Text>
            </View>
            <Btn
              label="Hapus Transaksi"
              variant="danger"
              icon="trash-outline"
              testID="riwayat-delete-button"
              onPress={() => setConfirmDelete(true)}
              style={{ marginTop: 16 }}
            />
          </View>
        ) : null}
      </Sheet>

      <ConfirmSheet
        visible={confirmDelete}
        title="Hapus Transaksi?"
        message="Catatan ini akan disembunyikan dari buku tabungan dan rekap."
        onConfirm={() => detail && delMut.mutate(detail.id)}
        onClose={() => setConfirmDelete(false)}
        testID="riwayat-delete-confirm"
      />
    </Screen>
  );
}
