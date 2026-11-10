let scheduledBody = '';

/** 每天 9:30 的本地通知。ask 为 false 时不弹权限框。许可只在睡眠页还停着的时候问，离开时不再问，避免框盖住运动页的结算。 */
export async function scheduleMorning(body: string, ask = false) {
  if (!body) return;
  if (body === scheduledBody && !ask) return;
  try {
    const Notifications = await import('expo-notifications');
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    const current = await Notifications.getPermissionsAsync();
    let granted = current.granted;
    if (!granted && ask && current.canAskAgain !== false) {
      granted = (await Notifications.requestPermissionsAsync()).granted;
    }
    if (!granted) return;
    if (body === scheduledBody) return;
    scheduledBody = body;
    await Notifications.cancelAllScheduledNotificationsAsync();
    await Notifications.scheduleNotificationAsync({
      content: { title: '今天', body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: 9, minute: 30 },
    });
  } catch {
    scheduledBody = '';
  }
}
