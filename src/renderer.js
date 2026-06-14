const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const { cleanTranscription } = require("./text-cleanup.cjs");
const { resampleAudio, trimEdgeSilence } = require("./audio-quality.cjs");
const { createVoiceActivityDetector } = require("./voice-activity.cjs");
const { resolveWhisperProfile } = require("./whisper-profiles.cjs");
const { initializeProductionProfile, upgradeAccuracyDefault } = require("./data-migrations.cjs");

const voiceAPI = window.voiceAPI || {
  runtime: { isPackaged: false },
  copy: async (text) => navigator.clipboard?.writeText(text),
  paste: async (text) => navigator.clipboard?.writeText(text),
  exportHistory: async () => false,
  getState: async () => ({ settings: {}, history: [], dictionary: [], microphone: "" }),
  migrateLegacyState: async (state) => state,
  writeState: async (state) => state,
  transcribe: async () => { throw new Error("La transcripción requiere la aplicación de escritorio."); },
  overlay: async () => {},
  taskbar: async () => {},
  diagnostics: async () => ({ platform: "browser", version: "preview" }),
  clearModels: async () => true,
  getCloseBehavior: async () => "ask",
  setCloseBehavior: async () => "ask",
  getAutoStart: async () => false,
  setAutoStart: async () => false,
  getShortcuts: async () => ({ record: "CommandOrControl+Shift+Space", reprocess: "CommandOrControl+Alt+Space" }),
  setShortcuts: async (shortcuts) => shortcuts,
  getShortcutMode: async () => "toggle",
  setShortcutMode: async (mode) => mode,
  onShortcutToggle: () => {},
  onShortcutPressed: () => {},
  onShortcutReleased: () => {},
  onReprocess: () => {},
  onShortcutError: () => {},
  onModelProgress: () => {},
  onNavigate: () => {},
  onPasteLast: () => {}
};

initializeProductionProfile(localStorage, voiceAPI.runtime.isPackaged);
upgradeAccuracyDefault(localStorage);

const defaults = {
  language: "spanish",
  whisperProfile: "accurate",
  inferenceDevice: "cpu",
  deliveryMode: "paste-copy",
  appendSpace: true,
  cleanupText: true,
  dictionaryEnabled: true,
  historyLimit: 30,
  autoStopEnabled: true,
  silenceTimeoutMs: 1800,
  shortcutMode: "toggle",
  autoStartEnabled: true
};

const legacyState = {
  settings: JSON.parse(localStorage.getItem("voice-settings") || "{}"),
  history: JSON.parse(localStorage.getItem("voice-history") || "[]"),
  dictionary: JSON.parse(localStorage.getItem("voice-dictionary") || "[]"),
  microphone: localStorage.getItem("voice-microphone") || ""
};
let settings = { ...defaults, ...legacyState.settings };
let history = legacyState.history;
let dictionary = legacyState.dictionary;
let persistedMicrophone = legacyState.microphone;
history = history.map((item) => ({ ...item, id: item.id || crypto.randomUUID() }));
let mediaStream;
let audioContext;
let audioSource;
let captureNode;
let silentGain;
let recordedPcmChunks = [];
let lastAudio;
let recording = false;
let processing = false;
let timerInterval;
let startedAt;
let triggerSource = "button";
let guideIndex = 0;
let overlayHideTimer;
let autoStopPending = false;
let voiceActivityDetector;
let persistQueue = Promise.resolve();
let holdShortcutPressed = false;

