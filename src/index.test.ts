import * as MonoUtils from '@fermuch/monoutils';
const read = require('fs').readFileSync;
const join = require('path').join;

function loadScript() {
  // import global script
  const script = read(join(__dirname, '..', 'dist', 'bundle.js')).toString('utf-8');
  eval(script);
}

class MockActivityRecognitionEvent extends MonoUtils.wk.event.BaseEvent {
  kind = 'activity-recognition' as const;

  constructor(private activityType: string, private confidence: number) {
    super();
  }
  
  getData() {
    return {
      kind: this.kind,
      data: {
        activityType: this.activityType,
        confidence: this.confidence,
      }
    };
  };
}

jest.useFakeTimers('modern');
describe("onInit", () => {
  // clean listeners
  afterEach(() => {
    messages.removeAllListeners();
    env.data.CURRENT_ACTIVITY = undefined;
  });

  it('runs without errors', () => {
    loadScript();
    messages.emit('onInit');
  });

  it('stores activity events', () => {
    (env.project as any) = {
      saveEvent: jest.fn(),
      collectionsManager: {
        ensureExists: () => ({
          watch: jest.fn(),
          bump: jest.fn(),
          get: () => ({
            bump: jest.fn(),
          }),
        }),
      }
    };

    const ev = new MockActivityRecognitionEvent('STILL', 0.9);

    loadScript();
    messages.emit('onInit');
    messages.emit('onEvent', ev);

    expect(env.project.saveEvent).toHaveBeenCalledTimes(1);
    const call = (env.project.saveEvent as jest.Mock).mock.calls[0];
    expect(call[0].createdAt).toBeTruthy();
    expect(call[0].deviceId).toBe("TEST");
    expect(call[0].kind).toBe("activity-recognition");
    expect(call[0].loginId).toBe("");
  });

  it('only stores significant changes (different name)', () => {
    (env.project as any) = {
      saveEvent: jest.fn(),
      collectionsManager: {
        ensureExists: () => ({
          watch: jest.fn(),
          bump: jest.fn(),
          get: () => ({
            bump: jest.fn(),
          }),
        }),
      }
    };

    const ev = new MockActivityRecognitionEvent('STILL', 0.9);
    const ev2 = new MockActivityRecognitionEvent('WALKING', 0.9);

    loadScript();
    messages.emit('onInit');
    messages.emit('onEvent', ev);
    messages.emit('onEvent', ev);
    messages.emit('onEvent', ev2);

    expect(env.project.saveEvent).toHaveBeenCalledTimes(2);
    const call = (env.project.saveEvent as jest.Mock).mock.calls[0];
    expect(call[0].createdAt).toBeTruthy();
    expect(call[0].deviceId).toBe("TEST");
    expect(call[0].kind).toBe("activity-recognition");
    expect(call[0].loginId).toBe("");

    const call2 = (env.project.saveEvent as jest.Mock).mock.calls[1];
    expect(call2[0].createdAt).toBeTruthy();
    expect(call2[0].deviceId).toBe("TEST");
    expect(call2[0].kind).toBe("activity-recognition");
    expect(call2[0].loginId).toBe("");
  })

  it('stores hourmeter seconds for activity', () => {
    const col = {};
    (env.project as any) = {
      saveEvent: jest.fn(),
      collectionsManager: {
        ensureExists: () => ({
          watch: jest.fn(),
          bump: (key, val) => {col[key] = (col[key] || 0) + val},
          get: () => ({
            bump: (key, val) => {col[key] = (col[key] || 0) + val},
          }),
        }),
      }
    };

    const still = new MockActivityRecognitionEvent('STILL', 0.9);
    const vehicle = new MockActivityRecognitionEvent('IN_VEHICLE', 1);

    loadScript();
    messages.emit('onInit');
    // from unknown to still
    jest.setSystemTime(new Date('2020-01-01T00:00:00.000Z').getTime());
    messages.emit('onEvent', still);
    jest.setSystemTime(new Date('2020-01-01T00:01:00.000Z').getTime());
    // from still to in vehicle
    messages.emit('onEvent', vehicle);
    jest.setSystemTime(new Date('2020-01-01T00:02:00.000Z').getTime());
    // continue in vehicle
    messages.emit('onEvent', vehicle);
    jest.setSystemTime(new Date('2020-01-01T00:03:00.000Z').getTime());
    // from in vehicle to still
    messages.emit('onEvent', still);

    console.log(col);
    expect(col['STILL']).toBe(60);
    expect(col['2020-01-01_STILL']).toBe(60);
    expect(col['IN_VEHICLE']).toBe(120);
    expect(col['2020-01-01_IN_VEHICLE']).toBe(120);
  });
});