# Threads Blocker

[![Test](https://github.com/JokaHD/threads-blocker/actions/workflows/test.yml/badge.svg)](https://github.com/JokaHD/threads-blocker/actions/workflows/test.yml)

A Chrome extension for batch-blocking accounts on Threads (threads.com).

## Features

- **Block Mode** - Click comments to select multiple users for blocking
- **Batch Processing** - Queue multiple blocks and process them automatically
- **Rate Limit Handling** - Automatic cooldown and retry on rate limits
- **Progress Panel** - Track blocking progress in real-time
- **Undo Support** - Unblock users directly from the panel

## Installation

### From Chrome Web Store

Coming soon.

### Manual Installation (Developer Mode)

1. Clone this repository:
   ```bash
   git clone https://github.com/JokaHD/threads-blocker.git
   cd threads-blocker
   ```

2. Install dependencies and build:
   ```bash
   npm install
   npm run build
   ```

3. Load in Chrome:
   - Open `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked"
   - Select the `dist/` folder

## Usage

1. Navigate to any page on [threads.com](https://www.threads.com/)
2. Click the **Block Mode** button (shield icon) in the bottom-right corner
3. Click on comments to select users you want to block
4. Click **Block** in the control card that appears
5. Monitor progress in the panel

### Keyboard Shortcuts

- **Click** - Toggle selection on a comment
- **Shift+Click** - Select range of comments

## Development

```bash
# Install dependencies
npm install

# Build extension
npm run build

# Watch mode (auto-rebuild on changes)
npm run watch

# Run unit tests (Jest + jsdom)
npm test

# Run tests with coverage
npm run test:coverage

# Run E2E tests (Playwright + Chromium)
# First-time setup: install browser binaries
npx playwright install chromium
# Run tests (opens a Chromium window)
npm run test:e2e
# Run all tests (unit + e2e)
npm run test:all
```

> **Note:** E2E tests run with `headless: false` by default — a Chromium browser window will open during the test run. On headless Linux (CI, WSL without display), set `DISPLAY` or use xvfb.

## Project Structure

```
src/
├── background/       # Service worker (queue management, persistence)
├── content/          # Content script (UI, DOM observation, API)
│   └── ui/           # UI components (FAB, card, panel, shadow host)
└── shared/           # Shared constants and message types

tests/
├── unit/             # Unit tests (Jest)
└── e2e/              # E2E tests (Playwright)
```

## Privacy

This extension:
- Does **not** collect any personal data
- Does **not** send data to external servers
- Stores blocking queue locally in your browser

See [PRIVACY.md](PRIVACY.md) for details.

## Disclaimer

This extension is provided "as is" for personal use. It is not affiliated with, endorsed by, or associated with Meta or Threads.

Use of automation tools may violate the Terms of Service of certain platforms. By using this extension, you acknowledge that:
- You use it at your own risk
- The developers are not responsible for any consequences, including account restrictions
- You should review the [Threads Terms of Use](https://help.instagram.com/769983657850450) before use

## License

[MIT](LICENSE)
