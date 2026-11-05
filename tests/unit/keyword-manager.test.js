/**
 * @jest-environment jsdom
 */

import { KeywordManager } from '../../src/content/ui/keyword-manager.js';

function installChrome(initial = {}) {
  const data = { ...initial };
  const listeners = [];
  global.chrome = {
    storage: {
      local: {
        get: jest.fn(async (keys) =>
          Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, data[k]]))
        ),
        set: jest.fn(async (items) => {
          const changes = {};
          for (const [k, v] of Object.entries(items)) {
            changes[k] = { oldValue: data[k], newValue: v };
            data[k] = v;
          }
          listeners.forEach((cb) => cb(changes, 'local'));
        }),
      },
      onChanged: {
        addListener: jest.fn((cb) => listeners.push(cb)),
        removeListener: jest.fn((cb) => listeners.splice(listeners.indexOf(cb), 1)),
      },
    },
  };
  return data;
}

const KEYWORDS = [
  { id: 'k1', text: '詐騙', enabled: true, createdAt: 1 },
  { id: 'k2', text: '加賴', enabled: true, createdAt: 2 },
  { id: 'k3', text: 'line', enabled: false, createdAt: 3 },
];
const STATS = {
  since: new Date('2026-11-06T00:00:00').getTime(),
  perKeyword: {
    k1: { hits: 143, blocked: 38 },
    k2: { hits: 96, blocked: 51 },
    k3: { hits: 6, blocked: 2 },
  },
  posts: {},
};

describe('KeywordManager', () => {
  let root;
  let manager;
  let ids;

  const rows = () => [...root.querySelectorAll('#km-rows tr')];
  const cells = (tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent.trim());
  const submit = (text) => {
    root.querySelector('#km-input').value = text;
    root
      .querySelector('#km-add-form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  async function mount(initial) {
    const data = installChrome(initial);
    root = document.createElement('main');
    document.body.appendChild(root);
    let n = 0;
    ids = () => `new${++n}`;
    manager = new KeywordManager(root, { newId: () => ids() });
    await manager.init();
    return data;
  }

  afterEach(() => {
    manager.destroy();
    root.remove();
    jest.useRealTimers();
  });

  test('lists keywords by posts seen, with counts and block rate', async () => {
    await mount({ keywords: KEYWORDS, keywordStats: STATS });

    expect(rows().map(cells)).toEqual([
      ['', '詐騙', '143', '38', '27%', '✕'],
      ['', '加賴', '96', '51', '53%', '✕'],
      ['', 'line', '6', '2', '—', '✕'],
    ]);
    expect(rows()[2].classList.contains('km-row--off')).toBe(true);
    expect(root.querySelector('#km-foot').textContent).toContain('2026/11/6');
  });

  test('ignores edits until the stored list has loaded', async () => {
    const data = installChrome({ keywords: KEYWORDS });
    let answer;
    const realGet = chrome.storage.local.get;
    chrome.storage.local.get = jest.fn(
      (keys) => new Promise((r) => (answer = () => r(realGet(keys))))
    );
    root = document.createElement('main');
    document.body.appendChild(root);
    manager = new KeywordManager(root, { newId: () => 'early' });
    const loading = manager.init();

    // The overlay focuses the input at once: a submit can beat storage
    submit('太早');
    root.querySelector('#km-global-switch').click();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();

    answer();
    await loading;
    expect(data.keywords).toEqual(KEYWORDS);
    submit('之後');
    await settle();
    expect(data.keywords.map((k) => k.text)).toEqual(['詐騙', '加賴', 'line', '之後']);
  });

  test('shows an empty state without keywords', async () => {
    await mount({});
    expect(root.querySelector('#km-empty').hidden).toBe(false);
    expect(rows()).toHaveLength(0);
  });

  test('adds a keyword on top and clears the input', async () => {
    const data = await mount({ keywords: KEYWORDS, keywordStats: STATS });

    submit('  飆股 ');
    await settle();

    expect(data.keywords.at(-1)).toMatchObject({ id: 'new1', text: '飆股', enabled: true });
    expect(cells(rows()[0])[1]).toBe('飆股');
    expect(root.querySelector('#km-input').value).toBe('');
    expect(root.querySelector('#km-error').hidden).toBe(true);
  });

  test('rejects a duplicate, case-insensitively', async () => {
    await mount({ keywords: KEYWORDS });

    submit('LINE');
    await settle();

    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    const error = root.querySelector('#km-error');
    expect(error.hidden).toBe(false);
    expect(error.textContent).toBe('「LINE」已在清單中');
  });

  test('rejects empty and too long input', async () => {
    await mount({});

    submit('   ');
    expect(root.querySelector('#km-error').textContent).toBe('請輸入關鍵字');

    submit('a'.repeat(31));
    expect(root.querySelector('#km-error').textContent).toBe('關鍵字最多 30 字');
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  test('toggles a single keyword', async () => {
    const data = await mount({ keywords: KEYWORDS });

    rows()[0].querySelector('[data-action="toggle"]').click();
    await settle();

    expect(data.keywords.find((k) => k.id === 'k1').enabled).toBe(false);
    const row = root.querySelector('tr[data-id="k1"]');
    expect(row.classList.contains('km-row--off')).toBe(true);
    expect(row.querySelector('[data-action="toggle"]').getAttribute('aria-checked')).toBe('false');
  });

  test('deletes only on the second click', async () => {
    const data = await mount({ keywords: KEYWORDS });
    const del = () => root.querySelector('tr[data-id="k2"] [data-action="delete"]');

    del().click();
    expect(del().textContent).toBe('刪除？');
    expect(chrome.storage.local.set).not.toHaveBeenCalled();

    del().click();
    await settle();

    expect(data.keywords.map((k) => k.id)).toEqual(['k1', 'k3']);
    expect(root.querySelector('tr[data-id="k2"]')).toBeNull();
  });

  test('the delete confirmation reverts after 3 seconds', async () => {
    await mount({ keywords: KEYWORDS });
    jest.useFakeTimers();
    const del = () => root.querySelector('tr[data-id="k2"] [data-action="delete"]');

    del().click();
    jest.advanceTimersByTime(3000);

    expect(del().textContent).toBe('✕');
  });

  test('the global switch writes the setting', async () => {
    const data = await mount({ keywords: KEYWORDS });
    const sw = root.querySelector('#km-global-switch');
    expect(sw.getAttribute('aria-checked')).toBe('true');

    sw.click();
    await settle();

    expect(data.keywordHighlightEnabled).toBe(false);
    expect(sw.getAttribute('aria-checked')).toBe('false');
  });

  test('a destroy before storage answers leaves no listener behind', async () => {
    installChrome({});
    root = document.createElement('main');
    document.body.appendChild(root);
    manager = new KeywordManager(root);

    const pending = manager.init();
    manager.destroy();
    await pending;

    expect(chrome.storage.onChanged.addListener).not.toHaveBeenCalled();
  });

  test('re-renders on changes made elsewhere', async () => {
    await mount({ keywords: KEYWORDS, keywordStats: STATS });

    await chrome.storage.local.set({
      keywordStats: {
        ...STATS,
        perKeyword: { ...STATS.perKeyword, k3: { hits: 500, blocked: 100 } },
      },
    });

    expect(cells(rows()[0])).toEqual(['', 'line', '500', '100', '20%', '✕']);
  });
});
