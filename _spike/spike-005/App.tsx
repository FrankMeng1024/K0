import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useFonts, BagelFatOne_400Regular } from '@expo-google-fonts/bagel-fat-one';
import Svg, { Defs, Filter, FeTurbulence, FeDisplacementMap, Rect, Path } from 'react-native-svg';

export default function App() {
  const [fontsLoaded] = useFonts({
    BagelFatOne_400Regular,
  });
  const [clicks, setClicks] = useState(0);

  if (!fontsLoaded) {
    return (
      <View
        // @ts-ignore
        dataSet={{ testid: 'loading' }}
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: '#E8D9B8',
        }}
      >
        <Text>Loading fonts…</Text>
      </View>
    );
  }

  return (
    <View
      // @ts-ignore
      dataSet={{ testid: 'app-root' }}
      style={{
        flex: 1,
        backgroundColor: '#E8D9B8',
        paddingTop: 60,
        paddingHorizontal: 24,
        alignItems: 'center',
      }}
    >
      <StatusBar style="dark" />

      <Text
        // @ts-ignore
        dataSet={{ testid: 'headline' }}
        style={{
          fontFamily: 'BagelFatOne_400Regular',
          fontSize: 60,
          color: '#C80306',
          marginBottom: 20,
        }}
      >
        LearnK0
      </Text>

      <Svg width={200} height={120}>
        <Defs>
          <Filter id="torn-strong">
            <FeTurbulence
              type="fractalNoise"
              baseFrequency="0.045"
              numOctaves={3}
              seed={4}
              result="noise"
            />
            <FeDisplacementMap in="SourceGraphic" in2="noise" scale={9} />
          </Filter>
        </Defs>
        <Rect x={20} y={20} width={80} height={80} fill="#C80306" filter="url(#torn-strong)" />
        <Path
          d="M120,60 Q120,20 160,20 Q200,20 200,60 Q200,100 160,100 Q120,100 120,60 Z"
          fill="#284EA9"
          filter="url(#torn-strong)"
        />
      </Svg>

      <Pressable
        // @ts-ignore
        dataSet={{ testid: 'increment-btn' }}
        onPress={() => setClicks((c) => c + 1)}
        style={{
          marginTop: 30,
          backgroundColor: '#F8D34A',
          paddingHorizontal: 24,
          paddingVertical: 12,
          borderRadius: 100,
        }}
      >
        <Text style={{ fontFamily: 'BagelFatOne_400Regular', fontSize: 20, color: '#1A1613' }}>
          Tap me
        </Text>
      </Pressable>

      <Text
        // @ts-ignore
        dataSet={{ testid: 'click-count' }}
        style={{
          marginTop: 16,
          fontSize: 24,
          color: '#284EA9',
          fontFamily: 'BagelFatOne_400Regular',
        }}
      >
        Clicks: {clicks}
      </Text>

      <Text
        // @ts-ignore
        dataSet={{ testid: 'chinese-text' }}
        style={{
          marginTop: 30,
          fontSize: 18,
          color: '#652300',
        }}
      >
        中文测试：把播客变成学习。
      </Text>
    </View>
  );
}
