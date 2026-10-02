import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Goal } from "@/src/api";
import { FONT } from "@/src/fonts";
import { dateLabel, groupDigits, parseDigits, rupiah, todayYMD } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";
import { Btn, Card, Chip, Field, Icon, SectionLabel } from "@/src/components/ui";
import { ConfirmSheet, Sheet } from "@/src/components/sheet";
import { useToast } from "@/src/components/toast";

const useStyles = makeStyles((c) => ({
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: c.onSurface, fontFamily: FONT.display, fontSize: 18 },
  amounts: { flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 10 },
  saved: { color: c.brandPrimary, fontFamily: FONT.textBold, fontSize: 20 },
  target: { color: c.muted, fontFamily: FONT.text, fontSize: 13 },
  track: { height: 12, borderRadius: 6, backgroundColor: c.surfaceTertiary, overflow: "hidden", marginTop: 12 },
  fill: { height: 12, borderRadius: 6, backgroundColor: c.brandPrimary },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 },
  meta: { color: c.onSurfaceSecondary, fontFamily: FONT.text, fontSize: 12 },
  metaStrong: { color: c.onSurface, fontFamily: FONT.textSemi, fontSize: 12 },
  tip: {
    marginTop: 12,
    backgroundColor: c.brandTertiary,
    borderRadius: 14,
    padding: 12,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  tipText: { color: c.onBrandTertiary, fontFamily: FONT.textMed, fontSize: 13, flex: 1, lineHeight: 18 },
  emptyWrap: { alignItems: "center", gap: 8, paddingVertical: 8 },
  emptyTitle: { color: c.onSurface, fontFamily: FONT.textSemi, fontSize: 15 },
  emptySub: { color: c.muted, fontFamily: FONT.text, fontSize: 13, textAlign: "center", lineHeight: 19 },
  chipRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 16 },
}));

