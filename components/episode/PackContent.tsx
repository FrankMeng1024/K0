// PackContent — 撕纸浮起动效: 内容从下方 spring 浮入 (原 episode 内联, Phase F 抽出)
import React, { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

export function PackContent({ children }: { children: React.ReactNode }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(anim, {
      toValue: 1,
      damping: 14,
      stiffness: 90,
      mass: 0.9,
      useNativeDriver: false,
    }).start();
  }, [anim]);
  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}
