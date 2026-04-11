const SIZE = 18;
const STROKE = 2;
const attrs = `width="${SIZE}" height="${SIZE}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round"`;

export const Icons = {
  ban: `<svg ${attrs}><circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/></svg>`,
  x: `<svg ${attrs}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
  check: `<svg ${attrs}><path d="M20 6 9 17l-5-5"/></svg>`,
  loader: `<svg ${attrs} class="tb-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`,
  undo: `<svg ${attrs}><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>`,
  alertTriangle: `<svg ${attrs}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
  refreshCw: `<svg ${attrs}><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>`,
  shield: `<svg ${attrs}><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg>`,
  minus: `<svg ${attrs}><path d="M5 12h14"/></svg>`,
  pause: `<svg ${attrs}><rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/></svg>`,
  play: `<svg ${attrs}><polygon points="6 3 20 12 6 21 6 3"/></svg>`,
};