const elements = {
  recordButton: $("#recordButton"),
  recorderStage: $("#recorderStage"),
  headline: $("#headline"),
  stateLabel: $("#stateLabel"),
  timer: $("#timer"),
  waveform: $("#waveform"),
  modelBadge: $("#modelBadge"),
  historyList: $("#historyList"),
  historySearch: $("#historySearch"),
  exportHistory: $("#exportHistory"),
  clearHistory: $("#clearHistory"),
  reprocessButton: $("#reprocessButton"),
  dictionaryForm: $("#dictionaryForm"),
  dictionaryInput: $("#dictionaryInput"),
  dictionaryList: $("#dictionaryList"),
  microphone: $("#microphoneSelect"),
  language: $("#languageSelect"),
  whisperProfile: $("#whisperProfile"),
  inferenceDevice: $("#inferenceDevice"),
  deliveryMode: $("#deliveryMode"),
  appendSpace: $("#appendSpace"),
  cleanupText: $("#cleanupText"),
  dictionaryEnabled: $("#dictionaryEnabled"),
  historyLimit: $("#historyLimit"),
  autoStopEnabled: $("#autoStopEnabled"),
  silenceTimeout: $("#silenceTimeout"),
  autoStartEnabled: $("#autoStartEnabled"),
  closeBehavior: $("#closeBehavior"),
  shortcutMode: $("#shortcutMode"),
  recordShortcut: $("#recordShortcut"),
  reprocessShortcut: $("#reprocessShortcut"),
  guideVisual: $("#guideVisual"),
  guideCount: $("#guideCount"),
  guideTitle: $("#guideTitle"),
  guideDescription: $("#guideDescription"),
  guideDots: $("#guideDots"),
  guidePrev: $("#guidePrev"),
  guideNext: $("#guideNext"),
  diagnosticsButton: $("#diagnosticsButton"),
  repairModelsButton: $("#repairModelsButton"),
  performanceSummary: $("#performanceSummary"),
  performanceDetails: $("#performanceDetails"),
  toast: $("#toast")
};

const guideSlides = [
  { tag: "Captura flotante", title: "Habla sin salir de tu trabajo", description: "La señal flotante aparece sin mover el cursor de la aplicación activa.", visual: '<div class="demo-overlay"><div><span></span><strong>NextStepAI Voice</strong></div><i></i><i></i><i></i><i></i><i></i><i></i><p>Escuchando. Presiona el atajo para convertir.</p></div><div class="demo-shortcut"><kbd>Ctrl</kbd><b>+</b><kbd>Shift</kbd><b>+</b><kbd>Espacio</kbd></div>' },
  { tag: "Privacidad", title: "Tu audio se procesa localmente", description: "El motor Whisper corre dentro de tu equipo.", visual: '<div class="demo-incision"><i></i><i></i></div><p>Sin subir grabaciones a la nube.</p>' },
  { tag: "Entrega", title: "Elige cómo llega el texto", description: "Pega, copia o conserva el resultado en la aplicación.", visual: '<div class="demo-options"><span>Pegar + copiar</span><span>Solo copiar</span><span>Solo aplicación</span></div>' },
  { tag: "Precisión", title: "Construye tu diccionario", description: "Protege nombres, marcas y términos técnicos.", visual: '<div class="demo-dictionary"><span>NextStepAI <b>Aprendido</b></span><span>Avinzano <b>Aprendido</b></span><span>Whisper <b>Aprendido</b></span></div>' },
  { tag: "Claridad", title: "Limpia el mensaje", description: "Reduce muletillas y normaliza espacios automáticamente.", visual: '<div class="demo-clean"><s>eh, bueno,</s><strong> necesitamos avanzar con la propuesta.</strong></div>' },
  { tag: "Texto inteligente", title: "Dicta correos y direcciones web", description: "Expresiones habladas como arroba, punto com y slash se convierten.", visual: '<div class="demo-urls"><span>equipo arroba nextstepai punto com</span><b>→</b><strong>equipo@nextstepai.com</strong></div>' },
  { tag: "Formato", title: "Da forma mientras hablas", description: "Usa nueva línea y punto y aparte para estructurar el resultado.", visual: '<div class="demo-result"><span>Mensaje / con estructura</span><p>Hola María, espero que estés muy bien.<br><br>Revisemos la propuesta el martes.<br><br>Saludos.</p></div>' },
  { tag: "Resultado", title: "Una idea lista para avanzar", description: "Tu texto queda disponible, copiable y organizado.", visual: '<div class="demo-result"><span>Resultado / listo</span><p>Agendemos la revisión para el martes a las diez.</p></div>' }
];

function saveSettings() {
  persistState();
}

function persistState() {
  const snapshot = {
    settings: { ...settings },
    history: history.map((item) => ({ ...item })),
    dictionary: [...dictionary],
    microphone: persistedMicrophone
  };
  persistQueue = persistQueue.then(() => voiceAPI.writeState(snapshot)).catch((error) => {
    console.error("Could not persist local state:", error);
  });
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => elements.toast.classList.remove("show"), 2600);
}

