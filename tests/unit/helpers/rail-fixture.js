/**
 * Shared jsdom fixture for the threads.com right context rail, as observed
 * in the 2026-11-05 debug run (vw 1745): a sticky 320px child of
 * #barcelona-page-layout at x=1412, posts ending at x=1157.
 */

export const OBSERVED = {
  VW: 1745,
  VH: 828,
  RAIL_LEFT: 1412,
  RAIL_WIDTH: 320,
  CONTENT_RIGHT: 1157,
};

export function setViewport(width = OBSERVED.VW, height = OBSERVED.VH) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
}

/** Stub `el.getBoundingClientRect()` (jsdom has no layout). */
export function stubRect(el, { left, width, top = 0, height = OBSERVED.VH }) {
  el.getBoundingClientRect = () => ({
    left,
    width,
    top,
    height,
    right: left + width,
    bottom: top + height,
  });
  return el;
}

/**
 * Mount `#barcelona-page-layout` with a `.center` column and a rail-shaped
 * `.rail`, and set the observed viewport.
 *
 * @param {object} [opts]
 * @param {string} [opts.centerHtml]
 * @param {string} [opts.railHtml]
 * @param {string} [opts.railStyle] - inline style of the rail (sticky by default)
 * @param {boolean} [opts.append] - append to body instead of replacing it
 * @returns {{layout: HTMLElement, center: HTMLElement, rail: HTMLElement}}
 */
export function mountThreadsLayout({
  centerHtml = '',
  railHtml = '',
  railStyle = 'position: sticky',
  append = false,
} = {}) {
  setViewport();
  const layout = document.createElement('div');
  layout.id = 'barcelona-page-layout';
  layout.innerHTML = `
    <div class="center">${centerHtml}</div>
    <div class="rail" style="${railStyle}">${railHtml}</div>`;
  if (!append) document.body.innerHTML = '';
  document.body.appendChild(layout);

  const rail = stubRect(layout.querySelector('.rail'), {
    left: OBSERVED.RAIL_LEFT,
    width: OBSERVED.RAIL_WIDTH,
  });
  return { layout, center: layout.querySelector('.center'), rail };
}
