# LinguaAI — AI Grammar & Writing Assistant

A complete Grammarly-style writing assistant powered by Z.ai's LLM. Ships as three deliverables in one go:

1. **Web App** (Next.js 16 PWA) — full editor with real-time grammar, spelling, punctuation, style, clarity, vocabulary, tone, and stats analysis.
2. **Browser Extension** (Manifest V3) — works on any webpage in Chrome/Edge/Brave. Floating FAB on text fields + toolbar popup mini editor.
3. **Android APK** — WebView wrapper around the same UI, installable on any Android 7.0+ device.

All three share the same backend: an LLM-powered `/api/grammar` endpoint that returns structured JSON (issues with character offsets, corrected text, tone, vocabulary, stats, overall score).

---

## What's in this folder

| File | Description |
|---|---|
| `LinguaAI-v1.0.0.apk` | Android APK (3.3 MB, debug-signed, target SDK 34, min SDK 24). Install directly on Android. |
| `LinguaAI-Extension-v1.0.0.zip` | Chrome extension zip. Unzip and load as unpacked extension in `chrome://extensions`. |
| `extension/` | Unpacked extension source (same content as the zip). |
| `LinguaAI-README.md` | This file. |

The web app source is at the project root (`/home/z/my-project/src/app/`).

---

## Web App

**Live preview**: Use the Preview Panel in the sandbox UI (or the auto-generated `https://preview-<bot-id>.space-z.ai/` URL).

### Features
- **Real-time analysis** (debounced 1.2s after typing stops)
- **Inline highlighting** — critical (red wavy), warning (amber wavy), suggestion (green dotted)
- **Click any issue** → see original → suggestion → explanation → Accept / Dismiss
- **Accept all** — applies the corrected text in one click
- **Vocabulary tab** — weak words with 2-4 stronger alternatives; click to replace
- **Tone tab** — detected tone, confidence, formality, sentiment, plus the fully corrected version
- **Stats tab** — word/sentence/unique counts, Flesch readability, lexical diversity, reading time, overall score
- **Toolbar**: paste, copy, read aloud (speech synthesis), download as .txt, clear
- **PWA**: installable on Android/desktop, service worker for offline shell
- **Responsive**: works on mobile and desktop

---

## Browser Extension

### Install
1. Unzip `LinguaAI-Extension-v1.0.0.zip` (or use the `extension/` folder).
2. Open `chrome://extensions` in Chrome / Edge / Brave.
3. Enable **Developer mode** (top-right).
4. Click **Load unpacked** → select the `extension/` folder.
5. The LinguaAI icon appears in your toolbar.

### Usage
- **Toolbar popup** — click the icon to open a mini editor with full analysis (issues, vocabulary, tone, stats tabs).
- **Inline FAB** — focus any `<textarea>`, `<input>`, or `contenteditable` on any webpage. A green FAB appears next to it. Click it to analyze the field's text in a floating panel.
- **Right-click** — select text anywhere → right-click → "Check grammar with LinguaAI".
- **Keyboard shortcuts**:
  - `Ctrl+Shift+L` (Win/Linux) / `Cmd+Shift+L` (Mac): Check the active text field.
  - `Ctrl+Shift+Y` / `Cmd+Shift+Y`: Open the popup editor in a full browser tab.

### Options
Click the LinguaAI icon → **Options** to change the API endpoint (default: `https://preview-linguaai.space-z.ai/api/grammar`). Point it at your own self-hosted LinguaAI backend if needed.

---

## Android APK

### Install
1. Transfer `LinguaAI-v1.0.0.apk` to your Android phone (Android 7.0 / API 24 or newer).
2. Open the file (may need to enable "Install from unknown sources" in Settings → Security).
3. Tap **Install**.

### What it does
- Native Android WebView wrapper around the LinguaAI UI.
- Bundled static assets (works offline for the UI; API calls go to the configured endpoint).
- Emerald theme matching the web app.
- Status bar tinted with the brand color.
- Safe-area aware (notches, gesture nav).
- Back button handled (navigates WebView history).
- Package: `com.linguaai.app`, version 1.0.0, target SDK 34, min SDK 24.

