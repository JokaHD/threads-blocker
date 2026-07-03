/**
 * SW cold-start init race:訊息在 init() 完成前到達，不可覆蓋已持久化的 queue。
 * 注意:本檔不可呼叫 resetChromeMocks()——依賴 import 前設定的 mockImplementation。
 */
import { setupChromeMocks, mockStorage, mockRuntime } from '../setup.js';
import { MessageType } from '../../src/shared/messages.js';

setupChromeMocks();

// 讓 init() 的 loadQueue 卡住,直到測試呼叫 releaseInit()
let releaseInit;
const initGate = new Promise((resolve) => (releaseInit = resolve));
const savedItems = [
  {
    userId: '1',
    username: 'alice',
    state: 'queued',
    seq: 0,
    flags: [],
    error: null,
    errorType: null,
    retries: 0,
  },
];

mockStorage.get.mockImplementation(async (key) => {
  if (key === 'blockQueue') {
    await initGate;
    return { blockQueue: savedItems };
  }
  return {}; // cooldownEnd 等其他 key:不存在
});

await import('../../src/background/service-worker.js');
const handler = mockRuntime.onMessage.addListener.mock.calls[0][0];
const sender = { url: 'https://www.threads.com/' };
const send = (message) => new Promise((resolve) => handler(message, sender, resolve));

describe('Service Worker init gate', () => {
  test('init 完成前收到的 ENQUEUE_BLOCK 不會覆蓋已持久化的 queue', async () => {
    // init() 尚未完成(卡在 initGate),此時送入訊息
    const enqueuePromise = send({ type: MessageType.ENQUEUE_BLOCK, userId: '2', username: 'bob' });

    // 給 handler 執行機會:未修復時 enqueue 會在這裡就跑在空 queue 上
    await new Promise((r) => setTimeout(r, 10));

    releaseInit();
    await enqueuePromise;

    const { items } = await send({ type: MessageType.GET_ALL_STATES });
    expect(items.map((i) => i.userId).sort()).toEqual(['1', '2']);
  });
});
