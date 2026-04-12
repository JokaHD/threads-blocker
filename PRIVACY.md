# Privacy Policy

**Last updated: April 13, 2026**

## Overview

Threads Blocker is a browser extension that helps you batch-block accounts on Threads. This privacy policy explains what data the extension accesses and how it is used.

## Data Collection

**Threads Blocker does not collect, transmit, or share any personal data.**

## Data Storage

The extension stores the following data locally in your browser using Chrome's `storage.local` API:

| Data | Purpose | Retention |
|------|---------|-----------|
| Block queue | Track pending/completed block requests | Until you clear it |
| Cooldown timer | Handle rate limiting | Temporary (expires automatically) |

This data:
- Never leaves your browser
- Is not sent to any external servers
- Is not accessible to websites you visit
- Can be cleared at any time via the extension panel

## Permissions

The extension requests the following permissions:

| Permission | Why It's Needed |
|------------|-----------------|
| `storage` | Save block queue and settings locally |
| `alarms` | Schedule cooldown timer for rate limiting |
| `host_permissions` for threads.com | Inject the blocking UI on Threads pages |

## Third-Party Services

This extension does not use any third-party analytics, tracking, or advertising services.

## Data Sharing

We do not sell, trade, or transfer any data to third parties. There is no data to share because the extension does not collect any.

## Changes to This Policy

If we make changes to this privacy policy, we will update the "Last updated" date at the top of this document.

## Contact

If you have questions about this privacy policy, please open an issue on [GitHub](https://github.com/JokaHD/threads-blocker/issues).

## Open Source

This extension is open source. You can review the complete source code at:
https://github.com/JokaHD/threads-blocker