function updateOverlay(status, message, timer = "") {
  clearTimeout(overlayHideTimer);
  voiceAPI.overlay({ status, message, timer });
}

function finishOverlay(status, message) {
  updateOverlay(status, message);
  overlayHideTimer = setTimeout(() => voiceAPI.overlay({ status: "idle" }), status === "error" ? 1800 : 1050);
}

function switchPanel(name) {
  $$(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.panel === name));
  $$(".panel").forEach((panel) => panel.classList.toggle("active", panel.id === `${name}Panel`));
}

function formatTime(totalSeconds) {
  return `${Math.floor(totalSeconds / 60).toString().padStart(2, "0")}:${Math.floor(totalSeconds % 60).toString().padStart(2, "0")}`;
}

function setStatus(status, detail) {
  voiceAPI.taskbar({ status });
  elements.recorderStage.dataset.status = status;
  elements.stateLabel.textContent = detail;
  elements.recordButton.disabled = status === "processing";
  const headlines = {
    idle: "Listo para capturar tu idea.",
    recording: "Tu idea está tomando forma.",
    processing: "Convirtiendo voz en el siguiente paso."
  };
  elements.headline.textContent = headlines[status];
}

function createWaveform() {
  for (let index = 0; index < 32; index += 1) {
    const bar = document.createElement("i");
    bar.style.setProperty("--delay", `${index * -0.045}s`);
    bar.style.setProperty("--height", `${18 + Math.random() * 60}%`);
    elements.waveform.appendChild(bar);
  }
}

async function releaseAudioCapture() {
  audioSource?.disconnect();
  captureNode?.disconnect();
  silentGain?.disconnect();
  mediaStream?.getTracks().forEach((track) => track.stop());
  await audioContext?.close();
  mediaStream = undefined;
  audioContext = undefined;
  audioSource = undefined;
  captureNode = undefined;
  silentGain = undefined;
  voiceActivityDetector = undefined;
}

async function updateMicrophones() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const microphones = devices.filter((device) => device.kind === "audioinput");
  const selected = persistedMicrophone;
  elements.microphone.innerHTML = '<option value="">Micrófono predeterminado</option>';
  microphones.forEach((microphone, index) => {
    const option = document.createElement("option");
    option.value = microphone.deviceId;
    option.textContent = microphone.label || `Micrófono ${index + 1}`;
    elements.microphone.appendChild(option);
  });
  if ([...elements.microphone.options].some((option) => option.value === selected)) elements.microphone.value = selected;
}

async function beginRecording(source = "button") {
  if (recording || processing) return;
  triggerSource = source;
  try {
    const selectedMicrophone = elements.microphone.value;
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...(selectedMicrophone ? { deviceId: { exact: selectedMicrophone } } : {}),
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    });
    await updateMicrophones();
    recordedPcmChunks = [];
    autoStopPending = false;
    voiceActivityDetector = createVoiceActivityDetector({ silenceTimeoutMs: Number(settings.silenceTimeoutMs) });
    audioContext = new AudioContext({ sampleRate: 16000, latencyHint: "interactive" });
    await audioContext.audioWorklet.addModule("src/pcm-capture-worklet.js");
    audioSource = audioContext.createMediaStreamSource(mediaStream);
    captureNode = new AudioWorkletNode(audioContext, "nextstepai-pcm-capture");
    silentGain = audioContext.createGain();
    silentGain.gain.value = 0;
    captureNode.port.onmessage = (event) => {
      if (event.data instanceof Float32Array && event.data.length) {
        recordedPcmChunks.push(event.data);
        return;
      }
      if (event.data?.type === "level") handleVoiceLevel(event.data.rms);
    };
    audioSource.connect(captureNode);
    captureNode.connect(silentGain);
    silentGain.connect(audioContext.destination);
    await audioContext.resume();
    recording = true;
    startedAt = Date.now();
    elements.timer.textContent = "00:00";
    timerInterval = setInterval(() => {
      elements.timer.textContent = formatTime((Date.now() - startedAt) / 1000);
      if (triggerSource === "shortcut") {
        const instruction = settings.shortcutMode === "hold" ? "Escuchando. Suelta el atajo para convertir." : "Escuchando. Presiona el atajo para convertir.";
        updateOverlay("recording", instruction, elements.timer.textContent);
      }
    }, 250);
    setStatus("recording", settings.shortcutMode === "hold" ? "Habla con naturalidad. Suelta el atajo para convertir." : "Habla con naturalidad. Presiona de nuevo para convertir.");
    if (triggerSource === "shortcut") {
      const instruction = settings.shortcutMode === "hold" ? "Escuchando. Suelta el atajo para convertir." : "Escuchando. Presiona el atajo para convertir.";
      updateOverlay("recording", instruction, "00:00");
    }
  } catch (error) {
    console.error(error);
    await releaseAudioCapture();
    setStatus("idle", "No pudimos acceder al micrófono.");
    showToast(`Micrófono no disponible: ${error.message || error.name}`);
    if (source === "shortcut") finishOverlay("error", "No pudimos acceder al micrófono.");
  }
}

