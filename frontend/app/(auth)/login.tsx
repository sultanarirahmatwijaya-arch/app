import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Link } from "expo-router";
import { Btn, Card, Field, Icon, Screen } from "@/src/components/ui";
import { useAuth } from "@/src/auth";
import { FONT } from "@/src/fonts";
import { makeStyles, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  scroll: { flexGrow: 1, justifyContent: "center", padding: 24 },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
    justifyContent: "center",
  },
  badge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: c.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  brand: { color: c.onSurface, fontFamily: FONT.display, fontSize: 36 },
  tagline: {
    color: c.muted,
    fontFamily: FONT.text,
    fontSize: 14,
    textAlign: "center",
    marginBottom: 32,
  },
  title: { color: c.onSurface, fontFamily: FONT.display, fontSize: 24, marginBottom: 20 },
  error: { color: c.error, fontFamily: FONT.textMed, fontSize: 13, marginBottom: 12 },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: 24, gap: 4 },
  footerText: { color: c.muted, fontFamily: FONT.text, fontSize: 14 },
  footerLink: { color: c.brandPrimary, fontFamily: FONT.textSemi, fontSize: 14 },
}));

export default function LoginScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setError("");
    if (!username.trim() || !password) {
      setError("Isi username dan kata sandi dulu ya");
      return;
    }
    setBusy(true);
    try {
      await login(username.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal masuk");
      setBusy(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.brandRow}>
            <View style={styles.badge}>
              <Icon name="leaf-outline" size={28} color={colors.onBrandPrimary} />
            </View>
            <Text style={styles.brand}>MenAbng</Text>
          </View>
          <Text style={styles.tagline}>Catatan tabungan berdua, tenang tiap hari</Text>

          <Card>
            <Text style={styles.title}>Masuk</Text>
            {error ? <Text style={styles.error} testID="login-error-text">{error}</Text> : null}
            <Field
              label="Username"
              testID="login-username-input"
              autoCapitalize="none"
              autoCorrect={false}
              value={username}
              onChangeText={setUsername}
              placeholder="mis. udi"
            />
            <Field
              label="Kata Sandi"
              testID="login-password-input"
              secureTextEntry
              autoCapitalize="none"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••"
            />
            <Btn
              label="Masuk"
              testID="login-submit-button"
              onPress={submit}
              loading={busy}
              style={{ marginTop: 8, height: 54 }}
            />
          </Card>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Belum punya akun?</Text>
            <Link href="/(auth)/register" asChild>
              <Pressable testID="login-to-register-link">
                <Text style={styles.footerLink}>Daftar</Text>
              </Pressable>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
