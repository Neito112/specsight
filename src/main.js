import { initializeApp } from "firebase/app";
import { initializeAppCheck } from "firebase/app-check";
import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode } from "firebase/ai";
import { firebaseConfig } from "./firebase-config.js";

// ---------------------------------------------------------------------------
// Firebase + App Check
// App Check is enforced for AI Logic. In dev we use the debug provider
// (debug tokens are accepted for this hackathon's submissions); in prod,
// swap to ReCaptchaEnterpriseProvider.
// ---------------------------------------------------------------------------
if (import.meta.env.DEV) {
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN || true;
}

const app = initializeApp(firebaseConfig);
initializeAppCheck(app, {}); // provider configured in Firebase console

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

const quickModel = getGenerativeModel(ai, {
  mode: InferenceMode.PREFER_ON_DEVICE,
  systemInstruction: SYSTEM_PROMPT,
  inCloudParams: {
    model: "gemini-3.5-flash-lite",
    generationConfig: { responseMimeType: "application/json", responseSchema: DOC_SCHEMA }
  }
});

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

els.quick.addEventListener("click", async () => {
  // initializeDeviceModel must run on/after user interaction, before queries.
  if (!deviceModelReady) {
    els.status.textContent = "Preparing on-device model (first run downloads Gemini Nano)…";
    try {
      await quickModel.initializeDeviceModel((v) => {
        els.status.textContent = `On-device model download: ${Math.round(v * 10000) / 100}%`;
      });
      deviceModelReady = true;
    } catch (e) {
      els.status.textContent = "On-device model unavailable here — requests will fall back to the cloud. (" + e.message + ")";
    }
  }
  await run(quickModel);
});

els.deep.addEventListener("click", () => run(deepModel));

async function run(model) {
  if (!currentFile) return;
  els.resultCard.hidden = false;
  els.output.textContent = "Analyzing…";
  els.badge.textContent = "";
  try {
    const part = await fileToPart(currentFile);
    const prompt =
      "Analyze this construction document image. Return JSON per the schema.";
    const result = await model.generateContent([prompt, part]);
    const src = result.response.inferenceSource; // ON_DEVICE | IN_CLOUD
    els.badge.textContent = src === "ON_DEVICE" ? "on-device · Gemini Nano" : "cloud · Gemini";
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
