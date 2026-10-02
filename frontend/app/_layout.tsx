import { useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, useSegments, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { queryClient } from "@/src/query-client";
import { AuthProvider, useAuth } from "@/src/auth";
import { ToastProvider } from "@/src/components/toast";
import { makeStyles, useTheme } from "@/src/theme";

// Keep the splash visible until fonts + session restore are done.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    FrauncesSemi: require("../assets/fonts/Fraunces_600.ttf"),
    FrauncesMed: require("../assets/fonts/Fraunces_500.ttf"),
    PlusJakartaSans: require("../assets/fonts/PlusJakartaSans_400.ttf"),
    PlusJakartaSansMed: require("../assets/fonts/PlusJakartaSans_500.ttf"),
    PlusJakartaSansSemi: require("../assets/fonts/PlusJakartaSans_600.ttf"),
    PlusJakartaSansBold: require("../assets/fonts/PlusJakartaSans_700.ttf"),
  });

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Root fontsLoaded={fontsLoaded} />
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

// Redirects based on session: no user -> auth screens, user -> main tabs.
function Gate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === "(auth)";
    if (!user && !inAuth) {
      router.replace("/(auth)/login");
    } else if (user && inAuth) {
      router.replace("/(tabs)");
    }
  }, [user, loading, segments]);

  return <>{children}</>;
}

function Root({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { loading } = useAuth();
  const { colors } = useTheme();
  const styles = useStyles();

  useEffect(() => {
    if (fontsLoaded && !loading) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, loading]);

  if (!fontsLoaded) return null;

  return (
    <KeyboardProvider>
      <ToastProvider>
        <Gate>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.surface },
            }}
          >
            <Stack.Screen name="catat" options={{ presentation: "fullScreenModal" }} />
          </Stack>
        </Gate>
      </ToastProvider>
    </KeyboardProvider>
  );
}

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.surface },
}));
