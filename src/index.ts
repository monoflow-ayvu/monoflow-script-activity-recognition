import * as MonoUtils from "@fermuch/monoutils";
import { currentLogin } from "@fermuch/monoutils";
import { getUrgentNotification, setUrgentNotification, wakeup } from "./utils";

// based on settingsSchema @ package.json
type Config = {
  enableDoNotMoveWhileLocked: boolean;
  minimumAccuracy?: number;
  message?: string;
  enableDismissButton?: boolean;
}
const conf = new MonoUtils.config.Config<Config>();

declare class ActivityRecognitionEvent extends MonoUtils.wk.event.BaseEvent {
  kind: 'activity-recognition';
  getData(): {kind: string; data: {activityType: string; confidence: number}};
}

class MovingWhileLockedEvent extends MonoUtils.wk.event.BaseEvent {
  kind: 'moving-while-locked';
  constructor(public event: {activityType: string; confidence: number}) {
    super();
  }

  getData(): {activity: {activityType: string; confidence: number}} {
    return {
      activity: this.event,
    }
  }
}

function setNotification(message: string | false) {
  if (message !== false) {
    wakeup();
  }
  if (typeof message === 'string') {
    const buttonEnabled = conf.get('enableDismissButton', false);
    const actions = buttonEnabled ? [{
      name: 'OK',
      action: 'activity-recognition:ok',
      payload: {},
    }] : []
    setUrgentNotification({
      title: message,
      message: '',
      color: '#fa4023',
      actions: actions,
      urgent: true,
    });
  } else {
    setUrgentNotification(null);
  }
  if (message !== false) {
    wakeup();
  }
}

function isNotificationSet() {
  return !!getUrgentNotification()
}

interface Activity {
  name: string;
  confidence: number;
  since: number;
}

function setHourmeter(activity: Activity): void {
  const activitySeconds = (Date.now() - activity.since) / 1000;
  const hourmeterCol = MonoUtils.collections.getHourmeterDoc();
  const today = new Date().toISOString().split('T')[0];
  hourmeterCol.bump(activity.name, activitySeconds);
  hourmeterCol.bump(`${today}_${activity.name}`, activitySeconds);

  const login = currentLogin();
  if (login) {
    const col = env.project?.collectionsManager?.ensureExists?.<MonoUtils.collections.HourmeterCollection>(
      "hourmeters"
    );
    const loginDoc = col?.get(`_${login}`);
    if (loginDoc) {
      loginDoc.bump(activity.name, activitySeconds);
      loginDoc.bump(`${today}_${activity.name}`, activitySeconds);
    }
  }
}

function currentActivity(): Activity {
  let lastActivity = {name: 'unknown', confidence: 0} as Activity;
  try {
    const lastActivity = data.CURRENT_ACTIVITY as Activity | undefined;
    if (typeof lastActivity?.name === 'string' && typeof lastActivity?.confidence === 'number') {
      return lastActivity;
    }
  } catch (e) {
    /* ignore */
  }
  
  return lastActivity;
}

function setCurrentActivity(name: string, confidence: number): void {
  const lastActivity = currentActivity();
  let since = Date.now();
  if (lastActivity.name === name && lastActivity.since > 0) {
    since = lastActivity.since;
  } else {
    // save change of activity
    if (lastActivity.name !== 'unknown') {
      setHourmeter(lastActivity);
    }
  }
  const activity = {name, confidence, since} as Activity;
  env.setData('CURRENT_ACTIVITY', activity);
}

/**
 * Check if the activity has a significant change compared to the current activity.
 * A significant change is defined as a change of at least 30% of the confidence, or
 * a change of activity name.
 */
function isSignificantChange(name: string, confidence: number): boolean {
  const lastActivity = currentActivity();
  const lastName = lastActivity.name;
  const lastConfidence = lastActivity.confidence;
  const confidenceChange = Math.abs(lastConfidence - confidence);
  const nameChange = lastName !== name;
  return nameChange || confidenceChange > 0.3;
}

function updateNotification(data: {activityType: string; confidence: number}) {
  const isUnknownActivity = data?.activityType === 'UNKNOWN' || data?.activityType === 'TILTING';
  if (!isUnknownActivity && conf.get('enableDoNotMoveWhileLocked', false)) {
    const isStopped = data?.activityType === 'STILL';
    const isMoving = !isStopped;
    const isLocked = MonoUtils.wk.lock.getLockState();
    const hasConfidence = (data?.confidence || 0) >= (conf.get('minimumAccuracy', 0) / 100);
    
    if (isStopped && isNotificationSet() && hasConfidence) {
      setNotification(false);
    } else if (isMoving && isLocked && hasConfidence) {
      setNotification(conf.get('message', ''));
      env.project?.saveEvent(new MovingWhileLockedEvent(data));
      env.setData('FORCE_VOLUME_LEVEL', 1);
    }
  }
}

function changeHandler(event: ActivityRecognitionEvent): void {
  const data = event.getData()?.data;

  updateNotification(data);

  if (!isSignificantChange(data?.activityType, data?.confidence)) {
    return;
  }

  platform.log('saving significant activity recognition event', data);
  env.project?.saveEvent(event);
  setCurrentActivity(data?.activityType, data?.confidence);
}

messages.on('onInit', function() {
  platform.log('activity recognition script started');
  
  MonoUtils.wk.event.subscribe<ActivityRecognitionEvent>('activity-recognition', changeHandler);
});

messages.on('onCall', (name: string, args: unknown) => {
  if (name === 'activity-recognition:ok') {
    setUrgentNotification(null);
  }
});

messages.on('onPeriodic', () => {
  const activity = currentActivity();
  if (activity.confidence >= conf.get('minimumAccuracy', 0) / 100) {
    updateNotification({
      activityType: activity.name,
      confidence: activity.confidence,
    });
  }
})