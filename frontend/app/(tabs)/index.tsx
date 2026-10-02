import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, type Summary, type Transaction } from "@/src/api";
import { useAuth } from "@/src/auth";
import { FONT } from "@/src/fonts";
import { greeting, rupiah } from "@/src/format";
import { usesNativeTabs } from "@/src/navigation";
import { makeStyles, useTheme } from "@/src/theme";
import { Avatar, Btn, Card, EmptyState, Icon, Screen, SectionLabel } from "@/src/components/ui";
import { TxRow } from "@/src/components/tx-row";

const useStyles = makeStyles((c) => ({
  scroll: { paddingHorizontal: 24 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  greeting: { color: c.muted, fontFamily: FONT.text, fontSize: 13 },
  name: { color: c.onSurface, fontFamily: FONT.display, fontSize: 22, marginTop: 2 },
  balanceCard: {
    backgroundColor: c.brandPrimary,
    borderWidth: 0,
    padding: 20,
  },
  balanceLabel: {
    color: c.onBrandPrimary,
    fontFamily: FONT.textSemi,
    fontSize: 11,
    letterSpacing: 1.5,
    opacity: 0.8,
  },
  balanceValue: {
    color: c.onBrandPrimary,
    fontFamily: FONT.display,
    fontSize: 34,
    marginTop: 6,
  },
  membersRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14 },
  membersText: { color: c.onBrandPrimary, fontFamily: FONT.text, fontSize: 13, opacity: 0.9, flex: 1 },
  todayRow: { flexDirection: "row", gap: 12 },
  todayCard: { flex: 1, padding: 14 },
  todayLabelRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  todayLabel: { color: c.onSurfaceSecondary, fontFamily: FONT.text, fontSize: 12 },
  todayValue: { fontFamily: FONT.textBold, fontSize: 18, marginTop: 8 },
  catatBtn: { height: 56 },
  recentHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  seeAll: { color: c.brandPrimary, fontFamily: FONT.textSemi, fontSize: 13 },
  card: { paddingVertical: 4, paddingHorizontal: 16 },
}));

export default function HomeScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, book } = useAuth();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  const summary = useQuery({
    queryKey: ["summary"],
    queryFn: () => api<Summary>("/summary"),
  });
  const recent = useQuery({
    queryKey: ["transactions", "recent"],
    queryFn: () => api<Transaction[]>("/transactions?limit=6"),
  });

  const refreshing = summary.isFetching || recent.isFetching;
  const loading = summary.isLoading || recent.isLoading;
  const recentTx = recent.data ?? [];

  if (loading) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Icon name="leaf-outline" size={40} color={colors.brandPrimary} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ ...styles.scroll, paddingBottom: bottomChrome + 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              summary.refetch();
              recent.refetch();
            }}
            tintColor={colors.brandPrimary}
          />
        }
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{greeting()},</Text>
            <Text style={styles.name}>{user?.display_name ?? ""}</Text>
          </View>
          <Avatar name={user?.display_name} path={user?.avatar_path} size={44} testID="home-avatar" />
        </View>

        <Card style={styles.balanceCard} testID="home-balance-card">
          <Text style={styles.balanceLabel}>TOTAL TABUNGAN BERSAMA</Text>
          <Text style={styles.balanceValue}>{rupiah(summary.data?.balance ?? 0)}</Text>
          <View style={styles.membersRow}>
            {book?.members.slice(0, 2).map((m) => (
              <Avatar key={m.id} name={m.display_name} path={m.avatar_path} size={28} />
            ))}
            <Text style={styles.membersText} numberOfLines={1}>
              {book?.members.map((m) => m.display_name).join(" & ") ?? ""}
            </Text>
          </View>
        </Card>

        <View style={styles.todayRow}>
          <Card style={styles.todayCard} testID="home-today-in">
            <View style={styles.todayLabelRow}>
              <Icon name="arrow-down-outline" size={14} color={colors.success} />
              <Text style={styles.todayLabel}>Masuk hari ini</Text>
            </View>
            <Text style={[styles.todayValue, { color: colors.success }]}>
              {rupiah(summary.data?.today_in ?? 0)}
            </Text>
          </Card>
          <Card style={styles.todayCard} testID="home-today-out">
            <View style={styles.todayLabelRow}>
              <Icon name="arrow-up-outline" size={14} color={colors.error} />
              <Text style={styles.todayLabel}>Keluar hari ini</Text>
            </View>
            <Text style={[styles.todayValue, { color: colors.error }]}>
              {rupiah(summary.data?.today_out ?? 0)}
            </Text>
          </Card>
        </View>

        <Btn
          label="Catat Keuangan"
          icon="keypad-outline"
          testID="home-catat-button"
          onPress={() => router.push("/catat")}
          style={styles.catatBtn}
        />

        <View style={styles.recentHeader}>
          <SectionLabel>Transaksi Terakhir</SectionLabel>
          <Text
            style={styles.seeAll}
            onPress={() => router.push("/riwayat")}
            testID="home-see-all-link"
          >
            Lihat Semua
          </Text>
        </View>

        {recentTx.length === 0 ? (
          <EmptyState
            icon="journal-outline"
            title="Belum ada catatan"
            subtitle="Mulai catat uang masuk dan keluar pertama kalian di tombol Catat Keuangan."
          />
        ) : (
          <Card style={styles.card}>
            {recentTx.map((t) => (
              <TxRow key={t.id} t={t} onPress={() => router.push("/riwayat")} testID={`home-tx-${t.id}`} />
            ))}
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}
