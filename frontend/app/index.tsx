import { Text, View } from "react-native";
import { FONT } from "@/src/fonts";
import { makeStyles, useTheme } from "@/src/theme";
import { Icon } from "@/src/components/ui";

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.surface, alignItems: "center", justifyContent: "center", gap: 14 },
  badge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: c.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  brand: { color: c.onSurface, fontFamily: FONT.display, fontSize: 34 },
  tagline: { color: c.muted, fontFamily: FONT.text, fontSize: 14 },
}));

export default function Splash() {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.container}>
      <View style={styles.badge}>
        <Icon name="leaf-outline" size={36} color={colors.onBrandPrimary} />
      </View>
      <Text style={styles.brand}>MenAbng</Text>
      <Text style={styles.tagline}>Catatan tabungan berdua</Text>
    </View>
  );
}
