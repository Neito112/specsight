# SpecSight 🔦

**Hybrid AI assistant for construction field documents.** Photograph a spec page,
material test report, or drawing excerpt — SpecSight runs a **private, free,
offline quick pass on-device (Gemini Nano via Chrome's Prompt API)** and sends
only the heavy cross-checking to **Gemini in the cloud** when you need depth.

Built for the [#BuildHybridAI 2026 hackathon](https://firebasehybridaihackathon.devpost.com/)
with **Firebase AI Logic hybrid inference**.

## Why hybrid here

| | Quick pass (on-device) | Deep analysis (cloud) |
|---|---|---|
| Runs | Gemini Nano, in Chrome | Gemini (Firebase AI Logic) |
| Works offline | ✅ (demo: toggle airplane mode) | ❌ falls back gracefully |
| Data privacy | Photos never leave the laptop | only when explicitly requested |
| Cost | free | metered, used sparingly |

Real-world fit: sites with poor connectivity, confidential project documents,
crew devices of all shapes — the app behaves the same everywhere.

## Run locally

Requirements: Node 20+, Chrome Desktop 139+, and a Firebase project with
AI Logic enabled.

1. Enable the Chrome flag `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` → **Enabled** → restart Chrome.
2. `npm install`
3. Copy `src/firebase-config.template.js` to `src/firebase-config.js` and fill in your Firebase web app config.
4. `npm run dev` → open the printed localhost URL in Chrome.
5. First "Quick pass" triggers the one-time on-device model download (watch the progress line).

## Submission checklist (hackathon)

- [ ] Public GitHub repo, Apache-2.0 license visible
- [ ] Firebase AI Logic imported and called at runtime (`src/main.js`)
- [ ] App Check: debug token accepted for submissions (register in console)
- [ ] Demo video ≤ 3 min, English, YouTube (show offline quick pass → online deep pass)
- [ ] Hosted URL for judging (Firebase Hosting)
- [ ] Text description: how Firebase AI Logic is used + value proposition

## License

Apache-2.0
