import * as MonoUtils from "@fermuch/monoutils";

// based on settingsSchema @ package.json
// type Config = {}
// const conf = new MonoUtils.config.Config<Config>();

declare class ActivityRecognitionEvent extends MonoUtils.wk.event.BaseEvent {
  kind: 'activity-recognition';
  getData(): {kind: string; data: {activityType: string; confidence: number}};
}

messages.on('onInit', function() {
  platform.log('activity recognition script started');
  
  MonoUtils.wk.event.subscribe<ActivityRecognitionEvent>('activity-recognition', (ev) => {
    const data = ev.getData();
    platform.log('activity recognition event', data);
    env.project?.saveEvent(ev);
  });
});