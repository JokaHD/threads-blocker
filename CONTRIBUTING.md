# Contributing to Threads Blocker

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/threads-blocker.git
   cd threads-blocker
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Create a branch for your changes:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development Workflow

### Build

```bash
npm run build      # Build once
npm run watch      # Watch mode
```

### Test

```bash
npm test                 # Run unit tests
npm run test:coverage    # Run with coverage report
npm run test:e2e         # Run E2E tests (requires xvfb on Linux)
```

### Load Extension

1. Run `npm run build`
2. Open `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the `dist/` folder

## Code Style

- Use ES modules (`import`/`export`)
- No TypeScript (plain JavaScript)
- Follow existing code patterns
- Keep functions small and focused

## Testing Requirements

- All new features should include unit tests
- Maintain or improve code coverage (currently ~80%)
- E2E tests for user-facing features

## Pull Request Process

1. Update tests for your changes
2. Ensure all tests pass: `npm run test:coverage`
3. Update documentation if needed
4. Create a pull request with a clear description

### PR Title Format

Use conventional commit format:
- `feat: add new feature`
- `fix: resolve bug`
- `docs: update documentation`
- `test: add tests`
- `refactor: improve code structure`

## Reporting Issues

### Bug Reports

Please include:
- Browser version
- Steps to reproduce
- Expected vs actual behavior
- Console errors (if any)

### Feature Requests

Please describe:
- The problem you're trying to solve
- Your proposed solution
- Any alternatives you considered

## Questions?

Open an issue with the "question" label.
