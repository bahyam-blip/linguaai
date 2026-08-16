# LinguaAI Browser Extension

A Grammarly-like browser extension that provides real-time AI grammar, spelling, vocabulary, tone, and style corrections on any webpage. Powered by the LinguaAI backend (Z.ai LLM).

## Install (Developer Mode)

1. Open Chrome / Edge / Brave / any Chromium browser.
2. Go to `chrome://extensions`.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked**.
5. Select the `extension/` folder (the one containing `manifest.json`).
6. The LinguaAI icon will appear in your toolbar.

## Usage

- **Toolbar popup**: Click the LinguaAI icon → a mini editor opens with full grammar analysis (issues, vocabulary, tone, stats).
- **Inline on any page**: Focus any `<textarea>`, `<input>`, or `contenteditable` element → a small green FAB appears next to it. Click the FAB to analyze the field's text in a floating panel.
- **Right-click**: Select text anywhere → right-click → "Check grammar with LinguaAI".
- **Keyboard shortcuts**:
  - `Ctrl+Shift+L` (Win/Linux) / `Cmd+Shift+L` (Mac): Check the active text field.
  - `Ctrl+Shift+Y` / `Cmd+Shift+Y`: Open the popup editor in a full browser tab.

## Options

Click the LinguaAI icon → **Options** (or right-click the icon → Options). You can change the API endpoint if you self-host LinguaAI.

Default endpoint: `https://preview-linguaai.space-z.ai/api/grammar`

## Files

- `manifest.json` — Manifest V3 declaration
- `background.js` — Service worker; bridges content scripts to the API
- `content.js` — Injected on every page; renders the floating FAB + analysis panel
- `popup.html` / `popup.css` / `popup.js` — Toolbar popup mini editor
- `options.html` — Options page (API endpoint config)
- `icons/` — Extension icons (16/32/48/128px)

## Permissions Explained

- `activeTab`, `scripting` — analyze text in the active tab when the user invokes LinguaAI.
- `storage` — save user preferences (API endpoint).
- `contextMenus` — add the right-click "Check grammar" menu item.
- `host_permissions: http://*/*, https://*/*` — allow the content script to run on any webpage so the floating FAB works everywhere.

## Privacy

Text is sent to the configured LinguaAI API endpoint for analysis. No data is stored on the extension itself; only your last input is kept in `chrome.storage.session` (cleared when the browser closes).
