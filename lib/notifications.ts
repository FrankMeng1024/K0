// K0 — Push 通知: 注册 token + 点击通知深链跳转 (#106)
// 之前后端推送系统齐全但前端从不注册 token、也不处理点击 → 通知既收不到也点不动。
// 这里补上: 登录后注册 Expo push token(POST /api/push/register); 点通知按 data.kind 深链:
//   review_due → /review; job_ready → /episode/[packId]。
// Web / dev(expo-notifications 不可用) 全部安全 no-op。
import { Platform } from 'react-native';
import { apiFetch } from './api';
import { getSessionSync } from './auth';

let responseSubscription: { remove: () => void } | null = null;
let registered = false;
// #108: 点通知冷启动时用户还没登录 → 深链目标会被登录页盖掉丢失。
//   先把目标存这里, 登录成功后 consumePendingRoute() 消费跳转。
let pendingRoute: string | null = null;

// #106 QA-fix: 登出时复位, 否则换账号 registered 恒 true → B 用户的 token 不再注册(绑不到后端)。
export function resetPushRegistration() {
  registered = false;
}

// data.kind → 目标路由。未知/无效返回 null。
function routeForData(data: any): string | null {
  if (!data || typeof data !== 'object') return null;
  if (data.kind === 'review_due') return '/review';
  if (data.kind === 'job_ready' && data.packId != null) {
    return `/episode/${data.packId}?direct=1&packId=${data.packId}`;
  }
  return null;
}

// 点通知后深链。已登录直接跳; 未登录(冷启动点通知)先存, 登录后消费。
async function routeFromData(data: any) {
  const target = routeForData(data);
  if (!target) return;
  try {
    const session = getSessionSync();
    if (!session?.token) {
      // 还没登录 → 存下来, 登录成功后 consumePendingRoute 跳
      pendingRoute = target;
      return;
    }
    const { router } = await import('expo-router');
    router.push(target as any);
  } catch { /* 路由未就绪时静默; target 已丢弃, 但已登录场景 addListener 会再触发 */ }
}

/**
 * #108: 登录成功后调用。若有通知点击留下的待跳路由, 消费并跳转。
 */
export async function consumePendingRoute(): Promise<void> {
  if (Platform.OS === 'web' || !pendingRoute) return;
  const target = pendingRoute;
  pendingRoute = null;
  try {
    const { router } = await import('expo-router');
    // 稍等路由栈就绪 (登录 replace('/') 刚发生)
    setTimeout(() => { router.push(target as any); }, 350);
  } catch { /* 忽略 */ }
}

/**
 * 注册本机 push token 到后端 (登录成功后调用)。
 * 幂等: 同一 session 只注册一次。web/无权限/无设备 → 安全跳过。
 */
export async function registerPushToken(): Promise<void> {
  if (Platform.OS === 'web' || registered) return;
  try {
    const Notifications = await import('expo-notifications');

    const settings = await Notifications.getPermissionsAsync();
    let granted = settings.granted || settings.ios?.status === 3; // 3 = provisional
    if (!granted) {
      const req = await Notifications.requestPermissionsAsync();
      granted = req.granted || req.ios?.status === 3;
    }
    if (!granted) return;

    const tokenResp = await Notifications.getExpoPushTokenAsync({
      // SDK 54+ 必须显式传 projectId(裸 EAS 项目), 否则 throw "No projectId"。
      // 值 = app.json extra.eas.projectId (稳定公开标识)。
      projectId: '98f1615c-8cfd-4738-952f-b1ad65529536',
    });
    const token = tokenResp?.data;
    if (!token) return;

    await apiFetch('/api/push/register', {
      method: 'POST',
      body: JSON.stringify({ token, platform: Platform.OS }),
    }).catch(() => {});
    registered = true;
  } catch { /* expo-notifications 不可用/权限拒绝 → 忽略 */ }
}

/**
 * 挂载通知点击监听 + 处理冷启动时的点击 (App 从通知打开)。
 * 在 root layout 调一次。返回 cleanup。
 */
export function attachNotificationRouting(): () => void {
  if (Platform.OS === 'web') return () => {};
  (async () => {
    try {
      const Notifications = await import('expo-notifications');
      // 冷启动: App 被通知点开
      const last = await Notifications.getLastNotificationResponseAsync();
      if (last?.notification?.request?.content?.data) {
        routeFromData(last.notification.request.content.data);
      }
      // 运行中点击
      responseSubscription = Notifications.addNotificationResponseReceivedListener((resp) => {
        routeFromData(resp?.notification?.request?.content?.data);
      });
    } catch { /* 忽略 */ }
  })();
  return () => { responseSubscription?.remove(); responseSubscription = null; };
}