function handleVoiceLevel(rms) {
  if (!recording || !settings.autoStopEnabled || autoStopPending) return;
  if (!voiceActivityDetector?.update(rms)) return;
  autoStopPending = true;
  showToast("Silencio detectado. Procesando grabación.");
  finishRecording();
}

function collectRecording() {
  const length = recordedPcmChunks.reduce((total, chunk) => total + chunk.length, 0);
  if (!length) throw new Error("El micrófono no produjo datos de audio.");
  const samples = new Float32Array(length);
  let offset = 0;
  for (const chunk of recordedPcmChunks) {
    samples.set(chunk, offset);
    offset += chunk.length;
  }
  return trimEdgeSilence(resampleAudio(samples, audioContext?.sampleRate || 16000));
}

function cleanText(text) {
  return cleanTranscription(text, {
    cleanup: settings.cleanupText,
    dictionaryEnabled: settings.dictionaryEnabled,
    dictionary,
    appendSpace: settings.appendSpace
  });
}

async function processAudio(audio, source = "button") {
  if (!audio) {
    showToast("Todavía no hay una grabación para reprocesar.");
    if (source === "shortcut") finishOverlay("error", "Todavía no hay una grabación para reprocesar.");
    return;
  }
  processing = true;
  setStatus("processing", "Procesando localmente. Tu audio no sale de este equipo.");
  if (source === "shortcut") updateOverlay("processing", "Convirtiendo tu voz en texto.", "LOCAL");
  try {
    elements.modelBadge.classList.add("loading");
    elements.modelBadge.classList.remove("error");
    elements.modelBadge.innerHTML = "<span></span>Preparando motor local";
    const profile = resolveWhisperProfile(settings.whisperProfile);
    const result = await voiceAPI.transcribe(audio, settings.language, profile.id, settings.inferenceDevice);
    const rawText = typeof result === "string" ? result : result.text;
    if (!rawText) throw new Error("El motor no devolvió texto.");
    const text = cleanText(rawText);
    if (!text.trim()) throw new Error("No detectamos palabras claras en la grabación.");
    elements.modelBadge.classList.remove("loading", "error");
    elements.modelBadge.innerHTML = `<span></span>${profile.shortLabel} · ${(result.device || "cpu").toUpperCase()}`;
    addHistory(text);
    if (result.metrics) renderPerformance(result.metrics);
    const delivery = await deliverText(text, source);
    if (source === "shortcut") {
      finishOverlay(
        "success",
        delivery.pasted ? "Texto pegado. Continúa escribiendo." : "Transcripción copiada al portapapeles."
      );
    }
  } catch (error) {
    console.error(error);
    elements.modelBadge.classList.remove("loading");
    elements.modelBadge.classList.add("error");
    elements.modelBadge.innerHTML = "<span></span>Motor no disponible";
    showToast(`No fue posible transcribir: ${error.message || error}`);
    if (source === "shortcut") finishOverlay("error", "No fue posible completar la transcripción.");
  } finally {
    processing = false;
    setStatus("idle", "Haz clic o usa Ctrl + Shift + Espacio.");
  }
}

async function renderPerformance(metrics) {
  const diagnostics = await voiceAPI.diagnostics();
  elements.performanceSummary.textContent = `${(metrics.totalMs / 1000).toFixed(1)} s total · ${metrics.realtimeFactor}x tiempo real`;
  elements.performanceDetails.textContent = `Inferencia ${(metrics.inferenceMs / 1000).toFixed(1)} s · carga ${(metrics.modelLoadMs / 1000).toFixed(1)} s · memoria ${diagnostics.memoryRssMb} MB RSS`;
}

