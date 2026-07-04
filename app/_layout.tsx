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
          animation: 'fade',
        }}
      />
    </SafeAreaProvider>
  );
}
