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

describe("onInit", () => {
  // clean listeners
  afterEach(() => {
    messages.removeAllListeners();
  });

  it('runs without errors', () => {
    loadScript();
    messages.emit('onInit');
  });

  it('stores activity events', () => {
    (env.project as any) = {
      saveEvent: jest.fn()
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
});