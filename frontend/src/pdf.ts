import { Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { API_BASE } from "@/src/api";

// Downloads the recap PDF and opens the native share sheet (or a new tab on web).
export async function openRecapPdf(month: string, token: string) {
  const url = `${API_BASE}/api/reports/pdf?month=${encodeURIComponent(month)}`;
  if (Platform.OS === "web") {
    window.open(`${url}&token=${encodeURIComponent(token)}`, "_blank");
    return;
  }
  const dest = new File(Paths.cache, `MenAbng-Rekap-${month}.pdf`);
  if (dest.exists) dest.delete();
  const file = await File.downloadFileAsync(url, dest, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Perangkat tidak mendukung berbagi berkas");
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: "application/pdf",
    UTI: "com.adobe.pdf",
    dialogTitle: "Bagikan rekap MenAbng",
  });
}
