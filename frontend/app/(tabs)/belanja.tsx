import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, type ShoppingPlan } from "@/src/api";
import { groupDigits, monthLabel, parseDigits, rupiah } from "@/src/format";
import { FONT } from "@/src/fonts";
import { usesNativeTabs } from "@/src/navigation";
import { makeStyles, useTheme } from "@/src/theme";
import { Btn, Card, EmptyState, Field, Icon, Screen, SectionLabel } from "@/src/components/ui";
import { ConfirmSheet, Sheet } from "@/src/components/sheet";
import { useToast } from "@/src/components/toast";

const useStyles = makeStyles((c) => ({
  scroll: { paddingHorizontal: 24, gap: 12 },
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  monthArrow: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: c.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  monthText: { color: c.onSurface, fontFamily: FONT.display, fontSize: 22 },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: c.surfaceTertiary,
    marginTop: 12,
    overflow: "hidden",
  },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: c.brandPrimary },
  summaryRow: { flexDirection: "row", gap: 12, marginTop: 12 },
  summaryItem: { flex: 1 },
  summaryLabel: { color: c.muted, fontFamily: FONT.text, fontSize: 12 },
  summaryValue: { color: c.onSurface, fontFamily: FONT.textBold, fontSize: 15, marginTop: 2 },
  countText: { color: c.onSurfaceSecondary, fontFamily: FONT.text, fontSize: 12, marginTop: 10 },
  planTitle: { color: c.onSurface, fontFamily: FONT.display, fontSize: 18 },
  planHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: c.divider,
  },
  check: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  itemName: { color: c.onSurface, fontFamily: FONT.textSemi, fontSize: 14, flex: 1 },
  itemSub: { color: c.muted, fontFamily: FONT.text, fontSize: 11, marginTop: 1 },
  itemPrice: { color: c.onSurface, fontFamily: FONT.textMed, fontSize: 13 },
  addItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: c.border,
    borderStyle: "dashed",
    borderRadius: 14,
    marginTop: 4,
  },
  addItemText: { color: c.brandPrimary, fontFamily: FONT.textSemi, fontSize: 13 },
  deletePlanBtn: { padding: 8 },
}));

