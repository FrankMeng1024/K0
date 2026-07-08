// K0 全局音频播放 Context — Sprint 15 音频 demo
// Sprint 14 R2 build fix: expo-av deprecated (SDK 51+，K0 SDK 57 build 失败: EXAV module not found)
//   → 切换到 expo-audio API（createAudioPlayer + player.seekTo（秒）+ addListener('playbackStatusUpdate')）
// 兜底：web 端可用 HTMLAudioElement 替代（若 expo-audio 未装）
//
// State: { currentUrl, currentPosMs, durationMs, isPlaying, isLoading, error }
// Actions: play(url, startSec) / pause() / resume() / seek(sec) / stop()

import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { Platform } from 'react-native';

// -- expo-audio 动态 import（未装时不阻断 bundle） --
let ExpoAudio: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ExpoAudio = require('expo-audio');
} catch {
  ExpoAudio = null;
}

type AudioState = {
  currentUrl: string | null;
  currentPosMs: number;
  durationMs: number;
  isPlaying: boolean;
  isLoading: boolean;
  error: string | null;
};

const initialState: AudioState = {
  currentUrl: null,
  currentPosMs: 0,
  durationMs: 0,
  isPlaying: false,
  isLoading: false,
  error: null,
};

type Action =
  | { type: 'LOAD_START'; url: string }
  | { type: 'LOAD_SUCCESS'; durationMs: number }
  | { type: 'LOAD_ERROR'; error: string }
  | { type: 'STATUS'; posMs: number; durationMs?: number; isPlaying: boolean }
  | { type: 'STOP' };

function reducer(state: AudioState, a: Action): AudioState {
  switch (a.type) {
    case 'LOAD_START':
      return { ...state, currentUrl: a.url, isLoading: true, error: null, currentPosMs: 0, durationMs: 0, isPlaying: false };
    case 'LOAD_SUCCESS':
      return { ...state, isLoading: false, durationMs: a.durationMs };
    case 'LOAD_ERROR':
      return { ...state, isLoading: false, error: a.error, isPlaying: false };
    case 'STATUS':
      return {
        ...state,
        currentPosMs: a.posMs,
        durationMs: a.durationMs ?? state.durationMs,
        isPlaying: a.isPlaying,
      };
    case 'STOP':
      return { ...initialState };
    default:
      return state;
  }
}

type AudioPlayerCtx = {
  state: AudioState;
  play: (url: string, startSec?: number) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  seek: (sec: number) => Promise<void>;
  stop: () => Promise<void>;
};

const Ctx = createContext<AudioPlayerCtx | null>(null);