async function finishRecording() {
  if (!recording) return;
  recording = false;
  processing = true;
  clearInterval(timerInterval);
  captureNode?.port.postMessage("flush");
  await new Promise((resolve) => setTimeout(resolve, 40));
  try {
    lastAudio = collectRecording();
  } catch (error) {
    processing = false;
    setStatus("idle", error.message);
    if (triggerSource === "shortcut") finishOverlay("error", "No pudimos procesar la grabación.");
    return;
  } finally {
    await releaseAudioCapture();
  }
  const peak = lastAudio.reduce((maximum, sample) => Math.max(maximum, Math.abs(sample)), 0);
  if (lastAudio.length < 12000) {
    processing = false;
    setStatus("idle", "La grabación fue demasiado corta. Intenta de nuevo.");
    if (triggerSource === "shortcut") finishOverlay("error", "La grabación fue demasiado corta.");
    return;
  }
  if (peak < 0.002) {
    processing = false;
    setStatus("idle", "No detectamos voz. Revisa el micrófono seleccionado.");
    if (triggerSource === "shortcut") finishOverlay("error", "No detectamos voz. Revisa el micrófono.");
    return;
  }
  processing = false;
  await processAudio(lastAudio, triggerSource);
}

async function deliverText(text, source) {
  if (settings.deliveryMode === "copy" || settings.deliveryMode === "paste-copy") await voiceAPI.copy(text);
  if (settings.deliveryMode === "paste-copy" && source === "shortcut") {
    const pasted = await voiceAPI.paste(text);
    showToast(pasted
      ? "Texto pegado y guardado en el portapapeles."
      : "Windows bloqueó el pegado. El texto quedó seguro en el portapapeles.");
    return { pasted };
  } else if (settings.deliveryMode === "copy") {
    showToast("Texto guardado en el portapapeles.");
  } else {
    showToast("Transcripción lista.");
  }
  return { pasted: false };
}

function addHistory(text) {
  history.unshift({ id: crypto.randomUUID(), text, at: new Date().toISOString() });
  history = history.slice(0, Number(settings.historyLimit));
  persistState();
  renderHistory();
}

function renderHistory() {
  elements.historyList.innerHTML = "";
  const query = elements.historySearch.value.trim().toLocaleLowerCase();
  const visibleHistory = query
    ? history.filter((item) => item.text.toLocaleLowerCase().includes(query))
    : history;
  if (!visibleHistory.length) {
    if (query) {
      elements.historyList.innerHTML = '<div class="empty-state"><span>Búsqueda local</span><h3>No encontramos coincidencias.</h3><p>Prueba con otra palabra o frase.</p></div>';
      return;
    }
    elements.historyList.innerHTML = '<div class="empty-state"><span>Archivo local</span><h3>Aún no hay transcripciones.</h3><p>Tu primera idea convertida en texto aparecerá aquí.</p></div>';
    return;
  }
  visibleHistory.forEach((item, index) => {
    const article = document.createElement("article");
    const date = new Date(item.at);
    article.className = "history-item";
    article.innerHTML = `<button class="history-copy" title="Copiar transcripción"><span></span><p></p></button><div class="history-meta"><time>${date.toLocaleString()}</time><button class="history-delete">Eliminar</button></div>`;
    article.querySelector(".history-copy span").textContent = `${String(index + 1).padStart(2, "0")} / Texto`;
    article.querySelector("p").textContent = item.text;
    article.querySelector(".history-copy").addEventListener("click", async () => {
      await voiceAPI.copy(item.text);
      showToast("Transcripción copiada.");
    });
    article.querySelector(".history-delete").addEventListener("click", () => {
      history = history.filter((entry) => entry.id !== item.id);
      persistState();
      renderHistory();
    });
    elements.historyList.appendChild(article);
  });
}

function renderDictionary() {
  elements.dictionaryList.innerHTML = "";
  if (!dictionary.length) {
    elements.dictionaryList.innerHTML = '<div class="empty-state compact"><span>Diccionario personal</span><h3>Empieza con una palabra importante.</h3><p>Nombres propios, marcas y términos técnicos son un buen comienzo.</p></div>';
    return;
  }
  dictionary.forEach((term, index) => {
    const row = document.createElement("div");
    row.className = "dictionary-item";
    row.innerHTML = `<span>${String(index + 1).padStart(2, "0")}</span><strong></strong><em>Activo</em><button>Eliminar</button>`;
    row.querySelector("strong").textContent = term;
    row.querySelector("button").addEventListener("click", () => {
      dictionary = dictionary.filter((item) => item !== term);
      persistState();
      renderDictionary();
    });
    elements.dictionaryList.appendChild(row);
  });
}

