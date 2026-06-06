const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const { cleanTranscription } = require("./text-cleanup.cjs");
const { resolveWhisperProfile } = require("./whisper-profiles.cjs");

const voiceAPI = window.voiceAPI || {
  copy: async (text) => navigator.clipboard?.writeText(text),
  paste: async (text) => navigator.clipboard?.writeText(text),
  transcribe: async () => { throw new Error("La transcripción requiere la aplicación de escritorio."); },
  overlay: async () => {},
  diagnostics: async () => ({ platform: "browser", version: "preview" }),
  clearModels: async () => true,
  onShortcutToggle: () => {},
  onReprocess: () => {},
  onShortcutError: () => {},
  onModelProgress: () => {}
};

const defaults = {
  language: "spanish",
  whisperProfile: "fast",
  deliveryMode: "paste-copy",
  appendSpace: true,
  cleanupText: true,
  dictionaryEnabled: true,
  historyLimit: 30
};

let settings = { ...defaults, ...JSON.parse(localStorage.getItem("voice-settings") || "{}") };
let history = JSON.parse(localStorage.getItem("voice-history") || "[]");
let dictionary = JSON.parse(localStorage.getItem("voice-dictionary") || "[]");
history = history.map((item) => ({ ...item, id: item.id || crypto.randomUUID() }));
localStorage.setItem("voice-history", JSON.stringify(history));
let mediaStream;
let mediaRecorder;
let recordedChunks = [];
let lastAudio;
let recording = false;
let processing = false;
let timerInterval;
let startedAt;
let triggerSource = "button";
let guideIndex = 0;
let overlayHideTimer;

const elements = {
  recordButton: $("#recordButton"),
  recorderStage: $("#recorderStage"),
  headline: $("#headline"),
  stateLabel: $("#stateLabel"),
  timer: $("#timer"),
  waveform: $("#waveform"),
  modelBadge: $("#modelBadge"),
  historyList: $("#historyList"),
  clearHistory: $("#clearHistory"),
  reprocessButton: $("#reprocessButton"),
  dictionaryForm: $("#dictionaryForm"),
  dictionaryInput: $("#dictionaryInput"),
  dictionaryList: $("#dictionaryList"),
  microphone: $("#microphoneSelect"),
  language: $("#languageSelect"),
  whisperProfile: $("#whisperProfile"),
  deliveryMode: $("#deliveryMode"),
  appendSpace: $("#appendSpace"),
  cleanupText: $("#cleanupText"),
  dictionaryEnabled: $("#dictionaryEnabled"),
  historyLimit: $("#historyLimit"),
  guideVisual: $("#guideVisual"),
  guideCount: $("#guideCount"),
  guideTitle: $("#guideTitle"),
  guideDescription: $("#guideDescription"),
  guideDots: $("#guideDots"),
  guidePrev: $("#guidePrev"),
  guideNext: $("#guideNext"),
  diagnosticsButton: $("#diagnosticsButton"),
  repairModelsButton: $("#repairModelsButton"),
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
  localStorage.setItem("voice-settings", JSON.stringify(settings));
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

async function updateMicrophones() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const microphones = devices.filter((device) => device.kind === "audioinput");
  const selected = localStorage.getItem("voice-microphone") || "";
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
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    await updateMicrophones();
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(mediaStream);
    mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) recordedChunks.push(event.data);
    });
    mediaRecorder.start(250);
    recording = true;
    startedAt = Date.now();
    elements.timer.textContent = "00:00";
    timerInterval = setInterval(() => {
      elements.timer.textContent = formatTime((Date.now() - startedAt) / 1000);
      if (triggerSource === "shortcut") updateOverlay("recording", "Escuchando. Presiona el atajo para convertir.", elements.timer.textContent);
    }, 250);
    setStatus("recording", "Habla con naturalidad. Presiona de nuevo para convertir.");
    if (triggerSource === "shortcut") updateOverlay("recording", "Escuchando. Presiona el atajo para convertir.", "00:00");
  } catch (error) {
    console.error(error);
    setStatus("idle", "No pudimos acceder al micrófono.");
    showToast(`Micrófono no disponible: ${error.message || error.name}`);
    if (source === "shortcut") finishOverlay("error", "No pudimos acceder al micrófono.");
  }
}

function resampleAudio(input, inputRate, outputRate = 16000) {
  if (inputRate === outputRate) return new Float32Array(input);
  const ratio = inputRate / outputRate;
  const output = new Float32Array(Math.round(input.length / ratio));
  for (let index = 0; index < output.length; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(input.length, Math.floor((index + 1) * ratio));
    let sum = 0;
    for (let sample = start; sample < end; sample += 1) sum += input[sample];
    output[index] = sum / Math.max(1, end - start);
  }
  return output;
}

async function decodeRecording() {
  const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType });
  if (!blob.size) throw new Error("El micrófono no produjo datos de audio.");
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    return resampleAudio(buffer.getChannelData(0), buffer.sampleRate);
  } finally {
    await context.close();
  }
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
    const rawText = await voiceAPI.transcribe(audio, settings.language, profile.id);
    if (!rawText) throw new Error("El motor no devolvió texto.");
    const text = cleanText(rawText);
    if (!text.trim()) throw new Error("No detectamos palabras claras en la grabación.");
    elements.modelBadge.classList.remove("loading", "error");
    elements.modelBadge.innerHTML = `<span></span>${profile.shortLabel} listo`;
    addHistory(text);
    await deliverText(text, source);
    if (source === "shortcut") finishOverlay("success", settings.deliveryMode === "paste-copy" ? "Texto pegado. Continúa escribiendo." : "Transcripción lista.");
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

