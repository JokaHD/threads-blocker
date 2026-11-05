/**
 * @jest-environment jsdom
 */

import { KeywordHighlighter } from '../../src/content/keyword-highlighter.js';
import { MessageType } from '../../src/shared/messages.js';

class FakeHighlight {
  constructor() {
    this.ranges = [];
  }
  add(range) {
    this.ranges.push(range);
  }
  get size() {
    return this.ranges.length;
  }
}

function makeRegistry() {
  const map = new Map();
  return {
    map,
    set: jest.fn((name, h) => map.set(name, h)),
    delete: jest.fn((name) => map.delete(name)),
  };
}

// Test adapter: body = every text node outside .meta; key from data-key
const siteRule = {
  getBodyTextNodes(container) {
    const nodes = [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.data.trim() && !n.parentElement.closest('.meta')) nodes.push(n);
    }
    return nodes;
  },
  getPostKey: (container, username) => container.dataset.key ?? `${username}:fallback`,
  getTheme: () => 'light',
};

function installChrome(initial) {
  const data = { ...initial };
  const listeners = [];
  global.chrome = {
    runtime: { id: 'test-extension' },
    storage: {
      local: {
        get: jest.fn(async (keys) =>
          Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, data[k]]))
        ),
      },
      onChanged: {
        addListener: jest.fn((cb) => listeners.push(cb)),
        removeListener: jest.fn(),
      },
    },
  };
  return (changes) => listeners.forEach((cb) => cb(changes, 'local'));
}

const KW = (id, text, enabled = true) => ({ id, text, enabled, createdAt: 1 });

