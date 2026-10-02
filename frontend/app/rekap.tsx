import { useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, type Stats } from "@/src/api";
import { useAuth } from "@/src/auth";
import { FONT } from "@/src/fonts";
import { monthLabel, rupiah } from "@/src/format";
import { openRecapPdf } from "@/src/pdf";
import { makeStyles, useTheme } from "@/src/theme";
import { Btn, Card, EmptyState, Icon, Screen, SectionLabel } from "@/src/components/ui";
import { CategoryBars, MonthlyBars } from "@/src/components/charts";
import { useToast } from "@/src/components/toast";

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
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: c.surfaceSecondary,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.divider,
    paddingHorizontal: 6,
    height: 48,
  },
  navBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  monthText: { color: c.onSurface, fontFamily: FONT.textSemi, fontSize: 15 },
  statRow: { flexDirection: "row", gap: 12 },
  statCard: { flex: 1, padding: 14 },
  statLabel: { color: c.muted, fontFamily: FONT.text, fontSize: 12 },
  statValue: { fontFamily: FONT.textBold, fontSize: 17, marginTop: 6 },
  statSub: { color: c.muted, fontFamily: FONT.text, fontSize: 11, marginTop: 4 },
  netRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  netLabel: { color: c.onSurfaceSecondary, fontFamily: FONT.textMed, fontSize: 13 },
  netValue: { fontFamily: FONT.display, fontSize: 22 },
  pdfHint: { color: c.muted, fontFamily: FONT.text, fontSize: 12, lineHeight: 18 },
}));

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function RekapScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { token } = useAuth();
  const [month, setMonth] = useState(currentMonth());
  const isCurrent = month === currentMonth();

  const stats = useQuery({
    queryKey: ["stats", month],
    queryFn: () => api<Stats>(`/stats?month=${month}`),
  });

  const pdfMut = useMutation({
    mutationFn: (m: string) => openRecapPdf(m, token ?? ""),
    onError: (e: Error) => toast.show(e.message || "Gagal membuat PDF", "error"),
  });

  const s = stats.data;
  const net = (s?.month_in ?? 0) - (s?.month_out ?? 0);
  const hasAny = (s?.months ?? []).some((m) => m.income || m.expense);

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable testID="rekap-back-button" style={styles.backBtn} onPress={() => router.back()}>
          <Icon name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Rekap &amp; Grafik</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ ...styles.scroll, paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={stats.isFetching} onRefresh={() => stats.refetch()} tintColor={colors.brandPrimary} />
        }
      >
        <View style={styles.monthNav} testID="rekap-month-nav">
          <Pressable style={styles.navBtn} testID="rekap-prev-month" onPress={() => setMonth(shiftMonth(month, -1))}>
            <Icon name="chevron-back" size={20} color={colors.brandPrimary} />
          </Pressable>
          <Text style={styles.monthText} testID="rekap-month-label">{monthLabel(month)}</Text>
          <Pressable
            style={[styles.navBtn, isCurrent && { opacity: 0.3 }]}
            testID="rekap-next-month"
            disabled={isCurrent}
            onPress={() => setMonth(shiftMonth(month, 1))}
          >
            <Icon name="chevron-forward" size={20} color={colors.brandPrimary} />
          </Pressable>
        </View>

        {stats.isLoading ? (
          <View style={{ paddingVertical: 48, alignItems: "center" }}>
            <ActivityIndicator color={colors.brandPrimary} />
          </View>
        ) : (
          <>
            <View style={styles.statRow}>
              <Card style={styles.statCard} testID="rekap-month-in">
                <Text style={styles.statLabel}>Masuk bulan ini</Text>
                <Text style={[styles.statValue, { color: colors.success }]}>{rupiah(s?.month_in ?? 0)}</Text>
                <Text style={styles.statSub}>rata-rata {rupiah(s?.avg_in ?? 0)}</Text>
              </Card>
              <Card style={styles.statCard} testID="rekap-month-out">
                <Text style={styles.statLabel}>Keluar bulan ini</Text>
                <Text style={[styles.statValue, { color: colors.error }]}>{rupiah(s?.month_out ?? 0)}</Text>
                <Text style={styles.statSub}>rata-rata {rupiah(s?.avg_out ?? 0)}</Text>
              </Card>
            </View>

            <Card style={styles.netRow} testID="rekap-net">
              <Text style={styles.netLabel}>{net >= 0 ? "Berhasil ditabung" : "Lebih besar pasak"}</Text>
              <Text style={[styles.netValue, { color: net >= 0 ? colors.brandPrimary : colors.error }]}>
                {rupiah(net)}
              </Text>
            </Card>

            <Card testID="rekap-trend-card">
              <SectionLabel>Tren 6 Bulan Terakhir</SectionLabel>
              {hasAny ? (
                <MonthlyBars data={s?.months ?? []} active={month} />
              ) : (
                <EmptyState
                  icon="bar-chart-outline"
                  title="Belum ada data"
                  subtitle="Grafik muncul setelah ada catatan pemasukan atau pengeluaran."
                />
              )}
            </Card>

            <Card testID="rekap-category-card">
              <SectionLabel>Pengeluaran per Kategori</SectionLabel>
              {(s?.categories ?? []).length ? (
                <CategoryBars data={s?.categories ?? []} />
              ) : (
                <EmptyState
                  icon="pie-chart-outline"
                  title="Belum ada pengeluaran"
                  subtitle={`Tidak ada pengeluaran tercatat di ${monthLabel(month)}.`}
                />
              )}
            </Card>

            <Card style={{ gap: 10 }} testID="rekap-pdf-card">
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Icon name="document-text-outline" size={22} color={colors.brandPrimary} />
                <Text style={{ color: colors.onSurface, fontFamily: FONT.textSemi, fontSize: 15, flex: 1 }}>
                  Rekap PDF
                </Text>
              </View>
              <Text style={styles.pdfHint}>
                Rekap cantik berisi ringkasan, grafik kategori, dan daftar transaksi lengkap. Bisa dibagikan ke pasangan
                atau dicetak.
              </Text>
              <Btn
                label={`PDF ${monthLabel(month)}`}
                icon="download-outline"
                testID="rekap-pdf-month-button"
                onPress={() => pdfMut.mutate(month)}
                loading={pdfMut.isPending && pdfMut.variables === month}
              />
              <Btn
                label="PDF Semua Waktu"
                icon="albums-outline"
                variant="soft"
                testID="rekap-pdf-all-button"
                onPress={() => pdfMut.mutate("all")}
                loading={pdfMut.isPending && pdfMut.variables === "all"}
              />
            </Card>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