async function finishRecording() {
  if (!recording) return;
  recording = false;
  processing = true;
  clearInterval(timerInterval);
  const stopped = new Promise((resolve) => mediaRecorder.addEventListener("stop", resolve, { once: true }));
  mediaRecorder.stop();
  await stopped;
  mediaStream?.getTracks().forEach((track) => track.stop());
  try {
    lastAudio = await decodeRecording();
  } catch (error) {
    processing = false;
    setStatus("idle", error.message);
    if (triggerSource === "shortcut") finishOverlay("error", "No pudimos procesar la grabación.");
    return;
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
    if (!pasted) throw new Error("Windows no confirmó el pegado en la ventana activa.");
    showToast("Texto pegado y guardado en el portapapeles.");
  } else if (settings.deliveryMode === "copy") {
    showToast("Texto guardado en el portapapeles.");
  } else {
    showToast("Transcripción lista.");
  }
}

function addHistory(text) {
  history.unshift({ id: crypto.randomUUID(), text, at: new Date().toISOString() });
  history = history.slice(0, Number(settings.historyLimit));
  localStorage.setItem("voice-history", JSON.stringify(history));
  renderHistory();
}

function renderHistory() {
  elements.historyList.innerHTML = "";
  if (!history.length) {
    elements.historyList.innerHTML = '<div class="empty-state"><span>Archivo local</span><h3>Aún no hay transcripciones.</h3><p>Tu primera idea convertida en texto aparecerá aquí.</p></div>';
    return;
  }
  history.forEach((item, index) => {
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
      localStorage.setItem("voice-history", JSON.stringify(history));
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
      localStorage.setItem("voice-dictionary", JSON.stringify(dictionary));
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

function hydrateSettings() {
  const profile = resolveWhisperProfile(settings.whisperProfile);
  elements.language.value = settings.language;
  elements.whisperProfile.value = profile.id;
  elements.modelBadge.innerHTML = `<span></span>${profile.label} seleccionado`;
  elements.deliveryMode.value = settings.deliveryMode;
  elements.appendSpace.checked = settings.appendSpace;
  elements.cleanupText.checked = settings.cleanupText;
  elements.dictionaryEnabled.checked = settings.dictionaryEnabled;
  elements.historyLimit.value = String(settings.historyLimit);
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
  localStorage.removeItem("voice-history");
  renderHistory();
});
elements.dictionaryForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const term = elements.dictionaryInput.value.trim();
  if (!term || dictionary.some((item) => item.toLocaleLowerCase() === term.toLocaleLowerCase())) return;
  dictionary.unshift(term);
  localStorage.setItem("voice-dictionary", JSON.stringify(dictionary));
  elements.dictionaryInput.value = "";
  renderDictionary();
  showToast("Término añadido al diccionario.");
});
elements.microphone.addEventListener("change", () => {
  localStorage.setItem("voice-microphone", elements.microphone.value);
  showToast("Micrófono seleccionado.");
});
[
  ["language", elements.language],
  ["whisperProfile", elements.whisperProfile],
  ["deliveryMode", elements.deliveryMode],
  ["appendSpace", elements.appendSpace],
  ["cleanupText", elements.cleanupText],
  ["dictionaryEnabled", elements.dictionaryEnabled],
  ["historyLimit", elements.historyLimit]
].forEach(([key, control]) => control.addEventListener("change", () => {
  settings[key] = control.type === "checkbox" ? control.checked : control.value;
  if (key === "historyLimit") settings[key] = Number(settings[key]);
  saveSettings();
  if (key === "whisperProfile") {
    const profile = resolveWhisperProfile(settings.whisperProfile);
    elements.modelBadge.classList.remove("loading", "error");
    elements.modelBadge.innerHTML = `<span></span>${profile.label} seleccionado`;
  }
  if (key === "historyLimit") {
    history = history.slice(0, settings.historyLimit);
    localStorage.setItem("voice-history", JSON.stringify(history));
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
    `Model cache: ${diagnostics.modelCacheMb} MB`,
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

voiceAPI.onShortcutToggle(() => toggleRecording("shortcut"));
voiceAPI.onReprocess(() => processAudio(lastAudio, "shortcut"));
voiceAPI.onShortcutError(() => showToast("Un acceso directo ya está siendo usado por otra aplicación."));
voiceAPI.onModelProgress((progress) => {
  if (progress.status !== "progress" || !Number.isFinite(progress.progress)) return;
  const percent = Math.max(0, Math.min(100, Math.round(progress.progress)));
  elements.modelBadge.innerHTML = `<span></span>${progress.label || "Whisper"} ${percent}%`;
  elements.stateLabel.textContent = `Preparando ${progress.label || "el motor local"} por primera vez: ${percent}%`;
});

createWaveform();
hydrateSettings();
renderHistory();
renderDictionary();
renderGuide();
updateMicrophones().catch(() => {});
setStatus("idle", "Haz clic o usa Ctrl + Shift + Espacio.");