function renderGuide() {
  const slide = guideSlides[guideIndex];
  elements.guideVisual.innerHTML = `<span class="guide-tag">${slide.tag}</span><h2>${slide.title}</h2><div class="guide-demo">${slide.visual}</div>`;
  elements.guideCount.textContent = `${guideIndex + 1} / ${guideSlides.length}`;
  elements.guideTitle.textContent = slide.title;
  elements.guideDescription.textContent = slide.description;
  elements.guideDots.innerHTML = guideSlides.map((_, index) => `<i class="${index === guideIndex ? "active" : ""}"></i>`).join("");
  elements.guidePrev.disabled = guideIndex === 0;
  elements.guideNext.textContent = guideIndex === guideSlides.length - 1 ? "Listo" : "Siguiente →";
}

async function hydrateSettings() {
  const profile = resolveWhisperProfile(settings.whisperProfile);
  elements.language.value = settings.language;
  elements.whisperProfile.value = profile.id;
  elements.inferenceDevice.value = settings.inferenceDevice;
  elements.modelBadge.innerHTML = `<span></span>${profile.label} seleccionado`;
  elements.deliveryMode.value = settings.deliveryMode;
  elements.appendSpace.checked = settings.appendSpace;
  elements.cleanupText.checked = settings.cleanupText;
  elements.dictionaryEnabled.checked = settings.dictionaryEnabled;
  elements.historyLimit.value = String(settings.historyLimit);
  elements.autoStopEnabled.checked = settings.autoStopEnabled;
  elements.silenceTimeout.value = String(settings.silenceTimeoutMs);
  const shortcuts = await voiceAPI.getShortcuts();
  elements.recordShortcut.value = shortcuts.record;
  elements.reprocessShortcut.value = shortcuts.reprocess;
  settings.shortcutMode = await voiceAPI.getShortcutMode();
  elements.shortcutMode.value = settings.shortcutMode;
  settings.autoStartEnabled = await voiceAPI.getAutoStart();
  elements.autoStartEnabled.checked = settings.autoStartEnabled;
  saveSettings();
  elements.closeBehavior.value = await voiceAPI.getCloseBehavior();
}

function toggleRecording(source = "button") {
  if (recording) finishRecording();
  else beginRecording(source);
}

