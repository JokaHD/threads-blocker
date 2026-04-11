/** @jest-environment jsdom */

import { DOMObserver } from '../../src/content/dom-observer.js';

describe('DOMObserver', () => {
  let observer;

  beforeEach(() => {
    observer = new DOMObserver();
    document.body.innerHTML = '';
  });

  // ── extractUsername ────────────────────────────────────────────────────────

  describe('extractUsername', () => {
    it('parses a simple /@username href', () => {
      expect(observer.extractUsername('/@johndoe')).toBe('johndoe');
    });

    it('parses usernames with underscores and dots', () => {
      expect(observer.extractUsername('/@john.doe_123')).toBe('john.doe_123');
    });

    it('returns null for /explore', () => {
      expect(observer.extractUsername('/explore')).toBeNull();
    });

    it('returns null for an external URL', () => {
      expect(observer.extractUsername('https://example.com/@user')).toBeNull();
    });

    it('returns null for bare @username (missing leading slash)', () => {
      expect(observer.extractUsername('@johndoe')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(observer.extractUsername('')).toBeNull();
    });

    it('returns null for /@username/post/123 (extra path segments)', () => {
      expect(observer.extractUsername('/@johndoe/post/123')).toBeNull();
    });
  });

  // ── findComments ──────────────────────────────────────────────────────────

  describe('findComments', () => {
    it('detects a comment element containing a /@username link', () => {
      document.body.innerHTML = `
        <div class="comment">
          <a href="/@alice">Alice</a>
          <p>Some comment text</p>
        </div>
      `;
      const comments = observer.findComments(document.body);
      expect(comments).toHaveLength(1);
      expect(comments[0].username).toBe('alice');
    });

    it('detects multiple comments', () => {
      document.body.innerHTML = `
        <div class="feed">
          <div class="comment"><a href="/@alice">Alice</a><p>text</p></div>
          <div class="comment"><a href="/@bob">Bob</a><p>text</p></div>
        </div>
      `;
      const comments = observer.findComments(document.body);
      const usernames = comments.map((c) => c.username).sort();
      expect(usernames).toEqual(['alice', 'bob']);
    });

    it('ignores /explore links', () => {
      document.body.innerHTML = `
        <div class="nav">
          <a href="/explore">Explore</a>
          <span>other</span>
        </div>
      `;
      const comments = observer.findComments(document.body);
      expect(comments).toHaveLength(0);
    });

    it('ignores links that do not match the /@username pattern', () => {
      document.body.innerHTML = `
        <div>
          <a href="/settings">Settings</a>
          <span>x</span>
        </div>
      `;
      const comments = observer.findComments(document.body);
      expect(comments).toHaveLength(0);
    });

    it('ignores already-processed elements (data-tb-processed)', () => {
      document.body.innerHTML = `
        <div class="comment" data-tb-processed="true">
          <a href="/@alice">Alice</a>
          <p>Some comment text</p>
        </div>
      `;
      const comments = observer.findComments(document.body);
      expect(comments).toHaveLength(0);
    });

    it('returns element and linkElement references', () => {
      document.body.innerHTML = `
        <div class="comment">
          <a href="/@carol">Carol</a>
          <p>hello</p>
        </div>
      `;
      const comments = observer.findComments(document.body);
      expect(comments[0].element).toBeInstanceOf(Element);
      expect(comments[0].linkElement).toBeInstanceOf(Element);
      expect(comments[0].linkElement.tagName).toBe('A');
    });
  });

  // ── markProcessed ─────────────────────────────────────────────────────────

  describe('markProcessed', () => {
    it('sets data-tb-processed="true" on the element', () => {
      document.body.innerHTML = `<div id="target"></div>`;
      const el = document.getElementById('target');
      DOMObserver.markProcessed(el);
      expect(el.getAttribute('data-tb-processed')).toBe('true');
    });

    it('causes findComments to skip a previously detected element', () => {
      document.body.innerHTML = `
        <div class="comment">
          <a href="/@dave">Dave</a>
          <p>text</p>
        </div>
      `;
      const first = observer.findComments(document.body);
      expect(first).toHaveLength(1);
      DOMObserver.markProcessed(first[0].element);
      const second = observer.findComments(document.body);
      expect(second).toHaveLength(0);
    });
  });

  // ── startObserving / stopObserving ────────────────────────────────────────

  describe('startObserving / stopObserving', () => {
    it('calls onNewComments when new comment nodes are added', async () => {
      const received = [];
      observer.startObserving(document.body, (comments) => {
        received.push(...comments);
      });

      const div = document.createElement('div');
      div.innerHTML = '<a href="/@eve">Eve</a><span>text</span>';
      document.body.appendChild(div);

      // MutationObserver callbacks fire asynchronously; wait a microtask
      await new Promise((r) => setTimeout(r, 0));

      expect(received.length).toBeGreaterThan(0);
      expect(received[0].username).toBe('eve');

      observer.stopObserving();
    });

    it('does not call onNewComments after stopObserving', async () => {
      const received = [];
      observer.startObserving(document.body, (comments) => {
        received.push(...comments);
      });
      observer.stopObserving();

      const div = document.createElement('div');
      div.innerHTML = '<a href="/@frank">Frank</a><span>text</span>';
      document.body.appendChild(div);

      await new Promise((r) => setTimeout(r, 0));
      expect(received).toHaveLength(0);
    });
  });
});
