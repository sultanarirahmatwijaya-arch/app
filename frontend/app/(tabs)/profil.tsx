import { useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as WebBrowser from "expo-web-browser";
import { API_BASE, api, uploadFile, type Book, type User } from "@/src/api";
import { useAuth } from "@/src/auth";
import { monthLabel } from "@/src/format";
import { FONT } from "@/src/fonts";
import { usesNativeTabs } from "@/src/navigation";
import { makeStyles, useTheme } from "@/src/theme";
import { Avatar, Btn, Card, Field, Icon, Screen, SectionLabel } from "@/src/components/ui";
import { ConfirmSheet, Sheet } from "@/src/components/sheet";
import { useToast } from "@/src/components/toast";

const useStyles = makeStyles((c) => ({
  scroll: { paddingHorizontal: 24, gap: 12 },
  profileCard: { alignItems: "center", paddingVertical: 24, gap: 4 },
  name: { color: c.onSurface, fontFamily: FONT.display, fontSize: 22, marginTop: 12 },
  username: { color: c.muted, fontFamily: FONT.text, fontSize: 13 },
  editNameBtn: { marginTop: 10 },
  memberRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  memberName: { color: c.onSurface, fontFamily: FONT.textSemi, fontSize: 14 },
  memberUsername: { color: c.muted, fontFamily: FONT.text, fontSize: 12 },
  codeBox: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: c.brandSecondary,
    borderRadius: 14,
    alignItems: "center",
    paddingVertical: 14,
    marginTop: 8,
  },
  code: { color: c.brandPrimary, fontFamily: FONT.display, fontSize: 26, letterSpacing: 8 },
  codeHint: { color: c.muted, fontFamily: FONT.text, fontSize: 12, marginTop: 6, textAlign: "center" },
  joinRow: { flexDirection: "row", gap: 10, alignItems: "flex-end" },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
  },
  menuText: { color: c.onSurface, fontFamily: FONT.textSemi, fontSize: 15, flex: 1 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { color: c.onSurfaceSecondary, fontFamily: FONT.text, fontSize: 12 },
  driveCard: { gap: 10 },
}));

