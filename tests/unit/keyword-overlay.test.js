/**
 * @jest-environment jsdom
 */

import { KeywordOverlay } from '../../src/content/ui/keyword-overlay.js';

function installChrome() {
  global.chrome = {
    storage: {
      local: {
        get: jest.fn(async () => ({})),
        set: jest.fn(async () => {}),
      },
      onChanged: {
        addListener: jest.fn(),
        removeListener: jest.fn(),
      },
    },
  };
}

describe('KeywordOverlay', () => {
  let container;
  let overlay;

  const backdrop = () => container.querySelector('.tb-kw-overlay');
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const pressEscape = (target = document) =>
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    );

  beforeEach(() => {
    installChrome();
    container = document.createElement('div');
    document.body.appendChild(container);
    overlay = new KeywordOverlay(container);
  });

  afterEach(() => {
    overlay.close();
    container.remove();
    delete global.chrome;
  });

  test('opens a modal dialog with the keyword manager inside', async () => {
    overlay.open();
    await settle();

    const dialog = backdrop();
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.querySelector('.tb-kw-modal #km-add-form')).not.toBeNull();
    expect(overlay.isOpen).toBe(true);
    expect(chrome.storage.onChanged.addListener).toHaveBeenCalledTimes(1);
  });

  test('focuses the keyword input on open', () => {
    overlay.open();
    expect(document.activeElement).toBe(container.querySelector('#km-input'));
  });

  test('a second open while open is a no-op', async () => {
    overlay.open();
    overlay.open();
    await settle();

    expect(container.querySelectorAll('.tb-kw-overlay')).toHaveLength(1);
    expect(chrome.storage.local.get).toHaveBeenCalledTimes(1);
  });

  test('the close button closes and tears down the manager', async () => {
    overlay.open();
    await settle();

    container.querySelector('.tb-kw-modal-close').click();

    expect(backdrop()).toBeNull();
    expect(overlay.isOpen).toBe(false);
    expect(chrome.storage.onChanged.removeListener).toHaveBeenCalledTimes(1);
  });

  test('Escape closes from anywhere inside the overlay', async () => {
    overlay.open();
    await settle();
    pressEscape(container.querySelector('#km-input'));
    expect(backdrop()).toBeNull();

    overlay.open();
    pressEscape(container.querySelector('.tb-kw-modal'));
    expect(backdrop()).toBeNull();
  });

  test('the modal itself can hold focus, so clicks on plain areas keep it inside', () => {
    overlay.open();
    expect(container.querySelector('.tb-kw-modal').tabIndex).toBe(-1);
  });

  test('a backdrop click closes, a click inside the modal does not', async () => {
    overlay.open();
    await settle();

    container.querySelector('.tb-kw-modal').click();
    expect(backdrop()).not.toBeNull();

    backdrop().click();
    expect(backdrop()).toBeNull();
  });

  test('keystrokes stay inside the overlay', () => {
    const pageListener = jest.fn();
    document.addEventListener('keydown', pageListener);
    overlay.open();

    container
      .querySelector('#km-input')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true }));

    document.removeEventListener('keydown', pageListener);
    expect(pageListener).not.toHaveBeenCalled();
  });

  test('stops listening for Escape once closed', () => {
    overlay.open();
    overlay.close();

    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  test('can reopen after closing', async () => {
    overlay.open();
    overlay.close();
    overlay.open();
    await settle();

    expect(container.querySelectorAll('.tb-kw-overlay')).toHaveLength(1);
    expect(overlay.isOpen).toBe(true);
  });

  test('returns focus to the opener on close', () => {
    const opener = document.createElement('button');
    container.appendChild(opener);

    overlay.open({ returnFocusTo: opener });
    overlay.close();

    expect(document.activeElement).toBe(opener);
  });

  test('closing before storage answers leaves no listener behind', async () => {
    overlay.open();
    overlay.close();
    await settle();

    expect(chrome.storage.onChanged.addListener).not.toHaveBeenCalled();
  });
});
