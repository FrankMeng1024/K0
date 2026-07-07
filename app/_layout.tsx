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
// Sprint 15 音频 demo：全局 audio Provider + 底部播放条
import { AudioPlayerProvider } from '@/lib/audioPlayer';
import { AudioPlayerBar } from '@/components/AudioPlayerBar';

// Sprint 9 STORY-00903 已回退：expo-notifications 需下次 EAS build 才能生效
// OTA v6 崩溃根因：old iOS build 缺 native module + app.json plugin 列表变更
// v7 修复：完全移除 push init 的静态 import 和冷启动调用
// 下次 EAS build 后可通过再次 OTA 恢复此功能

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

  // Sprint 9 STORY-00903 已回退（OTA v7）: 冷启动不再调 initPushNotifications
  // 原因：old iOS build 无 expo-notifications native module，静态 import 会崩溃
  // 下次 EAS build 后重新激活

  if (!fontsLoaded && !fontError) {
    // Blank paper background while fonts load — prevents FOUT
    return <View style={{ flex: 1, backgroundColor: colors.paperMain }} />;
  }

  return (
    <SafeAreaProvider>
      <AudioPlayerProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.paperMain },
            // Sprint 14 R1 #17: 全局禁用 iOS 左滑返回手势（Frank 反复要求）
            gestureEnabled: false,
            // Sprint 4 STORY-00105: 撕纸浮起过渡感（原生 iOS 上 fade_from_bottom = 内容自下浮上；
            // web 上 Expo Router 用 CSS 淡入实现）
            animation: 'fade_from_bottom',
            animationDuration: 240,
          }}
        />
        {/* Sprint 15 音频 demo: 常驻底部播放条（未加载音频时自动不渲染） */}
        <AudioPlayerBar />
      </AudioPlayerProvider>
    </SafeAreaProvider>
  );
}
