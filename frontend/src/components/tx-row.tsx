import { Pressable, Text, View } from "react-native";
import { categoryOf } from "@/src/categories";
import { rupiah } from "@/src/format";
import { FONT } from "@/src/fonts";
import { makeStyles, useTheme } from "@/src/theme";
import type { Transaction } from "@/src/api";
import { Icon } from "./ui";

const useStyles = makeStyles((c) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: c.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  middle: { flex: 1 },
  title: { color: c.onSurface, fontFamily: FONT.textSemi, fontSize: 15 },
  sub: { color: c.muted, fontFamily: FONT.text, fontSize: 12, marginTop: 2 },
  amount: { fontFamily: FONT.textBold, fontSize: 15 },
}));

export function TxRow({
  t,
  onPress,
  testID,
}: {
  t: Transaction;
  onPress?: () => void;
  testID?: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const cat = categoryOf(t.category);
  const isIn = t.type === "in";
  const sub = `${t.source_type === "account" ? t.account_name || "Rekening" : "Tunai"} · ${t.created_by_name}`;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
    >
      <View style={styles.iconWrap}>
        <Icon
          name={cat?.icon ?? "ellipsis-horizontal-circle-outline"}
          size={20}
          color={isIn ? colors.success : colors.brandPrimary}
        />
      </View>
      <View style={styles.middle}>
        <Text style={styles.title} numberOfLines={1}>
          {t.note?.trim() || cat?.label || t.category}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {sub}
        </Text>
      </View>
      <Text style={[styles.amount, { color: isIn ? colors.success : colors.error }]}>
        {isIn ? "+" : "−"}
        {rupiah(t.amount)}
      </Text>
    </Pressable>
  );
}
