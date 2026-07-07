// K0 全局音频播放 Context — Sprint 15 音频 demo
// 目的：让页面任意 timestamp 按钮通过 useAudioPlayer().play(url, startSec) 播放播客音频
// 依赖：expo-av（package.json 未列，需 Frank 执行 `npx expo install expo-av`）
// 兜底：web 端可用 HTMLAudioElement 替代（若 expo-av 未装）
//
// State: { sound, currentUrl, currentPosMs, durationMs, isPlaying, isLoading, error }
// Actions: play(url, startSec) / pause() / resume() / seek(sec) / stop()

import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { Platform } from 'react-native';

// -- expo-av 动态 import（Sprint 15：package.json 未列 expo-av，运行时才 require；
//    未装时 native 端 play() 会 throw，web 端 fallback 到 HTMLAudioElement） --
let ExpoAv: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ExpoAv = require('expo-av');
} catch {
  ExpoAv = null;
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
    if (ExpoAv && Platform.OS !== 'web') {
      try {
        ExpoAv.Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
          allowsRecordingIOS: false,
        }).catch(() => {});
      } catch {}
    }
    return () => {
      // cleanup on provider unmount
      if (soundRef.current) {
        try { soundRef.current.unloadAsync?.(); } catch {}
        soundRef.current = null;
      }
      if (htmlAudioRef.current) {
        try { htmlAudioRef.current.pause(); htmlAudioRef.current.src = ''; } catch {}
        htmlAudioRef.current = null;
      }
    };
  }, []);

  const unloadCurrent = useCallback(async () => {
    if (soundRef.current) {
      try { await soundRef.current.unloadAsync(); } catch {}
      soundRef.current = null;
    }
    if (htmlAudioRef.current) {
      try {
        htmlAudioRef.current.pause();
        htmlAudioRef.current.src = '';
      } catch {}
      htmlAudioRef.current = null;
    }
  }, []);

  const play = useCallback(async (url: string, startSec: number = 0) => {
    if (!url) {
      dispatch({ type: 'LOAD_ERROR', error: '没有音频源' });
      return;
    }

    // 如果已经加载了相同 url，只需 seek + play
    if (state.currentUrl === url && (soundRef.current || htmlAudioRef.current)) {
      try {
        if (soundRef.current) {
          await soundRef.current.setPositionAsync(Math.floor(startSec * 1000));
          await soundRef.current.playAsync();
        } else if (htmlAudioRef.current) {
          htmlAudioRef.current.currentTime = startSec;
          await htmlAudioRef.current.play();
        }
        dispatch({ type: 'STATUS', posMs: startSec * 1000, isPlaying: true });
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
            audio.currentTime = startSec;
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

    // Native 端走 expo-av
    if (!ExpoAv) {
      dispatch({ type: 'LOAD_ERROR', error: '缺少 expo-av，请执行：npx expo install expo-av' });
      return;
    }
    try {
      const { sound } = await ExpoAv.Audio.Sound.createAsync(
        { uri: url },
        {
          shouldPlay: false,
          positionMillis: Math.floor(startSec * 1000),
          progressUpdateIntervalMillis: 500,
        },
        (status: any) => {
          if (!status || !status.isLoaded) return;
          dispatch({
            type: 'STATUS',
            posMs: status.positionMillis || 0,
            durationMs: status.durationMillis || undefined,
            isPlaying: !!status.isPlaying,
          });
        }
      );
      soundRef.current = sound;
      const status = await sound.getStatusAsync();
      const durMs = (status && (status as any).isLoaded) ? (status as any).durationMillis || 0 : 0;
      dispatch({ type: 'LOAD_SUCCESS', durationMs: durMs });
      // seek + play
      await sound.setPositionAsync(Math.floor(startSec * 1000));
      await sound.playAsync();
    } catch (err: any) {
      dispatch({ type: 'LOAD_ERROR', error: err?.message || '音频加载失败' });
    }
  }, [state.currentUrl, unloadCurrent]);

  const pause = useCallback(async () => {
    try {
      if (soundRef.current) await soundRef.current.pauseAsync();
      if (htmlAudioRef.current) htmlAudioRef.current.pause();
    } catch {}
    dispatch({ type: 'STATUS', posMs: state.currentPosMs, isPlaying: false });
  }, [state.currentPosMs]);

  const resume = useCallback(async () => {
    try {
      if (soundRef.current) await soundRef.current.playAsync();
      if (htmlAudioRef.current) await htmlAudioRef.current.play();
      dispatch({ type: 'STATUS', posMs: state.currentPosMs, isPlaying: true });
    } catch {}
  }, [state.currentPosMs]);

  const seek = useCallback(async (sec: number) => {
    try {
      if (soundRef.current) {
        await soundRef.current.setPositionAsync(Math.floor(sec * 1000));
      }
      if (htmlAudioRef.current) {
        htmlAudioRef.current.currentTime = sec;
      }
      dispatch({ type: 'STATUS', posMs: sec * 1000, isPlaying: state.isPlaying });
    } catch {}
  }, [state.isPlaying]);

  const stop = useCallback(async () => {
    await unloadCurrent();
    dispatch({ type: 'STOP' });
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
