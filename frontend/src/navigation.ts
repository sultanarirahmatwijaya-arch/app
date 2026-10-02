import { Platform } from "react-native";

// iOS 26+ renders native floating tab bars (expo-router/unstable-native-tabs).
// Older iOS, Android, and web fall back to the classic JS <Tabs>.
export const usesNativeTabs =
  Platform.OS === "ios" && parseInt(String(Platform.Version), 10) >= 26;
