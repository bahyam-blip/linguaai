# LinguaAI — Advanced AI Writing Assistant

A complete Grammarly-style AI writing assistant powered by Z.ai's LLM. Three deliverables, one codebase:

- **Web app** (Next.js 16 PWA): advanced editor with real-time grammar, spelling, vocabulary, tone, document scores, writing goals, AI command box, tone rewrite, translation.
- **Chrome extension** (Manifest V3): floating grammar FAB on any webpage + toolbar popup mini editor.
- **Android APK**: **true native floating assistant** using `AccessibilityService` + `SYSTEM_ALERT_WINDOW`. Works across WhatsApp, Gmail, Messages, Instagram, LinkedIn, Telegram, Slack, Teams, Google Docs — any app with editable text.

## Quick start

### Web app
```bash
bun install
bun run dev   # http://localhost:3000
```

### Browser extension
1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select the `extension/` folder

### Android APK
1. Install `download/LinguaAI/LinguaAI-v1.1.0.apk` on Android 7.0+
2. Open LinguaAI
3. Grant **Overlay permission** (Settings → Apps → LinguaAI → Display over other apps)
4. Grant **Accessibility service** (Settings → Accessibility → LinguaAI → Enable)
5. Tap **Start floating service**
6. Open WhatsApp / Gmail / any app with a text field and start typing
7. The green LinguaAI bubble appears — tap to see issues + AI actions

## API endpoints

- `POST /api/grammar` — analyze text → `{ issues, correctedText, tone, vocabulary, stats, scores, overallScore }`
- `POST /api/rewrite` — transform text → `{ result }` (actions: improve, shorten, expand, simplify, professional, casual, translate, ai_command, ...)

## Project structure
```
.
├── src/
│   ├── app/
│   │   ├── page.tsx              # Advanced editor UI
│   │   ├── layout.tsx            # PWA manifest + service worker
│   │   ├── api/grammar/route.ts  # LLM-powered analysis
│   │   └── api/rewrite/route.ts  # Tone/rewrite/translate/AI command
│   └── components/ui/            # shadcn/ui components
├── extension/                    # Chrome extension (Manifest V3)
│   ├── manifest.json
│   ├── background.js
│   ├── content.js                # Injects FAB + panel on any webpage
│   ├── popup.{html,css,js}       # Toolbar mini editor
│   └── options.html              # Endpoint config
├── android/                      # Native Android app
│   ├── app/src/main/
│   │   ├── AndroidManifest.xml
│   │   ├── java/com/linguaai/app/
│   │   │   ├── MainActivity.kt           # Onboarding + permission checks
│   │   │   ├── LinguaAIAccessibilityService.kt  # Reads text in other apps
│   │   │   ├── LinguaAIFloatingService.kt       # Floating bubble + panel
│   │   │   ├── LinguaAIApi.kt               # HTTP client
│   │   │   └── AppSettings.kt               # Per-app + global settings
│   │   └── res/                  # Layouts, strings, colors, icons
│   └── build.gradle.kts
├── public/
│   ├── manifest.json             # PWA manifest
│   ├── sw.js                     # Service worker
│   └── icons/                    # PWA icons (192, 512, maskable)
├── .github/workflows/build.yml   # CI: build web + APK + extension
└── download/LinguaAI/            # Pre-built deliverables
```

## CI/CD

The `.github/workflows/build.yml` workflow:
- Builds the Next.js web app
- Builds the Android APK
- Packages the Chrome extension
- Uploads all three as build artifacts
- On tag push (`v*`), creates a GitHub Release with the APK and extension attached

## Push to GitHub

> **Security**: never paste a GitHub PAT into a chat. If you have, revoke it at https://github.com/settings/tokens.

```bash
git init
git add .
git commit -m "feat: LinguaAI v1.1.0 — native Android floating assistant + advanced web editor"
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
git branch -M main
git push -u origin main

# To create a release:
git tag v1.1.0
git push origin v1.1.0
```

## Privacy

- Text is read on-demand from the focused field
- Text is sent only to the user-configured LinguaAI API endpoint
- Nothing is stored on-device beyond user settings
- No analytics, no telemetry, no logging of user content

## License

MIT