export default function ProfilScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { user, book, token, setUser, refreshBook, logout } = useAuth();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  const [nameSheet, setNameSheet] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [bookSheet, setBookSheet] = useState(false);
  const [bookName, setBookName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [permSheet, setPermSheet] = useState(false);
  const [denySheet, setDenySheet] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  const gdrive = useQuery({
    queryKey: ["gdrive"],
    queryFn: () => api<{ connected: boolean }>("/integrations/google/status"),
  });

  const invalidateAll = () => queryClient.invalidateQueries();

  const renameMut = useMutation({
    mutationFn: () => api<User>("/users/me", { method: "PUT", body: { display_name: nameValue.trim() } }),
    onSuccess: (u) => {
      setUser(u);
      setNameSheet(false);
      toast.show("Nama diperbarui");
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const renameBookMut = useMutation({
    mutationFn: () => api<Book>("/books/me", { method: "PUT", body: { name: bookName.trim() } }),
    onSuccess: () => {
      refreshBook();
      setBookSheet(false);
      toast.show("Nama buku diperbarui");
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const joinMut = useMutation({
    mutationFn: () => api<Book>("/books/join", { method: "POST", body: { code: joinCode.trim() } }),
    onSuccess: () => {
      setJoinCode("");
      invalidateAll();
      refreshBook();
      toast.show("Berhasil gabung buku tabungan pasangan");
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const exportMut = useMutation({
    mutationFn: () =>
      api<{ file: { webViewLink?: string } }>("/integrations/google/export", {
        method: "POST",
        body: { month: monthLabelToYm() },
      }),
    onSuccess: () => toast.show("Rekap bulan ini terunggah ke Google Drive"),
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  function monthLabelToYm() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  const reallyPick = async () => {
    setPermSheet(false);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      if (perm.canAskAgain) {
        toast.show("Izinkan akses galeri untuk memilih foto", "info");
        return;
      }
      setDenySheet(true);
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (res.canceled || !res.assets?.length) return;
    const asset = res.assets[0];
    setUploading(true);
    try {
      const u = await uploadFile<User>("/users/me/avatar", {
        uri: asset.uri,
        name: "avatar.jpg",
        mimeType: asset.mimeType ?? "image/jpeg",
      });
      setUser(u);
      invalidateAll();
      toast.show("Foto profil diperbarui");
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Gagal mengunggah foto", "error");
    }
    setUploading(false);
  };

  const connectDrive = async () => {
    if (!token) return;
    const url = `${API_BASE}/api/integrations/google/start?token=${encodeURIComponent(
      token,
    )}&platform=${Platform.OS === "web" ? "web" : "mobile"}`;
    if (Platform.OS === "web") {
      window.open(url, "_blank");
      setTimeout(() => gdrive.refetch(), 5000);
      return;
    }
    try {
      await WebBrowser.openAuthSessionAsync(url, Linking.createURL("oauth/google"));
    } catch {
      // user cancelled
    }
    gdrive.refetch();
  };

  const shareCode = async () => {
    if (!book?.invite_code) return;
    try {
      await Share.share({
        message: `Gabung buku tabungan saya di MenAbng dengan kode: ${book.invite_code}`,
      });
    } catch {
      toast.show(`Kode undangan: ${book.invite_code}`, "info");
    }
  };

  if (!user) return null;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ ...styles.scroll, paddingBottom: bottomChrome + 24 }}
        showsVerticalScrollIndicator={false}
      >
        <Card style={styles.profileCard} testID="profil-card">
          <Pressable testID="profil-avatar-button" onPress={() => setPermSheet(true)} disabled={uploading}>
            {uploading ? (
              <View style={{ width: 96, height: 96, alignItems: "center", justifyContent: "center" }}>
                <ActivityIndicator color={colors.brandPrimary} size="large" />
              </View>
            ) : (
              <Avatar name={user.display_name} path={user.avatar_path} size={96} testID="profil-avatar" />
            )}
          </Pressable>
          <Text style={styles.name}>{user.display_name}</Text>
          <Text style={styles.username}>@{user.username}</Text>
          <Btn
            label="Ubah Nama"
            variant="ghost"
            testID="profil-edit-name-button"
            onPress={() => {
              setNameValue(user.display_name);
              setNameSheet(true);
            }}
            style={styles.editNameBtn}
          />
        </Card>

        <Card testID="profil-book-card">
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <SectionLabel>Buku Tabungan</SectionLabel>
            <Pressable
              testID="profil-rename-book-button"
              onPress={() => {
                setBookName(book?.name ?? "");
                setBookSheet(true);
              }}
            >
              <Icon name="create-outline" size={18} color={colors.brandPrimary} />
            </Pressable>
          </View>
          <Text style={{ color: colors.onSurface, fontFamily: FONT.display, fontSize: 18 }}>
            {book?.name ?? "-"}
          </Text>
          {(book?.members ?? []).map((m) => (
            <View key={m.id} style={styles.memberRow}>
              <Avatar name={m.display_name} path={m.avatar_path} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={styles.memberName}>{m.display_name}</Text>
                <Text style={styles.memberUsername}>@{m.username}</Text>
              </View>
              {m.id === user.id ? (
                <Text style={{ color: colors.muted, fontFamily: FONT.text, fontSize: 12 }}>Anda</Text>
              ) : null}
            </View>
          ))}
          <View style={styles.codeBox}>
            <Text style={styles.code} testID="profil-invite-code">
              {book?.invite_code ?? "—"}
            </Text>
            <Text style={styles.codeHint}>
              Kode undangan. Bagikan ke pasangan agar bisa mencatat di buku yang sama.
            </Text>
          </View>
          <Btn
            label="Bagikan Kode"
            icon="share-social-outline"
            variant="soft"
            testID="profil-share-code-button"
            onPress={shareCode}
            style={{ marginTop: 12 }}
          />
          <View style={{ marginTop: 16 }}>
            <Field
              label="Punya kode dari pasangan?"
              testID="profil-join-code-input"
              autoCapitalize="characters"
              autoCorrect={false}
              value={joinCode}
              onChangeText={(v) => setJoinCode(v.toUpperCase())}
              placeholder="Masukkan kode undangan"
            />
            <Btn
              label="Gabung Buku"
              testID="profil-join-button"
              onPress={() => {
                if (!joinCode.trim()) {
                  toast.show("Isi kode undangan dulu", "error");
                  return;
                }
                joinMut.mutate();
              }}
              loading={joinMut.isPending}
            />
          </View>
        </Card>

        <Card testID="profil-menu-card">
          <Pressable
            style={styles.menuRow}
            testID="profil-rekening-link"
            onPress={() => router.push("/rekening")}
          >
            <Icon name="wallet-outline" size={22} color={colors.brandPrimary} />
            <Text style={styles.menuText}>Rekening &amp; Sumber Uang</Text>
            <Icon name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        </Card>

        <Card style={styles.driveCard} testID="profil-gdrive-card">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Icon name="cloud-upload-outline" size={22} color={colors.brandPrimary} />
            <Text style={styles.menuText}>Backup ke Google Drive</Text>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: gdrive.data?.connected ? colors.success : colors.borderStrong },
              ]}
              testID="profil-gdrive-status-dot"
            />
          </View>
          <Text style={styles.statusText}>
            {gdrive.data?.connected
              ? "Terhubung. Rekap bisa diekspor ke Google Drive Anda."
              : "Belum terhubung. Hubungkan akun Google untuk menyimpan rekap otomatis."}
          </Text>
          {gdrive.data?.connected ? (
            <Btn
              label="Ekspor Rekap Bulan Ini"
              icon="cloud-upload-outline"
              testID="profil-gdrive-export-button"
              onPress={() => exportMut.mutate()}
              loading={exportMut.isPending}
            />
          ) : (
            <Btn
              label="Hubungkan Google Drive"
              icon="link-outline"
              variant="soft"
              testID="profil-gdrive-connect-button"
              onPress={connectDrive}
            />
          )}
        </Card>

        <Btn
          label="Keluar"
          variant="danger"
          icon="log-out-outline"
          testID="profil-logout-button"
          onPress={() => setConfirmLogout(true)}
        />

        <Text
          style={{
            color: colors.muted,
            fontFamily: FONT.text,
            fontSize: 12,
            textAlign: "center",
            paddingBottom: 8,
          }}
        >
          MenAbng · mencatat bareng, hemat bareng
        </Text>
      </ScrollView>

      <Sheet visible={nameSheet} onClose={() => setNameSheet(false)} title="Ubah Nama Tampilan" testID="profil-name-sheet">
        <Field
          label="Nama tampilan"
          testID="profil-name-input"
          value={nameValue}
          onChangeText={setNameValue}
          placeholder="mis. Udi"
        />
        <Btn
          label="Simpan"
          testID="profil-name-save-button"
          onPress={() => {
            if (!nameValue.trim()) {
              toast.show("Nama tidak boleh kosong", "error");
              return;
            }
            renameMut.mutate();
          }}
          loading={renameMut.isPending}
        />
      </Sheet>

      <Sheet visible={bookSheet} onClose={() => setBookSheet(false)} title="Nama Buku Tabungan" testID="profil-book-sheet">
        <Field
          label="Nama buku"
          testID="profil-book-name-input"
          value={bookName}
          onChangeText={setBookName}
          placeholder="mis. Tabungan Menuju Nikah"
        />
        <Btn
          label="Simpan"
          testID="profil-book-save-button"
          onPress={() => {
            if (!bookName.trim()) {
              toast.show("Nama buku tidak boleh kosong", "error");
              return;
            }
            renameBookMut.mutate();
          }}
          loading={renameBookMut.isPending}
        />
      </Sheet>

      <Sheet visible={permSheet} onClose={() => setPermSheet(false)} title="Ubah Foto Profil" testID="profil-perm-sheet">
        <Text
          style={{
            color: colors.onSurfaceSecondary,
            fontFamily: FONT.text,
            fontSize: 14,
            lineHeight: 20,
            marginBottom: 16,
          }}
        >
          Pilih foto dari galeri untuk mempercantik profil akun MenAbng Anda. Kami perlu izin akses galeri sekali saja.
        </Text>
        <Btn
          label="Pilih dari Galeri"
          icon="image-outline"
          testID="profil-perm-continue-button"
          onPress={reallyPick}
        />
      </Sheet>

      <Sheet visible={denySheet} onClose={() => setDenySheet(false)} title="Izin Galeri Diblokir" testID="profil-deny-sheet">
        <Text
          style={{
            color: colors.onSurfaceSecondary,
            fontFamily: FONT.text,
            fontSize: 14,
            lineHeight: 20,
            marginBottom: 16,
          }}
        >
          Akses galeri diblokir untuk aplikasi ini. Buka Pengaturan untuk mengizinkannya, lalu coba lagi.
        </Text>
        <Btn
          label="Buka Pengaturan"
          icon="settings-outline"
          testID="profil-open-settings-button"
          onPress={() => {
            setDenySheet(false);
            Linking.openSettings();
          }}
        />
      </Sheet>

      <ConfirmSheet
        visible={confirmLogout}
        title="Keluar?"
        message="Anda akan keluar dari MenAbng. Data tabungan tetap aman."
        confirmLabel="Keluar"
        onConfirm={() => {
          setConfirmLogout(false);
          logout();
        }}
        onClose={() => setConfirmLogout(false)}
        testID="profil-logout-confirm"
      />
    </Screen>
  );
}
