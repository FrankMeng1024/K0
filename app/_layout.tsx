import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { BagelFatOne_400Regular } from '@expo-google-fonts/bagel-fat-one';
import { RubikBubbles_400Regular } from '@expo-google-fonts/rubik-bubbles';
import { Sniglet_400Regular } from '@expo-google-fonts/sniglet';
import { Fraunces_400Regular, Fraunces_400Regular_Italic } from '@expo-google-fonts/fraunces';

import { colors } from '@/constants/theme';
import { initPushNotifications } from '@/lib/pushNotifications';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    BagelFatOne_400Regular,
    RubikBubbles_400Regular,
    Sniglet_400Regular,
    Fraunces_400Regular,
    Fraunces_400Regular_Italic,
  });

  const onReady = useCallback(async () => {
    if (fontsLoaded || fontError) {
      await SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    onReady();
  }, [onReady]);

  // Sprint 9 STORY-00903: 挂通知点击 listener + 幂等注册
  // UX Critical fix: 冷启动不立即请求权限（用户没上下文会 deny）
  //   → 改为只挂 listener 让 tap 生效
  //   → 请求权限延后到"首次点开始"（PasteBar submit 时）时再触发 initPushNotifications
  //   → 见 lib/pushNotifications.ts + PasteBar submit handler
  useEffect(() => {
    // 静默尝试 attach listener（不请求权限，不上报 token；若模块缺失静默降级）
    initPushNotifications({ requestPermission: false }).catch(() => {});
  }, []);

  if (!fontsLoaded && !fontError) {
    // Blank paper background while fonts load — prevents FOUT
    return <View style={{ flex: 1, backgroundColor: colors.paperMain }} />;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.paperMain },
          // Sprint 4 STORY-00105: 撕纸浮起过渡感（原生 iOS 上 fade_from_bottom = 内容自下浮上；
          // web 上 Expo Router 用 CSS 淡入实现）
          animation: 'fade_from_bottom',
          animationDuration: 240,
        }}
      />
    </SafeAreaProvider>
  );
}