function currentYm() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function BelanjaScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const queryClient = useQueryClient();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  const [ym, setYm] = useState(currentYm);
  const plans = useQuery({
    queryKey: ["shopping", ym],
    queryFn: () => api<ShoppingPlan[]>(`/shopping?month=${ym}`),
  });

  const [planSheet, setPlanSheet] = useState(false);
  const [planTitle, setPlanTitle] = useState("");
  const [itemSheet, setItemSheet] = useState<null | {
    planId: string;
    itemId?: string;
    name: string;
    qty: string;
    est: string;
    actual: string;
  }>(null);
  const [confirm, setConfirm] = useState<null | { kind: "plan" | "item"; planId: string; itemId?: string; label: string }>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["shopping"] });

  const createPlanMut = useMutation({
    mutationFn: () => api("/shopping", { method: "POST", body: { month: ym, title: planTitle.trim() } }),
    onSuccess: () => {
      invalidate();
      setPlanSheet(false);
      setPlanTitle("");
      toast.show("Rencana belanja dibuat");
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const saveItemMut = useMutation({
    mutationFn: () => {
      if (!itemSheet) return Promise.resolve();
      const body = {
        name: itemSheet.name.trim(),
        qty: Math.max(1, parseDigits(itemSheet.qty) || 1),
        est_price: parseDigits(itemSheet.est),
      };
      if (itemSheet.itemId) {
        const actual = parseDigits(itemSheet.actual);
        return api(`/shopping/${itemSheet.planId}/items/${itemSheet.itemId}`, {
          method: "PUT",
          body: { ...body, ...(actual > 0 ? { actual_price: actual } : {}) },
        });
      }
      return api(`/shopping/${itemSheet.planId}/items`, { method: "POST", body });
    },
    onSuccess: () => {
      invalidate();
      setItemSheet(null);
      toast.show("Barang tersimpan");
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const toggleMut = useMutation({
    mutationFn: ({ planId, itemId, done, est, actual }: { planId: string; itemId: string; done: boolean; est: number; actual: number }) =>
      api(`/shopping/${planId}/items/${itemId}`, {
        method: "PUT",
        body: { done, ...(done && !actual ? { actual_price: est } : {}) },
      }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const deleteMut = useMutation({
    mutationFn: () => {
      if (!confirm) return Promise.resolve();
      if (confirm.kind === "plan") {
        return api(`/shopping/${confirm.planId}`, { method: "DELETE" });
      }
      return api(`/shopping/${confirm.planId}/items/${confirm.itemId}`, { method: "DELETE" });
    },
    onSuccess: () => {
      invalidate();
      setConfirm(null);
      toast.show("Dihapus");
    },
    onError: (e: Error) => {
      toast.show(e.message, "error");
      setConfirm(null);
    },
  });

  const totals = useMemo(() => {
    let est = 0;
    let actual = 0;
    let done = 0;
    let count = 0;
    for (const p of plans.data ?? []) {
      for (const i of p.items) {
        est += i.est_price;
        actual += i.done ? i.actual_price || i.est_price : 0;
        if (i.done) done += 1;
        count += 1;
      }
    }
    return { est, actual, done, count };
  }, [plans.data]);

  const pct = totals.est > 0 ? Math.min(100, Math.round((totals.actual / totals.est) * 100)) : 0;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ ...styles.scroll, paddingBottom: bottomChrome + 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.monthNav}>
          <Pressable
            testID="belanja-month-prev"
            style={styles.monthArrow}
            onPress={() => setYm(shiftMonth(ym, -1))}
          >
            <Icon name="chevron-back" size={20} color={colors.onSurfaceSecondary} />
          </Pressable>
          <Text style={styles.monthText} testID="belanja-month-label">
            {monthLabel(ym)}
          </Text>
          <Pressable
            testID="belanja-month-next"
            style={styles.monthArrow}
            onPress={() => setYm(shiftMonth(ym, 1))}
          >
            <Icon name="chevron-forward" size={20} color={colors.onSurfaceSecondary} />
          </Pressable>
        </View>

        {(plans.data ?? []).length > 0 ? (
          <Card testID="belanja-summary-card">
            <SectionLabel>Rincian Belanja {monthLabel(ym)}</SectionLabel>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Estimasi</Text>
                <Text style={styles.summaryValue} testID="belanja-total-est">
                  {rupiah(totals.est)}
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Sudah terbeli</Text>
                <Text style={styles.summaryValue} testID="belanja-total-actual">
                  {rupiah(totals.actual)}
                </Text>
              </View>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${pct}%` }]} />
            </View>
            <Text style={styles.countText} testID="belanja-count-text">
              {totals.done} dari {totals.count} barang selesai ({pct}%)
            </Text>
          </Card>
        ) : null}

        {plans.isLoading ? (
          <View style={{ alignItems: "center", paddingVertical: 40 }}>
            <Icon name="leaf-outline" size={36} color={colors.brandPrimary} />
          </View>
        ) : (plans.data ?? []).length === 0 ? (
          <EmptyState
            icon="cart-outline"
            title="Belum ada rencana belanja"
            subtitle="Susun daftar kebutuhan rumah untuk bulan ini, misalnya beras, sabun, dan minyak."
          />
        ) : (
          (plans.data ?? []).map((plan) => (
            <Card key={plan.id} testID={`belanja-plan-${plan.id}`}>
              <View style={styles.planHead}>
                <Text style={styles.planTitle}>{plan.title}</Text>
                <Pressable
                  testID={`belanja-delete-plan-${plan.id}`}
                  style={styles.deletePlanBtn}
                  onPress={() => setConfirm({ kind: "plan", planId: plan.id, label: plan.title })}
                >
                  <Icon name="trash-outline" size={18} color={colors.error} />
                </Pressable>
              </View>
              {plan.items.map((item) => (
                <View key={item.id} style={styles.itemRow}>
                  <Pressable
                    testID={`belanja-item-check-${item.id}`}
                    style={styles.check}
                    onPress={() =>
                      toggleMut.mutate({
                        planId: plan.id,
                        itemId: item.id,
                        done: !item.done,
                        est: item.est_price,
                        actual: item.actual_price,
                      })
                    }
                  >
                    <Icon
                      name={item.done ? "checkmark-circle" : "ellipse-outline"}
                      size={24}
                      color={item.done ? colors.success : colors.borderStrong}
                    />
                  </Pressable>
                  <Pressable
                    style={{ flex: 1 }}
                    testID={`belanja-item-${item.id}`}
                    onPress={() =>
                      setItemSheet({
                        planId: plan.id,
                        itemId: item.id,
                        name: item.name,
                        qty: String(item.qty),
                        est: item.est_price ? String(item.est_price) : "",
                        actual: item.actual_price ? String(item.actual_price) : "",
                      })
                    }
                  >
                    <Text
                      style={[
                        styles.itemName,
                        item.done && { textDecorationLine: "line-through", color: colors.muted },
                      ]}
                    >
                      {item.name}
                      {item.qty > 1 ? ` · ${item.qty}x` : ""}
                    </Text>
                    <Text style={styles.itemSub}>
                      {item.done
                        ? `Terbeli ${rupiah(item.actual_price || item.est_price)}`
                        : "Perkiraan beli"}
                    </Text>
                  </Pressable>
                  <Text style={styles.itemPrice}>{rupiah(item.est_price)}</Text>
                </View>
              ))}
              <Pressable
                testID={`belanja-add-item-${plan.id}`}
                style={styles.addItem}
                onPress={() =>
                  setItemSheet({ planId: plan.id, name: "", qty: "1", est: "", actual: "" })
                }
              >
                <Icon name="add" size={18} color={colors.brandPrimary} />
                <Text style={styles.addItemText}>Tambah Barang</Text>
              </Pressable>
            </Card>
          ))
        )}

        <Btn
          label="Rencana Belanja Baru"
          icon="add"
          variant="soft"
          testID="belanja-add-plan-button"
          onPress={() => setPlanSheet(true)}
        />
      </ScrollView>

      <Sheet visible={planSheet} onClose={() => setPlanSheet(false)} title="Rencana Belanja Baru" testID="belanja-plan-sheet">
        <Field
          label={`Judul rencana untuk ${monthLabel(ym)}`}
          testID="belanja-plan-title-input"
          value={planTitle}
          onChangeText={setPlanTitle}
          placeholder="mis. Kebutuhan Rumah"
        />
        <Btn
          label="Buat Rencana"
          testID="belanja-plan-save-button"
          onPress={() => {
            if (!planTitle.trim()) {
              toast.show("Isi judul rencana dulu", "error");
              return;
            }
            createPlanMut.mutate();
          }}
          loading={createPlanMut.isPending}
        />
      </Sheet>

      <Sheet
        visible={itemSheet !== null}
        onClose={() => setItemSheet(null)}
        title={itemSheet?.itemId ? "Ubah Barang" : "Tambah Barang"}
        testID="belanja-item-sheet"
      >
        {itemSheet ? (
          <>
            <Field
              label="Nama barang"
              testID="belanja-item-name-input"
              value={itemSheet.name}
              onChangeText={(v) => setItemSheet({ ...itemSheet, name: v })}
              placeholder="mis. Beras 5 kg"
            />
            <Field
              label="Jumlah"
              testID="belanja-item-qty-input"
              keyboardType="number-pad"
              value={itemSheet.qty}
              onChangeText={(v) => setItemSheet({ ...itemSheet, qty: v.replace(/\D/g, "") })}
            />
            <Field
              label="Perkiraan harga (Rp)"
              testID="belanja-item-est-input"
              keyboardType="number-pad"
              value={itemSheet.est ? groupDigits(parseDigits(itemSheet.est)) : ""}
              onChangeText={(v) => setItemSheet({ ...itemSheet, est: v.replace(/\D/g, "") })}
            />
            {itemSheet.itemId ? (
              <Field
                label="Harga aktual saat dibeli (Rp)"
                testID="belanja-item-actual-input"
                keyboardType="number-pad"
                value={itemSheet.actual ? groupDigits(parseDigits(itemSheet.actual)) : ""}
                onChangeText={(v) => setItemSheet({ ...itemSheet, actual: v.replace(/\D/g, "") })}
                hint="Kosongkan bila sama dengan perkiraan."
              />
            ) : null}
            <Btn
              label="Simpan Barang"
              testID="belanja-item-save-button"
              onPress={() => {
                if (!itemSheet.name.trim()) {
                  toast.show("Isi nama barang dulu", "error");
                  return;
                }
                saveItemMut.mutate();
              }}
              loading={saveItemMut.isPending}
            />
          </>
        ) : null}
      </Sheet>

      <ConfirmSheet
        visible={confirm !== null}
        title={confirm?.kind === "plan" ? "Hapus Rencana?" : "Hapus Barang?"}
        message={`"${confirm?.label ?? ""}" akan dihapus dari daftar belanja.`}
        onConfirm={() => deleteMut.mutate()}
        onClose={() => setConfirm(null)}
        testID="belanja-delete-confirm"
      />
    </Screen>
  );
}
