# LinguaAI — Advanced AI Writing Assistant

A complete Grammarly-style writing assistant powered by Z.ai's LLM. Ships as three deliverables:

1. **Web App** (Next.js 16 PWA) — advanced editor with real-time grammar, spelling, vocabulary, tone, document scores, writing goals, AI command box, tone rewrite, translation, and more.
2. **Browser Extension** (Manifest V3) — floating grammar FAB + popup mini editor on any webpage in Chrome/Edge/Brave.
3. **Android APK** — **true native floating assistant** using `AccessibilityService` + `SYSTEM_ALERT_WINDOW`. Works across WhatsApp, Gmail, Messages, Instagram, LinkedIn, Telegram, Slack, Teams, Google Docs, and any app with editable text.

All three share the same backend: an LLM-powered API at `/api/grammar` (analysis) and `/api/rewrite` (transformations).

---

## What's new in v1.1.0

### Fixed: Analysis failing
- Robust JSON extraction (handles markdown fences, trailing commas, control chars)
- Validates every issue's character offsets against the source text; re-finds substrings when LLM returns wrong offsets
- Skips overlapping issues
- Computes stats locally (always accurate) instead of trusting LLM
- Skips very short inputs (<3 chars) to avoid wasting API calls
- Returns graceful fallbacks on any error

### New: Native Android floating assistant
The APK is no longer a WebView wrapper. It is now a **true native Android floating assistant** that:
- Uses `AccessibilityService` to detect text the user is typing in any app
- Uses `SYSTEM_ALERT_WINDOW` to draw a draggable floating bubble over other apps
- Shows issue count badge (`3`) on the bubble
- Tap to expand a floating panel with grammar suggestions and AI actions
- Has per-app settings (tone, goal, enable/disable per app)
- Remembers bubble position
- Can be hidden temporarily or disabled entirely
- Foreground service notification (required by Android 14+)

### New: Advanced web editor features
- **Writing goals** (General, Professional, Academic, Business, Casual, Email, Marketing, Technical, Creative, Social)
- **Document scores** (Grammar, Clarity, Readability, Vocabulary, Tone, Conciseness, Engagement)
- **AI command box** — natural-language instructions: "Make this more professional", "Turn into an email"
- **Rewrite menu** — Improve, Rewrite, Shorten, Expand, Simplify, Clarify, Make Natural/Engaging/Stronger
- **Tone rewrite** — Professional, Formal, Casual, Friendly, Confident, Polite, Diplomatic, Persuasive, Concise, Direct, Empathetic, Enthusiastic, Authoritative
- **Translation** — Spanish, French, German, Italian, Portuguese, Chinese, Japanese, Korean, Arabic, Hindi, Russian, Dutch
- **Personal dictionary** — add words to skip future spelling flags
- **Quick command chips** — one-tap presets

---

## Quick start

### Web app
The web app is live in the sandbox preview. To run locally:
```bash
bun install
bun run dev
# open http://localhost:3000
```

### Browser extension
1. Unzip `LinguaAI-Extension-v1.0.0.zip` (or use the `extension/` folder)
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked** → select the `extension/` folder

### Android APK (v1.1.0 — native floating assistant)
1. Install `LinguaAI-v1.1.0.apk` on Android 7.0+ (enable "Install from unknown sources")
2. Open LinguaAI
3. Grant **Overlay permission** (Settings → Apps → LinguaAI → Display over other apps)
4. Grant **Accessibility service** (Settings → Accessibility → LinguaAI → Enable)
5. Tap **Start floating service**
6. Open WhatsApp, Gmail, or any app with a text field and start typing
7. The green LinguaAI bubble appears — tap it to see issues + AI actions

The APK is debug-signed. To publish on Google Play, re-sign with a release keystore (see below).

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Web App (Next.js 16)                                    │
│  /src/app/page.tsx           ← advanced editor UI        │
│  /src/app/api/grammar        ← analyze text → JSON       │
│  /src/app/api/rewrite        ← transform text (tone,     │
│                                shorten, translate, AI)   │
│  /src/app/layout.tsx         ← PWA manifest + SW         │
└─────────────────────────────────────────────────────────┘
           │
           │ POST /api/grammar  { text, goal }
           │ POST /api/rewrite  { text, action, instruction?, targetLang? }
           ▼
┌─────────────────────────────────────────────────────────┐
│  Z.ai LLM (z-ai-web-dev-sdk)                             │
└─────────────────────────────────────────────────────────┘
           ▲
           │ Same API
           │
┌──────────────────────────┐   ┌──────────────────────────┐
│  Chrome Extension        │   │  Android APK (native)    │
│  - Manifest V3           │   │  - AccessibilityService  │
│  - Popup mini editor     │   │    (reads text in any    │
│  - Inline FAB on         │   │     app)                 │
│    textareas             │   │  - SYSTEM_ALERT_WINDOW   │
│  - Context menu          │   │    (floating bubble)     │
│  - Keyboard shortcuts    │   │  - Foreground service    │
└──────────────────────────┘   │  - Per-app settings      │
                               │  - AI actions panel      │
                               └──────────────────────────┘