function addMonths(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Accepts DD/MM/YYYY or DD-MM-YYYY, returns YYYY-MM-DD or null.
function parseIndoDate(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const dd = Number(d);
  const mm = Number(mo);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return `${y}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

function toIndoDate(ymd: string | null): string {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

export function GoalCard() {
  const styles = useStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const queryClient = useQueryClient();
  const goal = useQuery({ queryKey: ["goal"], queryFn: () => api<Goal>("/goal") });

  const [sheet, setSheet] = useState(false);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [dateText, setDateText] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const openSheet = () => {
    const g = goal.data;
    setTitle(g?.set ? g.title : "Tabungan Nikah");
    setAmount(g?.set ? groupDigits(g.target_amount) : "");
    setDateText(toIndoDate(g?.target_date ?? null));
    setSheet(true);
  };

  const saveMut = useMutation({
    mutationFn: () => {
      const target_date = dateText.trim() ? parseIndoDate(dateText) : null;
      if (dateText.trim() && !target_date) {
        throw new Error("Format tanggal: HH/BB/TTTT, mis. 12/06/2027");
      }
      if (target_date && target_date <= todayYMD()) {
        throw new Error("Tanggal target harus di masa depan");
      }
      return api<Goal>("/goal", {
        method: "PUT",
        body: { title: title.trim() || "Tabungan Nikah", target_amount: parseDigits(amount), target_date },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goal"] });
      setSheet(false);
      toast.show("Target tabungan tersimpan");
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const deleteMut = useMutation({
    mutationFn: () => api("/goal", { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goal"] });
      setConfirmDelete(false);
      setSheet(false);
      toast.show("Target dihapus");
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const g = goal.data;
  const pct = g?.set ? Math.round(g.progress * 100) : 0;
  const reached = g?.set && g.remaining === 0;

  return (
    <>
      <Card testID="goal-card">
        <View style={styles.head}>
          <SectionLabel>Target Tabungan</SectionLabel>
          {g?.set ? (
            <Pressable testID="goal-edit-button" onPress={openSheet} hitSlop={8}>
              <Icon name="create-outline" size={18} color={colors.brandPrimary} />
            </Pressable>
          ) : null}
        </View>

        {!g?.set ? (
          <View style={styles.emptyWrap}>
            <Icon name="flag-outline" size={28} color={colors.brandPrimary} />
            <Text style={styles.emptyTitle}>Belum ada target</Text>
            <Text style={styles.emptySub}>
              Tentukan target tabungan bersama, misalnya dana nikah, supaya makin semangat menabung.
            </Text>
            <Btn label="Atur Target" icon="flag-outline" variant="soft" testID="goal-set-button" onPress={openSheet} style={{ marginTop: 4 }} />
          </View>
        ) : (
          <>
            <Text style={styles.title} testID="goal-title">{g.title}</Text>
            <View style={styles.amounts}>
              <Text style={styles.saved} testID="goal-saved">{rupiah(g.saved)}</Text>
              <Text style={styles.target}>dari {rupiah(g.target_amount)}</Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${Math.max(pct > 0 ? 2 : 0, pct)}%` }]} testID="goal-progress-fill" />
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaStrong} testID="goal-pct">{pct}% tercapai</Text>
              <Text style={styles.meta}>
                {reached ? "Target tercapai 🎉" : `Sisa ${rupiah(g.remaining)}`}
              </Text>
            </View>
            {g.target_date ? (
              <View style={styles.tip}>
                <Icon name={reached ? "sparkles-outline" : "calendar-outline"} size={20} color={colors.brandPrimary} />
                <Text style={styles.tipText} testID="goal-tip">
                  {reached
                    ? `Selamat! Target ${g.title} sudah tercapai sebelum ${dateLabel(g.target_date)}.`
                    : g.days_left === 0
                      ? `Hari target (${dateLabel(g.target_date)}) sudah tiba. Sisa ${rupiah(g.remaining)}.`
                      : `Menuju ${dateLabel(g.target_date)} (${g.months_left} bulan lagi). Nabung sekitar ${rupiah(
                          g.monthly_needed ?? 0,
                        )} per bulan ya.`}
                </Text>
              </View>
            ) : null}
          </>
        )}
      </Card>

      <Sheet visible={sheet} onClose={() => setSheet(false)} title="Target Tabungan Bersama" testID="goal-sheet">
        <Field
          label="Nama target"
          testID="goal-title-input"
          value={title}
          onChangeText={setTitle}
          placeholder="mis. Tabungan Nikah"
        />
        <Field
          label="Nominal target (Rp)"
          testID="goal-amount-input"
          value={amount}
          onChangeText={(v) => setAmount(v ? groupDigits(parseDigits(v)) : "")}
          keyboardType="number-pad"
          placeholder="mis. 50.000.000"
        />
        <Field
          label="Tanggal target (opsional)"
          testID="goal-date-input"
          value={dateText}
          onChangeText={setDateText}
          keyboardType="numbers-and-punctuation"
          placeholder="HH/BB/TTTT, mis. 12/06/2027"
          hint="Dipakai untuk menghitung saran nabung per bulan."
        />
        <View style={styles.chipRow}>
          {[
            { l: "6 bulan", m: 6 },
            { l: "1 tahun", m: 12 },
            { l: "2 tahun", m: 24 },
          ].map((o) => (
            <Chip
              key={o.m}
              label={o.l}
              active={false}
              testID={`goal-quick-${o.m}`}
              onPress={() => setDateText(toIndoDate(addMonths(o.m)))}
            />
          ))}
        </View>
        <Btn
          label="Simpan Target"
          testID="goal-save-button"
          onPress={() => {
            if (parseDigits(amount) <= 0) {
              toast.show("Isi nominal target dulu", "error");
              return;
            }
            saveMut.mutate();
          }}
          loading={saveMut.isPending}
        />
        {g?.set ? (
          <Btn
            label="Hapus Target"
            variant="ghost"
            testID="goal-delete-button"
            onPress={() => setConfirmDelete(true)}
            style={{ marginTop: 10 }}
          />
        ) : null}
      </Sheet>

      <ConfirmSheet
        visible={confirmDelete}
        title="Hapus target?"
        message="Target tabungan akan dihapus. Catatan transaksi tetap aman."
        onConfirm={() => deleteMut.mutate()}
        onClose={() => setConfirmDelete(false)}
        testID="goal-delete-confirm"
      />
    </>
  );
}
