import { Text, View } from "react-native";
import { FONT } from "@/src/fonts";
import { rupiah } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  chart: { flexDirection: "row", alignItems: "flex-end", height: 160, gap: 6 },
  col: { flex: 1, alignItems: "center", gap: 6 },
  bars: { flex: 1, flexDirection: "row", alignItems: "flex-end", gap: 3, width: "100%", justifyContent: "center" },
  bar: { width: 12, borderRadius: 6, minHeight: 3 },
  colLabel: { color: c.muted, fontFamily: FONT.textMed, fontSize: 11 },
  colLabelActive: { color: c.brandPrimary, fontFamily: FONT.textSemi },
  legend: { flexDirection: "row", gap: 16, marginTop: 12 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: c.onSurfaceSecondary, fontFamily: FONT.text, fontSize: 12 },
  baseline: { height: 1, backgroundColor: c.divider, width: "100%" },
  catRow: { gap: 6, paddingVertical: 8 },
  catHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  catLabel: { color: c.onSurface, fontFamily: FONT.textSemi, fontSize: 14 },
  catValue: { color: c.onSurfaceSecondary, fontFamily: FONT.textMed, fontSize: 13 },
  catPct: { color: c.muted, fontFamily: FONT.text, fontSize: 12 },
  track: { height: 8, borderRadius: 4, backgroundColor: c.surfaceTertiary, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4, backgroundColor: c.brandPrimary },
}));

export type MonthPoint = { month: string; label: string; income: number; expense: number };

export function MonthlyBars({ data, active }: { data: MonthPoint[]; active: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const top = Math.max(1, ...data.map((d) => Math.max(d.income, d.expense)));
  const maxH = 120;
  return (
    <View testID="chart-monthly">
      <View style={styles.chart}>
        {data.map((d) => (
          <View key={d.month} style={styles.col} testID={`chart-col-${d.month}`}>
            <View style={styles.bars}>
              <View
                style={[
                  styles.bar,
                  { height: Math.max(3, (d.income / top) * maxH), backgroundColor: colors.success },
                ]}
              />
              <View
                style={[
                  styles.bar,
                  { height: Math.max(3, (d.expense / top) * maxH), backgroundColor: colors.error },
                ]}
              />
            </View>
            <View style={styles.baseline} />
            <Text style={[styles.colLabel, d.month === active && styles.colLabelActive]}>{d.label}</Text>
          </View>
        ))}
      </View>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
          <Text style={styles.legendText}>Masuk</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.error }]} />
          <Text style={styles.legendText}>Keluar</Text>
        </View>
      </View>
    </View>
  );
}

export function CategoryBars({
  data,
}: {
  data: { category: string; label: string; total: number; pct: number }[];
}) {
  const styles = useStyles();
  const top = Math.max(1, ...data.map((d) => d.total));
  return (
    <View testID="chart-categories">
      {data.map((d) => (
        <View key={d.category} style={styles.catRow} testID={`chart-cat-${d.category}`}>
          <View style={styles.catHead}>
            <Text style={styles.catLabel}>{d.label}</Text>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "baseline" }}>
              <Text style={styles.catValue}>{rupiah(d.total)}</Text>
              <Text style={styles.catPct}>{d.pct}%</Text>
            </View>
          </View>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.max(2, (d.total / top) * 100)}%` }]} />
          </View>
        </View>
      ))}
    </View>
  );
}
