import { threadsSiteRule, getSiteRule } from '../../src/content/site-adapter.js';

describe('threadsSiteRule', () => {
  describe('match', () => {
    it('matches threads.com URLs', () => {
      expect(threadsSiteRule.match.test('https://www.threads.com/')).toBe(true);
      expect(threadsSiteRule.match.test('https://www.threads.com/@user')).toBe(true);
      expect(threadsSiteRule.match.test('https://www.threads.com/post/123')).toBe(true);
    });

    it('does not match other URLs', () => {
      expect(threadsSiteRule.match.test('https://threads.com/')).toBe(false);
      expect(threadsSiteRule.match.test('https://www.instagram.com/')).toBe(false);
    });
  });

  describe('extractUsername', () => {
    it('extracts username from valid href', () => {
      expect(threadsSiteRule.extractUsername('/@johndoe')).toBe('johndoe');
      expect(threadsSiteRule.extractUsername('/@user_123')).toBe('user_123');
      expect(threadsSiteRule.extractUsername('/@user.name')).toBe('user.name');
    });

    it('returns null for invalid href', () => {
      expect(threadsSiteRule.extractUsername('/johndoe')).toBeNull();
      expect(threadsSiteRule.extractUsername('/@')).toBeNull();
      expect(threadsSiteRule.extractUsername(null)).toBeNull();
      expect(threadsSiteRule.extractUsername('/post/123')).toBeNull();
    });
  });

  describe('isSupportedPath', () => {
    it('allows whitelisted paths', () => {
      expect(threadsSiteRule.isSupportedPath('/')).toBe(true);
      expect(threadsSiteRule.isSupportedPath('/@johndoe')).toBe(true);
      expect(threadsSiteRule.isSupportedPath('/@johndoe/post/ABC123')).toBe(true);
      expect(threadsSiteRule.isSupportedPath('/saved')).toBe(true);
      expect(threadsSiteRule.isSupportedPath('/following')).toBe(true);
      expect(threadsSiteRule.isSupportedPath('/ghost_posts')).toBe(true);
      expect(threadsSiteRule.isSupportedPath('/liked')).toBe(true);
    });

    it('blocks non-whitelisted paths', () => {
      expect(threadsSiteRule.isSupportedPath('/insights')).toBe(false);
      expect(threadsSiteRule.isSupportedPath('/messages')).toBe(false);
      expect(threadsSiteRule.isSupportedPath('/messages/123')).toBe(false);
      expect(threadsSiteRule.isSupportedPath('/settings/privacy')).toBe(false);
      expect(threadsSiteRule.isSupportedPath('/settings')).toBe(false);
      expect(threadsSiteRule.isSupportedPath('/activity')).toBe(false);
      expect(threadsSiteRule.isSupportedPath('/activity/replies')).toBe(false);
    });

    it('supports search page', () => {
      expect(threadsSiteRule.isSupportedPath('/search')).toBe(true);
      expect(threadsSiteRule.isSupportedPath('/search/recent')).toBe(true);
    });
  });

  describe('isMediaPath', () => {
    it('detects media lightbox paths', () => {
      expect(threadsSiteRule.isMediaPath('/@user/post/ABC/media')).toBe(true);
      expect(threadsSiteRule.isMediaPath('/post/ABC/media')).toBe(true);
    });

    it('returns false for non-media paths', () => {
      expect(threadsSiteRule.isMediaPath('/@user/post/ABC')).toBe(false);
      expect(threadsSiteRule.isMediaPath('/')).toBe(false);
    });
  });

  describe('isUIVisibleOnUrl', () => {
    it('shows UI on whitelisted paths', () => {
      expect(threadsSiteRule.isUIVisibleOnUrl('https://www.threads.com/')).toBe(true);
      expect(threadsSiteRule.isUIVisibleOnUrl('https://www.threads.com/@user')).toBe(true);
      expect(threadsSiteRule.isUIVisibleOnUrl('https://www.threads.com/@user/post/ABC')).toBe(true);
      expect(threadsSiteRule.isUIVisibleOnUrl('https://www.threads.com/liked')).toBe(true);
    });

    it('hides UI on non-whitelisted paths', () => {
      expect(threadsSiteRule.isUIVisibleOnUrl('https://www.threads.com/insights')).toBe(false);
      expect(threadsSiteRule.isUIVisibleOnUrl('https://www.threads.com/messages/abc')).toBe(false);
      expect(threadsSiteRule.isUIVisibleOnUrl('https://www.threads.com/settings/privacy')).toBe(
        false
      );
    });

    it('shows UI on search page', () => {
      expect(threadsSiteRule.isUIVisibleOnUrl('https://www.threads.com/search')).toBe(true);
      expect(threadsSiteRule.isUIVisibleOnUrl('https://www.threads.com/search/recent')).toBe(true);
    });

    it('hides UI on media lightbox even when path is whitelisted', () => {
      expect(threadsSiteRule.isUIVisibleOnUrl('https://www.threads.com/@user/post/ABC/media')).toBe(
        false
      );
    });
  });

  describe('isAvatarLink', () => {
    it('detects avatar link by Chinese text', () => {
      const link = {
        textContent: '個人檔案',
        getBoundingClientRect: () => ({ width: 60, height: 60 }),
      };
      expect(threadsSiteRule.isAvatarLink(link)).toBe(true);
    });

    it('detects avatar link by dimensions', () => {
      const link = {
        textContent: '',
        querySelector: () => null,
        getBoundingClientRect: () => ({ width: 60, height: 60 }),
      };
      expect(threadsSiteRule.isAvatarLink(link)).toBe(true);
    });

    it('detects image-only link as avatar', () => {
      const link = document.createElement('a');
      link.appendChild(document.createElement('img'));
      link.getBoundingClientRect = () => ({ width: 32, height: 32 });
      expect(threadsSiteRule.isAvatarLink(link)).toBe(true);
    });

    it('returns false for text link', () => {
      const link = {
        textContent: 'username',
        querySelector: () => null,
        getBoundingClientRect: () => ({ width: 80, height: 20 }),
      };
      expect(threadsSiteRule.isAvatarLink(link)).toBe(false);
    });
  });

  describe('isNavigationLink', () => {
    it('detects link inside nav element', () => {
      const nav = document.createElement('nav');
      const link = document.createElement('a');
      nav.appendChild(link);
      document.body.appendChild(nav);
      expect(threadsSiteRule.isNavigationLink(link)).toBe(true);
      document.body.removeChild(nav);
    });

    it('detects link inside role=navigation', () => {
      const div = document.createElement('div');
      div.setAttribute('role', 'navigation');
      const link = document.createElement('a');
      div.appendChild(link);
      document.body.appendChild(div);
      expect(threadsSiteRule.isNavigationLink(link)).toBe(true);
      document.body.removeChild(div);
    });

    it('returns false for link outside navigation', () => {
      const div = document.createElement('div');
      const link = document.createElement('a');
      div.appendChild(link);
      document.body.appendChild(div);
      expect(threadsSiteRule.isNavigationLink(link)).toBe(false);
      document.body.removeChild(div);
    });
  });

  describe('isComposeAreaLink', () => {
    it('detects link inside a textbox', () => {
      const textbox = document.createElement('div');
      textbox.setAttribute('role', 'textbox');
      const link = document.createElement('a');
      textbox.appendChild(link);
      document.body.appendChild(textbox);
      expect(threadsSiteRule.isComposeAreaLink(link)).toBe(true);
      document.body.removeChild(textbox);
    });

    it('detects link inside contenteditable', () => {
      const editable = document.createElement('div');
      editable.setAttribute('contenteditable', 'true');
      const link = document.createElement('a');
      editable.appendChild(link);
      document.body.appendChild(editable);
      expect(threadsSiteRule.isComposeAreaLink(link)).toBe(true);
      document.body.removeChild(editable);
    });

    it('returns false for link that is a sibling of a textbox', () => {
      const container = document.createElement('div');
      const link = document.createElement('a');
      const textbox = document.createElement('div');
      textbox.setAttribute('role', 'textbox');
      container.appendChild(link);
      container.appendChild(textbox);
      document.body.appendChild(container);
      expect(threadsSiteRule.isComposeAreaLink(link)).toBe(false);
      document.body.removeChild(container);
    });

    it('returns false for link in a regular comment', () => {
      const container = document.createElement('div');
      const link = document.createElement('a');
      container.appendChild(link);
      document.body.appendChild(container);
      expect(threadsSiteRule.isComposeAreaLink(link)).toBe(false);
      document.body.removeChild(container);
    });
  });

  describe('findContainer', () => {
    it('returns element with data-pressable-container', () => {
      const container = document.createElement('div');
      container.setAttribute('data-pressable-container', '');

      const parent = document.createElement('div');
      parent.appendChild(container);

      const link = document.createElement('a');
      container.appendChild(link);

      expect(threadsSiteRule.findContainer(link)).toBe(container);
    });

    it('returns element with 3+ children as fallback', () => {
      const container = document.createElement('div');
      container.appendChild(document.createElement('span'));
      container.appendChild(document.createElement('span'));
      container.appendChild(document.createElement('span'));

      const link = document.createElement('a');
      container.appendChild(link);

      expect(threadsSiteRule.findContainer(link)).toBe(container);
    });

    it('returns null if no suitable container', () => {
      const link = document.createElement('a');
      document.body.appendChild(link);

      expect(threadsSiteRule.findContainer(link)).toBeNull();

      document.body.removeChild(link);
    });
  });

  // ── findUserListRows(按讚/轉發等 dialog 名單:row 沒有 <a>,username 只在文字節點) ──

  describe('findUserListRows', () => {
    // 結構照 2026-09-06 debug 實測:row = 頭像 img 區 + data-pressable-container 內容區,
    // username 是純文字 span,頭像 alt 一定包含 username 原文
    function likerRow(username, alt, displayName = 'Display Name') {
      return `
        <div class="row">
          <div><div><img alt="${alt}"></div></div>
          <div><div data-pressable-container>
            <div>
              <span><div><div><span>${username}</span></div></div></span>
              <span><time aria-label="3分鐘前"><span>3分鐘</span></time></span>
            </div>
            <span><span>${displayName}</span></span>
            <div><div role="button" tabindex="0"><div>追蹤</div></div></div>
          </div></div>
        </div>`;
    }

    function likesDialog(rowsHtml) {
      return `
        <div role="dialog">
          <div class="list">
            <div class="post-header">
              <a href="/@author"><img alt="author的大頭貼照"></a>
              <a href="/@author">author</a>
              <span>貼文內容</span>
            </div>
            ${rowsHtml}
          </div>
        </div>`;
    }

    afterEach(() => {
      document.body.innerHTML = '';
    });

    it('extracts liker usernames from a likes dialog', () => {
      document.body.innerHTML = likesDialog(
        likerRow('zy___t.t', 'zy___t.t的大頭貼照') +
          likerRow('coldtea1127', 'coldtea1127的大頭貼照', 'ラムネビー玉コロコロ')
      );

      const rows = threadsSiteRule.findUserListRows(document.body);
      expect(rows.map((r) => r.username)).toEqual(['zy___t.t', 'coldtea1127']);
    });

    it('returns the row element (contains both avatar img and pressable) as container', () => {
      document.body.innerHTML = likesDialog(likerRow('alice_1', 'alice_1的大頭貼照'));

      const [row] = threadsSiteRule.findUserListRows(document.body);
      expect(row.container.querySelector('img[alt]')).not.toBeNull();
      expect(row.container.querySelector('[data-pressable-container]')).not.toBeNull();
      expect(row.container.className).toBe('row');
    });

    it('skips pressable rows that contain username anchors (regular comment flow)', () => {
      document.body.innerHTML = `
        <div role="dialog">
          <div data-pressable-container>
            <img alt="bob的大頭貼照">
            <a href="/@bob">bob</a>
          </div>
        </div>`;

      expect(threadsSiteRule.findUserListRows(document.body)).toEqual([]);
    });

    it('does not mistake a display name for the username (avatar alt boundary check)', () => {
      // display name "cold" 是 username "coldtea1127" 的 substring,
      // 單純 alt.includes(text) 會誤中 — 必須做字元邊界檢查
      document.body.innerHTML = likesDialog(
        likerRow('coldtea1127', 'coldtea1127的大頭貼照', 'cold')
      );

      const rows = threadsSiteRule.findUserListRows(document.body);
      expect(rows).toHaveLength(1);
      expect(rows[0].username).toBe('coldtea1127');
    });

    it('walks past a non-avatar img (e.g. media thumbnail) to the real avatar', () => {
      // pressable 內有帶 alt 的媒體縮圖:比對失敗不該讓整列被跳過,
      // 要繼續往上找到真正能驗證 username 的頭像那層
      document.body.innerHTML = likesDialog(`
        <div class="row">
          <div><div><img alt="alice_1的大頭貼照"></div></div>
          <div><div data-pressable-container>
            <span>alice_1</span>
            <img alt="媒體縮圖">
            <div role="button"><div>追蹤</div></div>
          </div></div>
        </div>`);

      const rows = threadsSiteRule.findUserListRows(document.body);
      expect(rows.map((r) => r.username)).toEqual(['alice_1']);
    });

    it('skips rows whose texts never match the avatar alt', () => {
      document.body.innerHTML = likesDialog(likerRow('someone_else', 'realuser的大頭貼照'));

      expect(threadsSiteRule.findUserListRows(document.body)).toEqual([]);
    });

    it('returns empty array when there is no dialog', () => {
      document.body.innerHTML = `<div>${likerRow('alice_1', 'alice_1的大頭貼照')}</div>`;

      expect(threadsSiteRule.findUserListRows(document.body)).toEqual([]);
    });

    it('dedups the same username within a dialog', () => {
      document.body.innerHTML = likesDialog(
        likerRow('alice_1', 'alice_1的大頭貼照') + likerRow('alice_1', 'alice_1的大頭貼照')
      );

      const rows = threadsSiteRule.findUserListRows(document.body);
      expect(rows).toHaveLength(1);
    });

    it('prefers visible rows over a hidden duplicate list (0x0 rects)', () => {
      // Threads dialog 內有一份隱藏的名單複本(rect 全 0),必須取可見那份
      document.body.innerHTML = `
        <div role="dialog">
          <div class="hidden-copy">${likerRow('alice_1', 'alice_1的大頭貼照')}</div>
          <div class="visible-copy">${likerRow('alice_1', 'alice_1的大頭貼照')}${likerRow('bob_2', 'bob_2的大頭貼照')}</div>
        </div>`;

      // jsdom rect 預設全 0 — 手動給 visible-copy 的 rows 尺寸
      document.querySelectorAll('.visible-copy .row').forEach((el) => {
        el.getBoundingClientRect = () => ({ width: 520, height: 67, top: 0, left: 0 });
      });

      const rows = threadsSiteRule.findUserListRows(document.body);
      expect(rows.map((r) => r.username).sort()).toEqual(['alice_1', 'bob_2']);
      expect(rows.every((r) => r.container.closest('.visible-copy'))).toBe(true);
    });

    it('keeps all rows when every rect is zero (test environments)', () => {
      document.body.innerHTML = likesDialog(likerRow('alice_1', 'alice_1的大頭貼照'));

      expect(threadsSiteRule.findUserListRows(document.body)).toHaveLength(1);
    });

    it('skips rows the isProcessed predicate claims, before extraction', () => {
      document.body.innerHTML = likesDialog(
        likerRow('alice_1', 'alice_1的大頭貼照') + likerRow('bob_2', 'bob_2的大頭貼照')
      );
      document.querySelectorAll('.row')[0].classList.add('marked');

      const rows = threadsSiteRule.findUserListRows(document.body, (row) =>
        row.classList.contains('marked')
      );
      // alice_1 被 predicate 跳過;sawProcessed 讓 0x0 的 bob_2 被當成隱藏複本丟棄
      // (真實瀏覽器中已處理過的 dialog 不該再收 0x0 rows)
      expect(rows).toEqual([]);
    });

    it('drops zero-rect rows on rescan when processed rows exist, keeps visible ones', () => {
      document.body.innerHTML = `
        <div role="dialog">
          <div class="hidden-copy">${likerRow('bob_2', 'bob_2的大頭貼照')}</div>
          <div class="visible-copy">${likerRow('alice_1', 'alice_1的大頭貼照')}${likerRow('carol_3', 'carol_3的大頭貼照')}</div>
        </div>`;
      document.querySelectorAll('.visible-copy .row').forEach((el) => {
        el.getBoundingClientRect = () => ({ width: 520, height: 67, top: 0, left: 0 });
      });
      // 模擬第二次 scan:可見的 alice_1 已標記
      document.querySelector('.visible-copy .row').classList.add('marked');

      const rows = threadsSiteRule.findUserListRows(document.body, (row) =>
        row.classList.contains('marked')
      );
      expect(rows.map((r) => r.username)).toEqual(['carol_3']);
    });
  });
});

describe('getSiteRule', () => {
  // URL is set to https://www.threads.com/@test via testEnvironmentOptions
  it('returns threadsSiteRule for threads.com (current environment)', () => {
    expect(getSiteRule()).toBe(threadsSiteRule);
  });

  // Test match regex directly for other URL scenarios
  it('match regex returns true for threads.com URLs', () => {
    expect(threadsSiteRule.match.test('https://www.threads.com/')).toBe(true);
    expect(threadsSiteRule.match.test('https://www.threads.com/@user')).toBe(true);
  });

  it('match regex returns false for other URLs', () => {
    expect(threadsSiteRule.match.test('https://www.example.com/')).toBe(false);
    expect(threadsSiteRule.match.test('https://threads.net/')).toBe(false);
  });
});