export function AudioPlayerProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  // Sound 实例（native）或 HTMLAudioElement（web）
  const soundRef = useRef<any>(null);
  const htmlAudioRef = useRef<HTMLAudioElement | null>(null);

  // 全局 audio mode 设置（native 只调一次）
  useEffect(() => {
    // Sprint 14 R2: expo-audio setAudioModeAsync API（Frank 明确要求音频后台，且切别的 app 继续播）
    if (ExpoAudio && Platform.OS !== 'web') {
      try {
        ExpoAudio.setAudioModeAsync({
          playsInSilentMode: true,
          shouldPlayInBackground: true,
          interruptionMode: 'duckOthers',
          allowsRecording: false,
        }).catch(() => {});
      } catch {}
    }
    return () => {
      // cleanup on provider unmount — Sprint 16 R7: 用 release() 不是 remove()
      if (soundRef.current) {
        try {
          if (typeof soundRef.current.release === 'function') soundRef.current.release();
          else if (typeof soundRef.current.remove === 'function') soundRef.current.remove();
          else if (typeof soundRef.current.unloadAsync === 'function') soundRef.current.unloadAsync();
        } catch {}
        soundRef.current = null;
      }
      if (htmlAudioRef.current) {
        try { htmlAudioRef.current.pause(); htmlAudioRef.current.src = ''; } catch {}
        htmlAudioRef.current = null;
      }
    };
  }, []);

  const unloadCurrent = useCallback(async () => {
    // Sprint 16 R8: 加详细日志定位闪退步骤
    console.log('[audio] unloadCurrent start, has soundRef:', !!soundRef.current);
    const oldSound = soundRef.current;
    soundRef.current = null; // 先设 null，防止后续回调再触发
    if (oldSound) {
      // 清理 listener subscription
      try {
        if ((oldSound as any)._sub?.remove) {
          console.log('[audio] step 1: remove listener sub');
          (oldSound as any)._sub.remove();
        }
      } catch (e: any) { console.log('[audio] step 1 err:', e?.message); }
      // pause
      try {
        if (typeof oldSound.pause === 'function') {
          console.log('[audio] step 2: pause');
          oldSound.pause();
        }
      } catch (e: any) { console.log('[audio] step 2 err:', e?.message); }
      // release native player — Sprint 16 R7: expo-audio 官方 API 是 remove()
      try {
        if (typeof oldSound.remove === 'function') {
          console.log('[audio] step 3: remove()');
          oldSound.remove();
        } else if (typeof oldSound.release === 'function') {
          console.log('[audio] step 3: release()');
          oldSound.release();
        } else if (typeof oldSound.unloadAsync === 'function') {
          console.log('[audio] step 3: unloadAsync()');
          await oldSound.unloadAsync();
        }
      } catch (e: any) { console.log('[audio] step 3 err:', e?.message); }
      try {
        await new Promise((resolve) => setTimeout(resolve, 50));
      } catch {}
    }
    const oldHtml = htmlAudioRef.current;
    htmlAudioRef.current = null;
    if (oldHtml) {
      try {
        oldHtml.pause();
        oldHtml.src = '';
        oldHtml.load();
      } catch {}
    }
    console.log('[audio] unloadCurrent done');
  }, []);

  const play = useCallback(async (url: string, startSec: number = 0) => {
    if (!url) {
      dispatch({ type: 'LOAD_ERROR', error: '没有音频源' });
      return;
    }

    // Sprint 16 R5: 后端已修 quote-based real-start 定位，前端不再 -N 秒 buffer
    // GLM 若失手，findQuoteRealStart 会替换成 transcript segment.start
    const bufferedStart = Math.max(0, startSec);

    // 如果已经加载了相同 url，只需 seek + play
    if (state.currentUrl === url && (soundRef.current || htmlAudioRef.current)) {
      try {
        if (soundRef.current) {
          // Sprint 14 R2: expo-audio API 秒为单位
          if (typeof soundRef.current.seekTo === 'function') {
            soundRef.current.seekTo(bufferedStart);
          }
          if (typeof soundRef.current.play === 'function') {
            soundRef.current.play();
          }
        } else if (htmlAudioRef.current) {
          htmlAudioRef.current.currentTime = bufferedStart;
          await htmlAudioRef.current.play();
        }
        dispatch({ type: 'STATUS', posMs: bufferedStart * 1000, isPlaying: true });
        return;
      } catch (err: any) {
        // fall through to full reload
      }
    }

    // 卸载之前的
    await unloadCurrent();
    dispatch({ type: 'LOAD_START', url });

    // Web 端 fallback 到 HTMLAudioElement（更稳，不依赖 expo-av web 编译）
    if (Platform.OS === 'web') {
      try {
        const audio = new Audio(url);
        audio.crossOrigin = 'anonymous';
        htmlAudioRef.current = audio;
        audio.addEventListener('loadedmetadata', () => {
          dispatch({ type: 'LOAD_SUCCESS', durationMs: Math.floor((audio.duration || 0) * 1000) });
          try {
            audio.currentTime = bufferedStart;
            audio.play().catch((e) => {
              dispatch({ type: 'LOAD_ERROR', error: '浏览器阻止自动播放，请再点一次' });
            });
          } catch {}
        });
        audio.addEventListener('timeupdate', () => {
          dispatch({
            type: 'STATUS',
            posMs: Math.floor((audio.currentTime || 0) * 1000),
            durationMs: Math.floor((audio.duration || 0) * 1000),
            isPlaying: !audio.paused,
          });
        });
        audio.addEventListener('ended', () => {
          dispatch({ type: 'STATUS', posMs: Math.floor((audio.duration || 0) * 1000), isPlaying: false });
        });
        audio.addEventListener('error', () => {
          dispatch({ type: 'LOAD_ERROR', error: '音频加载失败' });
        });
        // start load
        audio.load();
      } catch (err: any) {
        dispatch({ type: 'LOAD_ERROR', error: err?.message || 'HTMLAudio 初始化失败' });
      }
      return;
    }

    // Native 端走 expo-audio（Sprint 14 R2 build fix，替换 expo-av）
    if (!ExpoAudio) {
      dispatch({ type: 'LOAD_ERROR', error: '缺少 expo-audio，请执行：npx expo install expo-audio' });
      return;
    }
    try {
      // Sprint 16 R9: 完全按 expo-audio 官方 example，最简调用
      // 之前 R7/R8 加的 isLoaded 监听 + doSeekAndPlay 可能导致 native 崩溃
      // 官方文档示例就是 createAudioPlayer + player.play()，不需要等 loaded
      const player = ExpoAudio.createAudioPlayer({ uri: url }, 500);
      soundRef.current = player;

      // Status listener — 只做 dispatch，不触发 play/seek
      const sub = player.addListener('playbackStatusUpdate', (status: any) => {
        try {
          if (!status || soundRef.current !== player) return;
          dispatch({
            type: 'STATUS',
            posMs: Math.floor((status.currentTime || 0) * 1000),
            durationMs: Math.floor((status.duration || 0) * 1000),
            isPlaying: !!status.playing,
          });
        } catch {}
      });
      (player as any)._sub = sub;

      dispatch({ type: 'LOAD_SUCCESS', durationMs: 0 });

      // 直接 play（官方文档写法），异步安全
      try { player.play(); } catch {}

      // Seek 延后 500ms，等 native 层加载差不多，safe seek
      if (bufferedStart > 0) {
        setTimeout(() => {
          if (soundRef.current !== player) return;
          try {
            if (typeof player.seekTo === 'function') player.seekTo(bufferedStart);
          } catch {}
        }, 500);
      }
    } catch (err: any) {
      dispatch({ type: 'LOAD_ERROR', error: err?.message || '音频加载失败' });
    }
  }, [state.currentUrl, unloadCurrent]);

  const pause = useCallback(async () => {
    try {
      if (soundRef.current && typeof soundRef.current.pause === 'function') {
        soundRef.current.pause();
      }
      if (htmlAudioRef.current) htmlAudioRef.current.pause();
    } catch {}
    dispatch({ type: 'STATUS', posMs: state.currentPosMs, isPlaying: false });
  }, [state.currentPosMs]);

  const resume = useCallback(async () => {
    try {
      if (soundRef.current && typeof soundRef.current.play === 'function') {
        soundRef.current.play();
      }
      if (htmlAudioRef.current) await htmlAudioRef.current.play();
      dispatch({ type: 'STATUS', posMs: state.currentPosMs, isPlaying: true });
    } catch {}
  }, [state.currentPosMs]);

  const seek = useCallback(async (sec: number) => {
    try {
      if (soundRef.current && typeof soundRef.current.seekTo === 'function') {
        // expo-audio: 秒
        soundRef.current.seekTo(sec);
      }
      if (htmlAudioRef.current) {
        htmlAudioRef.current.currentTime = sec;
      }
      dispatch({ type: 'STATUS', posMs: sec * 1000, isPlaying: state.isPlaying });
    } catch {}
  }, [state.isPlaying]);

  const stop = useCallback(async () => {
    // Sprint 16 R8: 加日志 + try/catch dispatch（组件卸载后 dispatch 会崩）
    console.log('[audio] stop() called');
    try {
      await unloadCurrent();
    } catch (e: any) {
      console.log('[audio] stop unloadCurrent err:', e?.message);
    }
    try {
      dispatch({ type: 'STOP' });
    } catch (e: any) {
      console.log('[audio] stop dispatch err:', e?.message);
    }
  }, [unloadCurrent]);

  const value = useMemo<AudioPlayerCtx>(() => ({
    state, play, pause, resume, seek, stop,
  }), [state, play, pause, resume, seek, stop]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAudioPlayer(): AudioPlayerCtx {
  const c = useContext(Ctx);
  if (!c) {
    // 兜底：Provider 未挂载时返回 no-op（避免开发过程 crash）
    return {
      state: initialState,
      play: async () => {},
      pause: async () => {},
      resume: async () => {},
      seek: async () => {},
      stop: async () => {},
    };
  }
  return c;
}

// 工具：秒 → mm:ss
export function fmtMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