describe('KeywordHighlighter', () => {
  let registry;
  let send;
  let fireStorage;
  let highlighter;
  const posts = [];

  function addPost(username, html, key) {
    const el = document.createElement('div');
    el.setAttribute('data-tb-comment-id', username);
    if (key) el.dataset.key = key;
    el.innerHTML = html;
    document.body.appendChild(el);
    posts.push(el);
    return el;
  }

  const painted = () => registry.map.get('tb-keyword')?.ranges.map((r) => r.toString()) ?? null;

  async function start(stored, options = {}) {
    fireStorage = installChrome(stored);
    registry = makeRegistry();
    send = jest.fn(async () => ({ ok: true }));
    highlighter = new KeywordHighlighter({
      siteRule,
      highlights: registry,
      HighlightClass: FakeHighlight,
      sendMessage: send,
      flushIntervalMs: 60_000,
      ...options,
    });
    await highlighter.init();
  }

  afterEach(() => {
    highlighter.destroy();
    posts.splice(0).forEach((el) => el.remove());
    delete document.documentElement.dataset.tbTheme;
  });

  test('paints every occurrence of enabled keywords, across text nodes', async () => {
    await start({ keywords: [KW('k1', '詐騙')] });
    const el = addPost('fake_user', '<span class="meta">詐騙</span><p>這是詐騙，詐<b>騙</b>集團</p>');

    highlighter.process(el, 'fake_user');

    expect(painted()).toEqual(['詐騙', '詐騙']);
  });

  test('a disabled keyword is reported but not painted', async () => {
    await start({ keywords: [KW('k1', '詐騙', false)] });
    const el = addPost('fake_user', '<p>這是詐騙</p>', '/@fake_user/post/1');

    highlighter.process(el, 'fake_user');
    await highlighter.flush();

    expect(painted()).toEqual([]);
    expect(send).toHaveBeenCalledWith({
      type: MessageType.KEYWORD_HITS,
      hits: [{ postKey: '/@fake_user/post/1', username: 'fake_user', keywordIds: ['k1'] }],
    });
  });

  test('the global switch removes and restores the highlight and notifies', async () => {
    await start({ keywords: [KW('k1', '詐騙')] });
    const listener = jest.fn();
    highlighter.onEnabledChange(listener);
    highlighter.process(addPost('fake_user', '<p>詐騙</p>'), 'fake_user');

    fireStorage({ keywordHighlightEnabled: { newValue: false } });
    expect(registry.map.has('tb-keyword')).toBe(false);
    expect(listener).toHaveBeenLastCalledWith(false);

    fireStorage({ keywordHighlightEnabled: { newValue: true } });
    expect(painted()).toEqual(['詐騙']);
    expect(listener).toHaveBeenLastCalledWith(true);
  });

  test('starts off when stored off, but still reports hits', async () => {
    await start({ keywordHighlightEnabled: false, keywords: [KW('k1', '詐騙')] });
    highlighter.process(addPost('fake_user', '<p>詐騙</p>'), 'fake_user');
    await highlighter.flush();

    expect(registry.map.has('tb-keyword')).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
  });

  test('reports each post and keyword pair once', async () => {
    await start({ keywords: [KW('k1', '詐騙')] });
    const el = addPost('fake_user', '<p>詐騙</p>', 'p1');

    highlighter.process(el, 'fake_user');
    await highlighter.flush();
    highlighter.process(el, 'fake_user');
    await highlighter.flush();

    expect(send).toHaveBeenCalledTimes(1);
  });

  test('a keyword added later is matched against posts already on the page', async () => {
    await start({ keywords: [KW('k1', '詐騙')] });
    highlighter.process(addPost('fake_user', '<p>加賴詐騙</p>', 'p1'), 'fake_user');
    await highlighter.flush();

    fireStorage({ keywords: { newValue: [KW('k1', '詐騙'), KW('k2', '加賴')] } });
    await highlighter.flush();

    expect(painted()).toEqual(['加賴', '詐騙']);
    expect(send).toHaveBeenLastCalledWith({
      type: MessageType.KEYWORD_HITS,
      hits: [{ postKey: 'p1', username: 'fake_user', keywordIds: ['k2'] }],
    });
  });

  test('refresh drops posts that left the page', async () => {
    await start({ keywords: [KW('k1', '詐騙')] });
    const el = addPost('fake_user', '<p>詐騙</p>');
    highlighter.process(el, 'fake_user');

    el.remove();
    highlighter.refresh();

    expect(painted()).toEqual([]);
  });

  test('refresh drops posts that lost their mark (route change)', async () => {
    await start({ keywords: [KW('k1', '詐騙')] });
    const el = addPost('fake_user', '<p>詐騙</p>');
    highlighter.process(el, 'fake_user');

    el.removeAttribute('data-tb-comment-id');
    highlighter.refresh();

    expect(painted()).toEqual([]);
  });

  test('refresh re-reads a re-rendered body', async () => {
    await start({ keywords: [KW('k1', '詐騙')] });
    const el = addPost('fake_user', '<p>沒有</p>', 'p1');
    highlighter.process(el, 'fake_user');
    expect(painted()).toEqual([]);

    el.querySelector('p').textContent = '展開後：詐騙';
    highlighter.refresh();
    await highlighter.flush();

    expect(painted()).toEqual(['詐騙']);
    expect(send).toHaveBeenCalledTimes(1);
  });

  test('skips posts without body text and counts them', async () => {
    await start({ keywords: [KW('k1', '詐騙')] });
    const el = addPost('fake_user', '<span class="meta">詐騙</span>');

    highlighter.process(el, 'fake_user');
    highlighter.process(el, 'fake_user');

    expect(painted()).toEqual([]);
    expect(highlighter.getDebugState().noBodyText).toBe(1);
  });

  test('counts fallback post keys', async () => {
    await start({ keywords: [KW('k1', '詐騙')] });
    highlighter.process(addPost('fake_user', '<p>詐騙</p>'), 'fake_user');
    expect(highlighter.getDebugState().fallbackKeys).toBe(1);
  });

  test('a failed send keeps the hits for the next flush', async () => {
    await start({ keywords: [KW('k1', '詐騙')] });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    send.mockRejectedValueOnce(new Error('Receiving end does not exist'));
    highlighter.process(addPost('fake_user', '<p>詐騙</p>', 'p1'), 'fake_user');

    await highlighter.flush();
    await highlighter.flush();

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0].hits).toEqual([
      { postKey: 'p1', username: 'fake_user', keywordIds: ['k1'] },
    ]);
    warn.mockRestore();
  });

  test('stops sending once the extension context is gone', async () => {
    await start({ keywords: [KW('k1', '詐騙')] });
    send.mockRejectedValue(new Error('Extension context invalidated.'));
    highlighter.process(addPost('fake_user', '<p>詐騙</p>', 'p1'), 'fake_user');
    delete chrome.runtime.id;

    await highlighter.flush();
    highlighter.process(addPost('fake_user', '<p>詐騙 2</p>', 'p2'), 'fake_user');
    await highlighter.flush();

    expect(send).toHaveBeenCalledTimes(1);
  });

  test('works without the Highlight API: no painting, hits still reported', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await start({ keywords: [KW('k1', '詐騙')] }, { highlights: undefined });
    highlighter.process(addPost('fake_user', '<p>詐騙</p>'), 'fake_user');
    await highlighter.flush();

    expect(send).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test('tags the page theme for the highlight colors', async () => {
    await start({ keywords: [] });
    expect(document.documentElement.dataset.tbTheme).toBe('light');
  });
});