### Re-signing for Play Store
The APK is signed with a debug key for easy sideloading. To publish on Google Play:
```bash
keytool -genkey -v -keystore release.keystore -alias linguaai -keyalg RSA -keysize 2048 -validity 10000
# Then re-sign with apksigner:
/home/z/android-sdk/build-tools/34.0.0/apksigner sign --ks release.keystore --out LinguaAI-v1.0.0-release.apk LinguaAI-v1.0.0.apk
```

The Android source project is at `/home/z/my-project/android/` — open it in Android Studio to customize.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Web App (Next.js 16)                                │
│  src/app/page.tsx          ← editor + sidebar UI     │
│  src/app/api/grammar/route.ts ← LLM-powered analysis │
│  src/app/layout.tsx        ← PWA manifest + SW reg   │
│  public/manifest.json      ← installable PWA          │
│  public/sw.js              ← offline shell            │
└─────────────────────────────────────────────────────┘
           │
           │ POST /api/grammar { text, mode }
           ▼
┌─────────────────────────────────────────────────────┐
│  Z.ai LLM (z-ai-web-dev-sdk)                         │
│  Returns: issues[], correctedText, tone,             │
│           vocabulary[], stats{}, overallScore        │
└─────────────────────────────────────────────────────┘
           ▲
           │ POST /api/grammar (same endpoint)
           │
┌──────────────────────┐    ┌─────────────────────────┐
│  Chrome Extension    │    │  Android APK            │
│  (Manifest V3)       │    │  (WebView wrapper)      │
│                      │    │                         │
│  - Toolbar popup     │    │  - Bundled static HTML  │
│  - Inline FAB on     │    │  - Calls same API       │
│    any text field    │    │  - Native back button   │
│  - Context menu      │    │  - Safe-area aware      │
│  - Keyboard shortcuts│    │                         │
└──────────────────────┘    └─────────────────────────┘
```

---

## API Contract

`POST /api/grammar`

**Request:**
```json
{ "text": "I has been working on this...", "mode": "full" }
```
`mode` can be `"full"` (default) or `"stats-only"`.

**Response:**
```json
{
  "issues": [
    {
      "type": "grammar",
      "original": "I has been",
      "suggestion": "I have been",
      "explanation": "Subject-verb agreement error. 'I' requires 'have' not 'has'.",
      "severity": "critical",
      "start": 0,
      "end": 7
    }
  ],
  "correctedText": "I have been working on this...",
  "tone": {
    "tone": "Professional",
    "confidence": 85,
    "formality": "neutral",
    "sentiment": "positive"
  },
  "vocabulary": [
    {
      "word": "good",
      "alternatives": ["excellent", "outstanding", "exceptional"],
      "reason": "More precise and impactful alternatives."
    }
  ],
  "stats": {
    "wordCount": 24,
    "sentenceCount": 2,
    "averageWordsPerSentence": 12,
    "readabilityScore": 72,
    "readingTime": "1 min",
    "uniqueWords": 19,
    "lexicalDiversity": 0.79
  },
  "overallScore": 78
}
```

---

## Tech Stack

- **Web**: Next.js 16 (App Router), TypeScript, Tailwind CSS 4, shadcn/ui, Framer Motion, Sonner toasts
- **Backend**: Next.js API Routes, z-ai-web-dev-sdk (Z.ai LLM)
- **PWA**: Web App Manifest, Service Worker (cache-first static, network-first navigation)
- **Extension**: Manifest V3, vanilla JS, no build step required
- **Android**: Kotlin, AndroidX, WebView, Gradle 8.7, AGP 8.5.0, build-tools 34.0.0

---

## Self-hosting

The web app is the backend for the extension and APK. To self-host:

1. Deploy the Next.js app to Vercel / Netlify / your own server.
2. In the **extension Options**, set the endpoint to `https://your-domain.com/api/grammar`.
3. In the **Android APK**, the endpoint is bundled in `assets/web/app.js` (`API_ENDPOINT` constant). Rebuild the APK after changing it:
   ```bash
   cd /home/z/my-project/android
   ./gradlew assembleDebug
   ```

---

## Privacy

Text is sent to the configured LinguaAI API endpoint for LLM analysis. No data is stored server-side. The extension keeps only your last input in `chrome.storage.session` (cleared on browser close). The Android app stores no data.
