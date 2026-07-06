// K0 Push Notifications — Sprint 9 STORY-00903
//
// 责任：
//   1. 首次启动请求推送权限
//   2. 拿到 Expo Push Token 上报后端 /api/push/register
//   3. 处理点通知跳转（jobId → episode 屏）
//   4. 前台收到通知时的 UX（默认系统横幅）
//
// 重要：expo-notifications 是原生模块，只有 EAS build 后生效
// 当前 build 若没有，动态 import 会失败 → 静默降级，不影响 App 正常使用
// Frank 会在下次和图标一起 build 时激活

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { getAnonymousId } from './urlDetector';
import { apiFetch } from './api';

// 已注册的 token，避免重复上报
let registeredToken: string | null = null;
let listenersAttached = false;

/**
 * 尝试请求推送权限 + 拿 token + 上报后端。
 * 失败任何一步都静默降级，不打断 App 主流程。
 */
export async function initPushNotifications(
  opts: { requestPermission?: boolean } = { requestPermission: true }
): Promise<{ ok: boolean; token?: string; reason?: string }> {
  // Web 环境不做推送
  if (Platform.OS === 'web') {
    return { ok: false, reason: 'web-not-supported' };
  }

  // 动态 import：native 模块缺失时不崩溃
  let Notifications: typeof import('expo-notifications');
  try {
    Notifications = await import('expo-notifications');
  } catch (e) {
    return { ok: false, reason: 'module-not-in-build' };
  }

  try {
    // Android 需要 channel，iOS 不需要
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'K0 通知',
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: 'default',
      });
    }

    // 前台收到通知的默认行为：显示横幅 + 声音
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        // iOS 14+ 新字段
        shouldShowBanner: true,
        shouldShowList: true,
      } as any),
    });

    // UX Critical fix: 若 opts.requestPermission = false，只 attach listener 不弹权限
    //   （冷启动时用），把 permission prompt 留到"首次点开始"触发
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (!opts.requestPermission) {
      // 只挂 listener 让通知 tap 生效；不上报 token（因为可能还没权限）
      attachListeners(Notifications);
      if (existing !== 'granted') {
        return { ok: false, reason: 'listener-only' };
      }
      // 已授过权 → 直接走完整流程
    }

    // 请求权限（只在 requestPermission=true 或 已授权 时到达）
    let finalStatus = existing;
    if (existing !== 'granted' && opts.requestPermission) {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      return { ok: false, reason: 'permission-denied' };
    }

    // 拿 Expo Push Token
    const projectId = Constants.expoConfig?.extra?.eas?.projectId
      || (Constants as any)?.easConfig?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    const token = tokenData.data;

    // 已注册过就不重复上报
    if (registeredToken === token) {
      attachListeners(Notifications);
      return { ok: true, token };
    }

    // 上报后端
    try {
      const anonymousId = await getAnonymousId();
      await apiFetch('/api/push/register', {
        method: 'POST',
        body: JSON.stringify({
          anonymousId,
          token,
          platform: Platform.OS,
          appVersion: Constants.expoConfig?.version || null,
        }),
      });
      registeredToken = token;
    } catch (e) {
      // 上报失败：token 拿到了但没存到后端 → 下次再试
      return { ok: false, token, reason: 'register-failed' };
    }

    attachListeners(Notifications);
    return { ok: true, token };
  } catch (e: any) {
    return { ok: false, reason: e?.message || 'unknown' };
  }
}

/**
 * 挂通知点击 listener（点通知打开 App 时跳转到正确页面）
 * 只挂一次
 */
function attachListeners(Notifications: typeof import('expo-notifications')) {
  if (listenersAttached) return;
  listenersAttached = true;

  // App 已启动时收到点击
  Notifications.addNotificationResponseReceivedListener((response) => {
    handleNotificationTap(response.notification.request.content.data);
  });

  // App 冷启动时（点通知打开）
  Notifications.getLastNotificationResponseAsync().then((response) => {
    if (response) {
      handleNotificationTap(response.notification.request.content.data);
    }
  }).catch(() => {});
}

/**
 * 通知 payload → 页面跳转
 * data 结构（后端 pushService 定义）：
 *   { kind: 'job_ready', jobId: string, packId: number }
 *   { kind: 'job_failed', jobId: string }
 *   { kind: 'test' }
 */
function handleNotificationTap(data: any) {
  if (!data || typeof data !== 'object') return;
  const kind = data.kind;
  if (kind === 'job_ready' && data.packId) {
    router.push({
      pathname: '/episode/[id]',
      params: {
        id: String(data.packId),
        goal: 'quick_understand',
        jobId: data.jobId || '',
      },
    });
    return;
  }
  if (kind === 'job_failed' && data.jobId) {
    router.push({
      pathname: '/import/[jobId]',
      params: { jobId: data.jobId },
    });
    return;
  }
  // test / 未知 kind：不做跳转，让 App 停在当前页
}
