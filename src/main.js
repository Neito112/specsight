import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode } from "firebase/ai";
import { firebaseConfig } from "./firebase-config.js";

// ---------------------------------------------------------------------------
// Firebase + App Check
// App Check is enforced for AI Logic. In dev we use the debug provider
// (debug tokens are accepted for this hackathon's submissions); in prod,
// swap to ReCaptchaEnterpriseProvider.
// ---------------------------------------------------------------------------
// Hackathon note: debug tokens are explicitly accepted for #BuildHybridAI
// submissions. Swap this for real reCAPTCHA Enterprise attestation before
// any production use beyond the contest.
self.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN || "b7f3c2a1-9d4e-4f68-8a2b-1c5e7d9f0a3b";

const app = initializeApp(firebaseConfig);
// The site key only matters in production; in dev the debug token above
// bypasses attestation entirely.
initializeAppCheck(app, {
  provider: new ReCaptchaEnterpriseProvider(import.meta.env.VITE_RECAPTCHA_SITE_KEY || "placeholder-site-key"),
  isTokenAutoRefreshEnabled: true
});

const ai = getAI(app, { backend: new GoogleAIBackend() });

// ---------------------------------------------------------------------------
// Models
//  - quickModel: PREFER_ON_DEVICE — fast, private, free, works offline.
//  - deepModel : PREFER_IN_CLOUD  — heavier cross-checking, online only.
// On-device (Chrome Prompt API / Gemini Nano) supports single-turn text+image
// (JPEG/PNG) with structured output. PDFs/audio are cloud-only — we therefore
// design the quick pass around photos of documents.
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT =
  "You are SpecSight, an assistant for construction field documents. " +
  "Extract facts faithfully from the document image. Never invent values.";

const DOC_SCHEMA = {
  type: "OBJECT",
  properties: {
    doc_type: { type: "STRING", description: "e.g. material test report, spec sheet, drawing excerpt, delivery note" },
    title: { type: "STRING" },
    key_values: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { label: { type: "STRING" }, value: { type: "STRING" }, unit: { type: "STRING" } },
        required: ["label", "value"]
      }
    },
    flags: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "potential issues: missing values, inconsistencies, expired dates, out-of-range numbers"
    },
    summary: { type: "STRING" }
  },
  required: ["doc_type", "title", "key_values", "summary"]
};

const modelParams = {
  systemInstruction: SYSTEM_PROMPT,
  inCloudParams: {
    model: "gemini-3.5-flash-lite",
    generationConfig: { responseMimeType: "application/json", responseSchema: DOC_SCHEMA }
  }
};

// Hybrid instance: on-device when the browser's Gemini Nano is actually ready.
const quickModel = getGenerativeModel(ai, { ...modelParams, mode: InferenceMode.PREFER_ON_DEVICE });
// Cloud-only instance: used when the on-device model is absent or not ready yet
// (first-run download, unsupported browser, stuck availability probe).
const cloudQuickModel = getGenerativeModel(ai, { ...modelParams, mode: InferenceMode.ONLY_IN_CLOUD });

const deepModel = getGenerativeModel(ai, {
  mode: InferenceMode.PREFER_IN_CLOUD,
  systemInstruction:
    SYSTEM_PROMPT +
    " For deep analysis: cross-check the document against common standards " +
    "(ACI, ASTM, TCVN where applicable), point out compliance risks, and suggest follow-up actions for a site engineer.",
  inCloudParams: {
    model: "gemini-3.5-flash-lite",
    generationConfig: { responseMimeType: "application/json", responseSchema: DOC_SCHEMA }
  }
});

// ---------------------------------------------------------------------------
// UI wiring
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const els = {
  file: $("doc-input"), previewWrap: $("preview-wrap"), preview: $("preview"),
  quick: $("btn-quick"), deep: $("btn-deep"), status: $("model-status"),
  resultCard: $("result-card"), output: $("output"), badge: $("source-badge")
};

let currentFile = null;
let deviceModelReady = false;

async function fileToPart(file) {
  const data = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(",")[1]);
    reader.readAsDataURL(file);
  });
  return { inlineData: { data, mimeType: file.type } };
}

els.file.addEventListener("change", () => {
  currentFile = els.file.files[0] || null;
  if (!currentFile) return;
  els.preview.src = URL.createObjectURL(currentFile);
  els.previewWrap.hidden = false;
  els.quick.disabled = false;
  els.deep.disabled = false;
  els.resultCard.hidden = true;
});

els.quick.addEventListener("click", () => {
  // initializeDeviceModel must run on/after user interaction, before queries.
  if (!deviceModelReady) {
    els.status.textContent = "Quick pass — checking on-device model…";
    onDeviceReady(2500)
      .then((ready) => {
        if (ready) {
          quickModel
            .initializeDeviceModel((v) => {
              els.status.textContent = `On-device model download: ${Math.round(v * 10000) / 100}%`;
            })
            .then(() => {
              deviceModelReady = true;
              els.status.textContent = "On-device model ready — future passes run locally.";
            })
            .catch(() => {});
          run(quickModel);
        } else {
          els.status.textContent = "On-device model not ready in this browser — quick pass via cloud (hybrid fallback).";
          run(cloudQuickModel);
        }
      });
  } else {
    run(quickModel);
  }
});

els.deep.addEventListener("click", () => run(deepModel));

// Probe Chrome's built-in model with a hard timeout so a stuck probe can't
// hang the UI (seen on some machines before the first model download).
function onDeviceReady(timeoutMs) {
  const probe = (async () => {
    if (!window.LanguageModel || !window.LanguageModel.availability) return false;
    const av = await window.LanguageModel.availability();
    return av === "available";
  })();
  return Promise.race([
    probe,
    new Promise((res) => setTimeout(() => res(false), timeoutMs))
  ]).catch(() => false);
}

async function run(model) {
  if (!currentFile) return;
  els.resultCard.hidden = false;
  els.output.textContent = "Analyzing…";
  els.badge.textContent = "";
  const started = Date.now();
  try {
    const part = await fileToPart(currentFile);
    const prompt =
      "Analyze this construction document image. Return JSON per the schema.";
    const result = await model.generateContent([prompt, part]);
    const src = result.response.inferenceSource; // ON_DEVICE | IN_CLOUD
    els.badge.textContent =
      (src === "ON_DEVICE" ? "on-device · Gemini Nano" : "cloud · Gemini") +
      ` · ${((Date.now() - started) / 1000).toFixed(1)}s`;
    els.badge.className = "badge " + (src === "ON_DEVICE" ? "badge-local" : "badge-cloud");
    const text = result.response.text();
    try {
      renderJson(JSON.parse(text));
    } catch {
      els.output.textContent = text;
    }
    els.status.textContent = "Done.";
  } catch (e) {
    els.output.textContent = "Error: " + (e?.message || e);
  }
}

function renderJson(doc) {
  const kv = (doc.key_values || [])
    .map((k) => `• ${k.label}: ${k.value}${k.unit ? " " + k.unit : ""}`)
    .join("\n");
  const flags = (doc.flags || []).map((f) => `⚠ ${f}`).join("\n");
  els.output.textContent =
    `TYPE: ${doc.doc_type}\nTITLE: ${doc.title}\n\nKEY VALUES\n${kv}\n\n` +
    (flags ? `FLAGS\n${flags}\n\n` : "") +
    `SUMMARY\n${doc.summary}`;
}
