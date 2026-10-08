import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

// Exercise the actual component with deterministic hooks and service response ordering.
// Browser/TTS integration is verified separately; these tests do not synthesize audio.
async function harness() {
  const slots = [];
  const effects = [];
  const cleanups = [];
  let cursor = 0;
  const context = {
    readyCalls: [],
    requests: [],
    current: null,
    deferPoll: false,
    deferInput: false,
    utterances: [],
    hooks: {
      useState(initial) {
        const index = cursor++;
        if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
        return [
          slots[index],
          (value) => {
            slots[index] = typeof value === 'function' ? value(slots[index]) : value;
          },
        ];
      },
      useRef(initial) {
        const index = cursor++;
        if (!(index in slots)) slots[index] = { current: initial };
        return slots[index];
      },
      useCallback(callback, deps) {
        const index = cursor++;
        if (!slots[index] || deps.some((value, i) => value !== slots[index].deps[i]))
          slots[index] = { callback, deps };
        return slots[index].callback;
      },
      useEffect(callback, deps) {
        const index = cursor++;
        if (!slots[index] || deps.some((value, i) => value !== slots[index][i]))
          effects.push(callback);
        slots[index] = deps;
      },
    },
  };
  context.service = {
    setDisplaySoundReady: async (ready) => {
      context.readyCalls.push(ready);
      return { ready };
    },
    getCurrentAnnouncement: () =>
      context.deferPoll
        ? new Promise((resolve) => context.requests.push(resolve))
        : Promise.resolve(context.current),
    setAnnouncementInput: async (_id, action) => {
      const updated = {
        ...context.current,
        deliveries: context.current.deliveries.map((delivery) => ({
          ...delivery,
          inputActive: action === 'START',
          pauseUsed: true,
        })),
      };
      if (context.deferInput)
        await new Promise((resolve) => {
          context.resolveInput = resolve;
        });
      if (context.current?.id === updated.id) context.current = updated;
      return updated;
    },
    confirmAnnouncementDisplayed: async () => context.current,
    reportAnnouncementPlayback: async () => ({ accepted: true }),
    replyAnnouncement: async () => {
      context.current = null;
    },
  };
  context.realtime = {
    subscribe: (_type, _classId, callback) => {
      context.event = callback;
      return () => {};
    },
    subscribeStatus: (callback) => {
      context.status = callback;
      callback('DISCONNECTED');
      return () => {};
    },
  };
  globalThis.__announcementTest = context;
  globalThis.window = {
    speechSynthesis: {
      cancel() {},
      getVoices: () => [],
      speak: (utterance) => context.utterances.push(utterance),
    },
    setTimeout: () => 1,
    clearTimeout() {},
    setInterval: (callback) => {
      context.interval = callback;
      return 1;
    },
    clearInterval() {},
  };
  globalThis.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = text;
    }
  };
  const mocks = {
    react:
      'export const {useState,useEffect,useRef,useCallback}=globalThis.__announcementTest.hooks;',
    'react/jsx-runtime':
      'export const Fragment="Fragment"; export const jsx=(type,props)=>({type,props}); export const jsxs=jsx;',
    antd: 'export const Button="Button"; export const Input={TextArea:"TextArea"};',
    '@/components/providers/classroom-system-provider':
      'export const useClassroomService=()=>globalThis.__announcementTest.service; export const useRealtimeClient=()=>globalThis.__announcementTest.realtime;',
    '@/lib/session':
      'export const getDisplaySession=()=>({deviceId:"device-1",classId:"class-1"});',
    '@/lib': 'export class ClassroomServiceError extends Error {}',
  };
  const bundled = await build({
    entryPoints: [
      fileURLToPath(new URL('../src/features/classroom/display-announcement.tsx', import.meta.url)),
    ],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    jsx: 'automatic',
    plugins: [
      {
        name: 'announcement-test',
        setup(builder) {
          builder.onResolve({ filter: /^(react(?:\/jsx-runtime)?|antd|@\/)/ }, (args) =>
            mocks[args.path] ? { path: args.path, namespace: 'mock' } : undefined,
          );
          builder.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({
            contents: mocks[args.path],
            loader: 'js',
          }));
        },
      },
    ],
  });
  const code = `${bundled.outputFiles[0].text}\n// ${crypto.randomUUID()}`;
  const { DisplayAnnouncement } = await import(
    `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
  );
  const props = {
    data: { layout: { seats: [] } },
    activeRef: { current: false },
    onHighlightStart() {},
    onHighlightEnd() {},
    onFinish() {},
  };
  const nodes = (node) =>
    !node || typeof node !== 'object'
      ? []
      : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
  context.render = () => {
    cursor = 0;
    const tree = DisplayAnnouncement(props);
    effects.splice(0).forEach((effect) => {
      const cleanup = effect();
      if (cleanup) cleanups.push(cleanup);
    });
    return nodes(tree);
  };
  context.inputVisible = () => context.render().some((node) => node.type === 'TextArea');
  context.click = (label) => {
    const button = context
      .render()
      .find((node) => node.type === 'Button' && node.props.children === label);
    assert.ok(button, `Missing button: ${label}`);
    button.props.onClick();
  };
  context.flush = async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  };
  context.dispose = () => {
    cleanups.forEach((cleanup) => cleanup());
    delete globalThis.__announcementTest;
    delete globalThis.window;
    delete globalThis.SpeechSynthesisUtterance;
  };
  context.render();
  await context.flush();
  return context;
}

function announcement(overrides = {}) {
  return {
    id: 'a1',
    status: 'DISPLAYING',
    text: '测试',
    teacherName: '老师',
    repeatCount: 2,
    durationSeconds: 30,
    primaryDeviceId: 'device-1',
    deliveries: [
      {
        deviceId: 'device-1',
        displayedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30000).toISOString(),
        inputActive: false,
        pauseUsed: false,
        playedCount: 2,
      },
    ],
    ...overrides,
  };
}

test('idle reconnect re-registers sound readiness', async (t) => {
  const h = await harness();
  t.after(h.dispose);
  const before = h.readyCalls.length;
  h.status('DISCONNECTED');
  h.status('CONNECTED');
  await h.flush();
  assert.equal(h.readyCalls.length, before + 1);
  assert.equal(h.readyCalls.at(-1), true);
});

test('old polling responses cannot close input after START or reopen it after RETURN', async (t) => {
  const h = await harness();
  t.after(h.dispose);
  h.current = announcement();
  h.event();
  await h.flush();
  const previous = h.current;
  h.deferPoll = true;
  h.interval();
  h.click('自定义回复');
  await h.flush();
  assert.equal(h.inputVisible(), true);
  h.requests.shift()(previous);
  await h.flush();
  assert.equal(h.inputVisible(), true);
  const paused = h.current;
  h.interval();
  h.click('返回');
  await h.flush();
  assert.equal(h.inputVisible(), false);
  h.requests.shift()(paused);
  await h.flush();
  assert.equal(h.inputVisible(), false);
});

test('pending START ignores incoming polls and prevents duplicate input submissions', async (t) => {
  const h = await harness();
  t.after(h.dispose);
  h.current = announcement();
  h.event();
  await h.flush();
  h.deferPoll = true;
  h.interval();
  h.deferInput = true;
  h.click('自定义回复');
  h.click('自定义回复');
  const resolveInput = h.resolveInput;
  h.requests.shift()(h.current);
  await h.flush();
  assert.equal(h.inputVisible(), false);
  assert.equal(h.resolveInput, resolveInput);
  resolveInput();
  await h.flush();
  assert.equal(h.inputVisible(), true);
});

test('slow polling is deduplicated without discarding every response', async (t) => {
  const h = await harness();
  t.after(h.dispose);
  h.deferPoll = true;
  h.event();
  h.event();
  h.status('CONNECTED');
  assert.equal(h.requests.length, 1);
  h.requests.shift()(announcement());
  await h.flush();
  assert.ok(h.render().some((node) => node.props?.['aria-label'] === '远程喊话'));
  assert.equal(h.requests.length, 1, 'Queued notification requests one follow-up');
  h.requests.shift()(null);
  await h.flush();
});

test('teacher ending a message during START is still observed and a late START response cannot reopen it', async (t) => {
  const h = await harness();
  t.after(h.dispose);
  h.current = announcement();
  h.event();
  await h.flush();
  h.deferInput = true;
  h.click('自定义回复');
  h.current = null;
  h.event();
  await h.flush();
  assert.equal(
    h.render().some((node) => node.props?.['aria-label'] === '远程喊话'),
    false,
  );
  h.resolveInput();
  await h.flush();
  assert.equal(
    h.render().some((node) => node.props?.['aria-label'] === '远程喊话'),
    false,
  );
});

test('reconnect preserves failed speech readiness and its manual retry button', async (t) => {
  const h = await harness();
  t.after(h.dispose);
  h.current = announcement({
    deliveries: [
      {
        deviceId: 'device-1',
        displayedAt: null,
        expiresAt: new Date(Date.now() + 30000).toISOString(),
        inputActive: false,
        playedCount: 0,
      },
    ],
  });
  h.event();
  await h.flush();
  assert.equal(h.utterances.length, 1);
  h.utterances[0].onerror({ error: 'not-allowed' });
  await h.flush();
  h.status('CONNECTED');
  await h.flush();
  assert.equal(h.readyCalls.at(-1), false);
  assert.ok(
    h.render().some((node) => node.type === 'Button' && node.props.children === '启用声音'),
  );
});
