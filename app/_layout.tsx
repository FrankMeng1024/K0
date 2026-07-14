import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useState } from 'react';
import { View, AppState, Platform } from 'react-native';
import type { AppStateStatus } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider, focusManager } from '@tanstack/react-query';

import { BagelFatOne_400Regular } from '@expo-google-fonts/bagel-fat-one';
import { RubikBubbles_400Regular } from '@expo-google-fonts/rubik-bubbles';
import { Sniglet_400Regular } from '@expo-google-fonts/sniglet';
import { Fraunces_400Regular, Fraunces_400Regular_Italic } from '@expo-google-fonts/fraunces';

import { colors } from '@/constants/theme';
import { AudioPlayerProvider } from '@/lib/audioPlayer';
import { AudioPlayerBar } from '@/components/AudioPlayerBar';
import { loadSession } from '@/lib/auth';
import { queryClient } from '@/lib/queryClient';
import { attachNotificationRouting, registerPushToken } from '@/lib/notifications';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync().catch(() => {});

// RN: 把 AppState active/background 映射到 React Query focusManager, 让回前台自动重取
function onAppStateChange(status: AppStateStatus) {
  if (Platform.OS !== 'web') {
    focusManager.setFocused(status === 'active');
  }
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    BagelFatOne_400Regular,
    RubikBubbles_400Regular,
    Sniglet_400Regular,
    Fraunces_400Regular,
    Fraunces_400Regular_Italic,
  });

  // Refactor Phase 1: 冷启动时从 AsyncStorage 恢复 JWT session。
  // apiFetch 在 session 恢复前调用会走无 header 请求 → 401（预期）。
  // 未 sessionLoaded 前渲染 paper background，避免子路由过早发起 API 调用。
  const [sessionLoaded, setSessionLoaded] = useState(false);
  useEffect(() => {
    loadSession().then((s) => {
      // #106: 已登录则注册 push token (幂等, web/无权限安全跳过)
      if (s?.token) registerPushToken();
    }).finally(() => setSessionLoaded(true));
  }, []);

  // #106: 挂载通知点击深链 (review_due→/review, job_ready→/episode/[packId]); 处理冷启动点击
  useEffect(() => {
    const detach = attachNotificationRouting();
    return detach;
  }, []);

  // React Query: AppState → focusManager (回前台自动重取)
  useEffect(() => {
    const sub = AppState.addEventListener('change', onAppStateChange);
    return () => sub.remove();
  }, []);

  const onReady = useCallback(async () => {
    if ((fontsLoaded || fontError) && sessionLoaded) {
      await SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError, sessionLoaded]);

  useEffect(() => {
    onReady();
  }, [onReady]);

  if ((!fontsLoaded && !fontError) || !sessionLoaded) {
    // Blank paper background while fonts/session load — prevents FOUT & premature 401 fetches
    return <View style={{ flex: 1, backgroundColor: colors.paperMain }} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <AudioPlayerProvider>
            <StatusBar style="dark" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.paperMain },
                gestureEnabled: false,
                animation: 'fade_from_bottom',
                animationDuration: 240,
              }}
            />
            <AudioPlayerBar />
          </AudioPlayerProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
