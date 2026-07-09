// useStopAudioOnBlur — 离开页面 (跳转/back/系统手势) 自动停音频。
// 原 card/episode/snapshot 各内联同样的 useFocusEffect + try{stop}catch 样板 (Phase E 收敛)。
import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAudioPlayer } from '@/lib/audioPlayer';

export function useStopAudioOnBlur() {
  const audioPlayer = useAudioPlayer();
  useFocusEffect(
    useCallback(() => {
      return () => { try { audioPlayer.stop(); } catch {} };
    }, [audioPlayer])
  );
}