```

---

## Android floating assistant — how it works

### Permissions
- **`SYSTEM_ALERT_WINDOW`** — required to draw the floating bubble over other apps
- **`BIND_ACCESSIBILITY_SERVICE`** — required to read text the user is typing in other apps (WhatsApp, Gmail, etc.)
- **`FOREGROUND_SERVICE_SPECIAL_USE`** — required by Android 14+ to keep the service running
- **`POST_NOTIFICATIONS`** — for the foreground service notification (Android 13+)

### Components
- `MainActivity` — launcher with permission checks and onboarding
- `LinguaAIAccessibilityService` — watches for `TYPE_VIEW_TEXT_CHANGED` and `TYPE_VIEW_FOCUSED` events on editable fields; broadcasts the current text to the floating service
- `LinguaAIFloatingService` — foreground service that owns the floating overlay UI:
  - Draggable bubble with issue count badge
  - Expandable panel with grammar issues + Replace/Ignore buttons
  - AI actions grid (Improve, Rewrite, Shorten, Expand, Simplify, tone changes)
  - Ask AI box for natural-language commands
  - Translate row
- `LinguaAIApi` — HTTP client for `/api/grammar` and `/api/rewrite`
- `AppSettings` — per-app and global settings (tone, goal, enabled apps, bubble position)

### Per-app defaults
| App | Tone | Goal |
|---|---|---|
| WhatsApp | Casual | Social |
| Gmail | Professional | Email |
| Messages | Casual | General |
| Instagram | Casual | Social |
| Facebook | Casual | Social |
| LinkedIn | Professional | Professional |
| X (Twitter) | Casual | Social |
| Telegram | Casual | General |
| Slack | Professional | Business |
| Microsoft Teams | Professional | Business |
| Google Docs | Professional | Academic |

### Privacy
- Text is read on-demand from the focused field via the AccessibilityService
- Text is held in-memory only long enough to be analyzed
- Text is sent only to the user-configured LinguaAI API endpoint
- Nothing is stored on-device beyond user settings (SharedPreferences)
- No analytics, no telemetry, no logging of user content

---

## API contract

### `POST /api/grammar`
**Request:** `{ "text": "...", "goal": "general|professional|academic|..." }`

**Response:**
```json
{
  "issues": [{ "type": "grammar", "original": "he go", "suggestion": "he went", "explanation": "...", "severity": "critical", "start": 0, "end": 5 }],
  "correctedText": "He went to school yesterday",
  "tone": { "tone": "Casual", "confidence": 60, "formality": "informal", "sentiment": "positive" },
  "vocabulary": [{ "word": "happy", "alternatives": ["pleased", "content"], "reason": "..." }],
  "stats": { "wordCount": 11, "sentenceCount": 1, "averageWordsPerSentence": 11, "readabilityScore": 88, "readingTime": "3 sec", "uniqueWords": 10, "lexicalDiversity": 0.91 },
  "scores": { "grammar": 40, "clarity": 70, "readability": 80, "vocabulary": 50, "tone": 60, "conciseness": 90, "engagement": 50 },
  "overallScore": 60
}
```

### `POST /api/rewrite`
**Request:** `{ "text": "...", "action": "professional|shorten|expand|simplify|translate|ai_command|...", "instruction": "...", "targetLang": "Spanish", "goal": "general" }`

**Actions:** `improve, rewrite, rephrase, shorten, expand, simplify, clarify, professional, formal, casual, friendly, confident, polite, diplomatic, persuasive, concise, direct, empathetic, enthusiastic, authoritative, natural, engaging, stronger, fix, translate, explain, ai_command, alternatives`

**Response:** `{ "result": "rewritten text", "alternatives": ["alt1", "alt2"] }`

---

## Push to GitHub

> **Security first**: never paste a GitHub Personal Access Token into a chat. If you have, revoke it immediately at https://github.com/settings/tokens.

To push this code to a fresh GitHub repo:

1. **Create a new repo on GitHub** (don't add a README or .gitignore — the repo already has both).

2. **Generate a fresh PAT** at https://github.com/settings/tokens (classic) with scopes: `repo, workflow`. Store it in a password manager or `~/.netrc` — never in chat.

3. **From the project root:**
   ```bash
   cd /home/z/my-project

   # Initialize git (if not already)
   git init
   git add .
   git commit -m "feat: LinguaAI v1.1.0 — native Android floating assistant + advanced web editor"

   # Add your remote (replace YOUR_USER and YOUR_REPO)
   git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git

   # Push using your fresh PAT (Git will prompt for password — paste the PAT)
   git branch -M main
   git push -u origin main
   ```

4. **Trigger the build** — the `.github/workflows/build.yml` workflow will automatically:
   - Lint and build the Next.js web app
   - Build the Android APK
   - Package the Chrome extension
   - Upload all three as build artifacts (downloadable from the Actions tab)

5. **To create a release** with downloadable APK + extension:
   ```bash
   git tag v1.1.0
   git push origin v1.1.0
   ```
   The workflow will create a GitHub Release with the APK and extension attached.

---

## Self-hosting

The web app is the backend for the extension and APK.

1. Deploy the Next.js app to Vercel / Netlify / your own server
2. In the **extension Options**, set the endpoint to `https://your-domain.com/api/grammar`
3. In the **Android app** (MainActivity), set the endpoint in the input field and tap "Save endpoint"
4. The Android app derives `/api/rewrite` from the `/api/grammar` URL automatically

---

## Tech stack

- **Web**: Next.js 16, TypeScript, Tailwind CSS 4, shadcn/ui, Framer Motion, Sonner
- **Backend**: Next.js API Routes, z-ai-web-dev-sdk (Z.ai LLM)
- **Extension**: Manifest V3, vanilla JS, no build step
- **Android**: Kotlin, AndroidX, AccessibilityService, SYSTEM_ALERT_WINDOW, Gradle 8.7, AGP 8.5.0

---

## Files in this folder

| File | Description |
|---|---|
| `LinguaAI-v1.1.0.apk` | Native Android APK with floating assistant (3.2 MB, target SDK 34, min SDK 24) |
| `LinguaAI-v1.0.0.apk` | Older WebView-wrapper APK (kept for reference) |
| `LinguaAI-Extension-v1.0.0.zip` | Chrome extension zip |
| `extension/` | Unpacked extension source |
| `LinguaAI-README.md` | This file |

The web app source is at the project root. Android source is at `/android/`.