$$(".nav-item").forEach((button) => button.addEventListener("click", () => switchPanel(button.dataset.panel)));
$$(".go-guide").forEach((button) => button.addEventListener("click", () => switchPanel("guide")));
elements.recordButton.addEventListener("click", () => toggleRecording("button"));
elements.reprocessButton.addEventListener("click", () => processAudio(lastAudio, "button"));
elements.clearHistory.addEventListener("click", () => {
  history = [];
  persistState();
  renderHistory();
});
elements.historySearch.addEventListener("input", renderHistory);
elements.exportHistory.addEventListener("click", async () => {
  if (!history.length) {
    showToast("Aún no hay transcripciones para exportar.");
    return;
  }
  const exported = await voiceAPI.exportHistory(history);
  showToast(exported ? "Historial exportado." : "Exportación cancelada.");
});
elements.dictionaryForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const term = elements.dictionaryInput.value.trim();
  if (!term || dictionary.some((item) => item.toLocaleLowerCase() === term.toLocaleLowerCase())) return;
  dictionary.unshift(term);
  persistState();
  elements.dictionaryInput.value = "";
  renderDictionary();
  showToast("Término añadido al diccionario.");
});
elements.microphone.addEventListener("change", () => {
  persistedMicrophone = elements.microphone.value;
  persistState();
  showToast("Micrófono seleccionado.");
});
[
  ["language", elements.language],
  ["whisperProfile", elements.whisperProfile],
  ["inferenceDevice", elements.inferenceDevice],
  ["deliveryMode", elements.deliveryMode],
  ["appendSpace", elements.appendSpace],
  ["cleanupText", elements.cleanupText],
  ["dictionaryEnabled", elements.dictionaryEnabled],
  ["historyLimit", elements.historyLimit],
  ["autoStopEnabled", elements.autoStopEnabled],
  ["silenceTimeoutMs", elements.silenceTimeout]
].forEach(([key, control]) => control.addEventListener("change", () => {
  settings[key] = control.type === "checkbox" ? control.checked : control.value;
  if (key === "historyLimit" || key === "silenceTimeoutMs") settings[key] = Number(settings[key]);
  saveSettings();
  if (key === "whisperProfile") {
    const profile = resolveWhisperProfile(settings.whisperProfile);
    elements.modelBadge.classList.remove("loading", "error");
    elements.modelBadge.innerHTML = `<span></span>${profile.label} seleccionado`;
  }
  if (key === "historyLimit") {
    history = history.slice(0, settings.historyLimit);
    persistState();
    renderHistory();
  }
  showToast("Preferencia guardada.");
}));
elements.guidePrev.addEventListener("click", () => {
  guideIndex = Math.max(0, guideIndex - 1);
  renderGuide();
});
elements.guideNext.addEventListener("click", () => {
  if (guideIndex === guideSlides.length - 1) switchPanel("home");
  else guideIndex += 1;
  renderGuide();
});
elements.diagnosticsButton.addEventListener("click", async () => {
  const diagnostics = await voiceAPI.diagnostics();
  const report = [
    "NextStepAI Voice diagnostics",
    `Platform: ${diagnostics.platform}`,
    `Version: ${diagnostics.version}`,
    `Model status: ${elements.modelBadge.textContent.trim()}`,
    `Whisper profile selected: ${resolveWhisperProfile(settings.whisperProfile).shortLabel}`,
    `Whisper profile loaded: ${diagnostics.loadedWhisperProfile}`,
    `Inference device: ${diagnostics.inferenceDevice}`,
    `Requested inference device: ${diagnostics.requestedInferenceDevice}`,
    `Last device fallback: ${diagnostics.lastDeviceFallback || "none"}`,
    `Model cache: ${diagnostics.modelCacheMb} MB`,
    `Memory RSS: ${diagnostics.memoryRssMb} MB`,
    `Heap used: ${diagnostics.heapUsedMb} MB`,
    `Record shortcut: ${diagnostics.shortcuts.record}`,
    `Reprocess shortcut: ${diagnostics.shortcuts.reprocess}`,
    `Shortcut mode: ${diagnostics.shortcutMode || settings.shortcutMode}`,
    `Last transcription metrics: ${JSON.stringify(diagnostics.lastTranscriptionMetrics || null)}`,
    `State schema: ${diagnostics.stateSchemaVersion}`,
    `State path: ${diagnostics.statePath}`,
    `Microphone configured: ${Boolean(elements.microphone.value)}`,
    `Dictionary terms: ${dictionary.length}`,
    `History entries: ${history.length}`
  ].join("\n");
  await voiceAPI.copy(report);
  showToast("Diagnóstico copiado. No incluye transcripciones.");
});
elements.repairModelsButton.addEventListener("click", async () => {
  if (recording || processing) {
    showToast("Espera a que termine la grabación antes de reparar los modelos.");
    return;
  }
  elements.modelBadge.classList.add("loading");
  elements.modelBadge.classList.remove("error");
  elements.modelBadge.innerHTML = "<span></span>Reparando modelos";
  try {
    await voiceAPI.clearModels();
    elements.modelBadge.classList.remove("loading", "error");
    elements.modelBadge.innerHTML = "<span></span>Modelos listos para descargar";
    showToast("Caché reparada. El modelo se descargará en la próxima transcripción.");
  } catch (error) {
    elements.modelBadge.classList.remove("loading");
    elements.modelBadge.classList.add("error");
    elements.modelBadge.innerHTML = "<span></span>No fue posible reparar";
    showToast(`No fue posible reparar los modelos: ${error.message || error}`);
  }
});
elements.closeBehavior.addEventListener("change", async () => {
  await voiceAPI.setCloseBehavior(elements.closeBehavior.value);
  showToast("Comportamiento de cierre guardado.");
});
elements.autoStartEnabled.addEventListener("change", async () => {
  const requested = elements.autoStartEnabled.checked;
  try {
    settings.autoStartEnabled = await voiceAPI.setAutoStart(requested);
    elements.autoStartEnabled.checked = settings.autoStartEnabled;
    saveSettings();
    showToast(settings.autoStartEnabled ? "Inicio con Windows activado." : "Inicio con Windows desactivado.");
  } catch (error) {
    elements.autoStartEnabled.checked = settings.autoStartEnabled;
    showToast(`No fue posible cambiar el inicio con Windows: ${error.message || error}`);
  }
});
async function updateShortcuts() {
  const requested = {
    record: elements.recordShortcut.value,
    reprocess: elements.reprocessShortcut.value
  };
  try {
    const applied = await voiceAPI.setShortcuts(requested);
    elements.recordShortcut.value = applied.record;
    elements.reprocessShortcut.value = applied.reprocess;
    showToast("Atajos globales actualizados.");
  } catch (error) {
    const current = await voiceAPI.getShortcuts();
    elements.recordShortcut.value = current.record;
    elements.reprocessShortcut.value = current.reprocess;
    showToast(error.message || "No fue posible registrar los atajos.");
  }
}
elements.recordShortcut.addEventListener("change", updateShortcuts);
elements.reprocessShortcut.addEventListener("change", updateShortcuts);
elements.shortcutMode.addEventListener("change", async () => {
  const previous = settings.shortcutMode;
  try {
    settings.shortcutMode = await voiceAPI.setShortcutMode(elements.shortcutMode.value);
    elements.shortcutMode.value = settings.shortcutMode;
    saveSettings();
    showToast(settings.shortcutMode === "hold" ? "Mantén el atajo para grabar." : "Modo de atajo alternar activado.");
  } catch (error) {
    settings.shortcutMode = previous;
    elements.shortcutMode.value = previous;
    showToast(error.message || "No fue posible cambiar el modo del atajo.");
  }
});

voiceAPI.onShortcutToggle(() => toggleRecording("shortcut"));
voiceAPI.onShortcutPressed(async () => {
  holdShortcutPressed = true;
  if (!recording && !processing) await beginRecording("shortcut");
  if (!holdShortcutPressed && recording) finishRecording();
});
voiceAPI.onShortcutReleased(() => {
  holdShortcutPressed = false;
  if (recording) finishRecording();
});
voiceAPI.onReprocess(() => processAudio(lastAudio, "shortcut"));
voiceAPI.onShortcutError(() => showToast("Un acceso directo ya está siendo usado por otra aplicación."));
voiceAPI.onNavigate((panel) => switchPanel(panel));
voiceAPI.onPasteLast(async () => {
  if (!history.length) {
    showToast("Aún no hay transcripciones para pegar.");
    return;
  }
  try {
    await voiceAPI.paste(history[0].text);
    showToast("Última transcripción pegada.");
  } catch (error) {
    showToast(`No fue posible pegar la transcripción: ${error.message || error}`);
  }
});
voiceAPI.onModelProgress((progress) => {
  if (progress.status !== "progress" || !Number.isFinite(progress.progress)) return;
  const percent = Math.max(0, Math.min(100, Math.round(progress.progress)));
  elements.modelBadge.innerHTML = `<span></span>${progress.label || "Whisper"} ${percent}%`;
  elements.stateLabel.textContent = `Preparando ${progress.label || "el motor local"} por primera vez: ${percent}%`;
});

async function initializeApp() {
  await voiceAPI.migrateLegacyState(legacyState);
  const persisted = await voiceAPI.getState();
  settings = { ...defaults, ...persisted.settings };
  history = persisted.history.map((item) => ({ ...item, id: item.id || crypto.randomUUID() }));
  dictionary = persisted.dictionary;
  persistedMicrophone = persisted.microphone;
  localStorage.removeItem("voice-settings");
  localStorage.removeItem("voice-history");
  localStorage.removeItem("voice-dictionary");
  localStorage.removeItem("voice-microphone");

  createWaveform();
  await hydrateSettings();
  renderHistory();
  renderDictionary();
  renderGuide();
  await updateMicrophones();
  setStatus("idle", "Haz clic o usa Ctrl + Shift + Espacio.");
}

initializeApp().catch((error) => {
  console.error("Could not initialize application state:", error);
  showToast("No fue posible cargar los datos locales.");
});
