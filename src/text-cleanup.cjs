const TOP_LEVEL_DOMAINS = "com|co|org|net|io|ai|es|mx|us|dev|app|edu|gov";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeRawInput(text) {
  return String(text || "")
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .trim();
}

function removeSilenceArtifacts(text) {
  if (/^[\s.,;:!?…\-–—]+$/u.test(text)) return "";

  const withoutNonSpeech = text
    .replace(/(?:^|\s)[[(](?:música|music|aplausos|applause|silencio|silence|ruido|noise)[\])](?=\s|$)/giu, " ")
    .trim();
  if (!withoutNonSpeech) return "";
  if (/^(?:gracias por ver el video|gracias por ver|suscríbete al canal)[.!]?$/iu.test(withoutNonSpeech)) return "";
  if (/^(?:y|e|o|u|el|la|los|las|un|una|unos|unas|de|del|a|al|en|que)[.!]?$/iu.test(withoutNonSpeech)) return "";

  return withoutNonSpeech
    .replace(/(?:^|\s)(?:[.?!…]\s*){2,}(?=\s|$)/gu, " ")
    .replace(/\s+([.?!])(?:\s+\1)+(?=\s|$)/gu, "$1 ")
    .replace(/\.{2,}/g, ".")
    .trim();
}

function formatAddressFragment(fragment) {
  return fragment
    .replace(/\s+(?:punto)\s+/giu, ".")
    .replace(/\s+(?:guion bajo|subrayado)\s+/giu, "_")
    .replace(/\s+(?:guion)\s+/giu, "-")
    .replace(/\s+(?:más|mas)\s+/giu, "+")
    .replace(/\s+/g, "");
}

function formatSpokenAddresses(text) {
  const emailPattern = new RegExp(
    `([\\p{L}\\p{N}]+(?:\\s+(?:punto|guion|guion bajo|subrayado|más|mas)\\s+[\\p{L}\\p{N}]+)*)\\s+arroba\\s+([\\p{L}\\p{N}-]+(?:\\s+[\\p{L}\\p{N}-]+){0,3}(?:\\s+punto\\s+(?:[\\p{L}\\p{N}-]+))+)(?=\\s|$|[,;:!?])`,
    "giu"
  );
  const cuedDomainPattern = new RegExp(
    `\\b((?:visita|abre|entra a|ve a)\\s+)((?:www\\s+punto\\s+)?[\\p{L}\\p{N}-]+(?:\\s+[\\p{L}\\p{N}-]+){1,3}\\s+punto\\s+(?:${TOP_LEVEL_DOMAINS}))(?=\\s|$|[,;:!?])`,
    "giu"
  );
  const domainPattern = new RegExp(
    `\\b((?:www\\s+punto\\s+)?[\\p{L}\\p{N}-]+(?:\\s+punto\\s+[\\p{L}\\p{N}-]+)*\\s+punto\\s+(?:${TOP_LEVEL_DOMAINS}))(?=\\s|$|[,;:!?])`,
    "giu"
  );

  return text
    .replace(emailPattern, (_, local, domain) => `${formatAddressFragment(local)}@${formatAddressFragment(domain)}`)
    .replace(cuedDomainPattern, (_, cue, domain) => `${cue}${formatAddressFragment(domain)}`)
    .replace(domainPattern, (domain) => formatAddressFragment(domain))
    .replace(/\b(?:barra|slash)\s+(?=[\p{L}\p{N}])/giu, "/")
    .replace(/\s*@\s*/g, "@")
    .replace(/\s*\/\s*/g, "/");
}

function applySpokenFormatting(text) {
  return text
    .replace(/\bpunto y aparte\b/giu, ".\n\n")
    .replace(/\b(?:nueva línea|salto de línea)\b/giu, "\n")
    .replace(/\bdos puntos\b/giu, ":")
    .replace(/\bpunto y coma\b/giu, ";")
    .replace(/\bsigno de interrogación\b/giu, "?")
    .replace(/\bsigno de exclamación\b/giu, "!")
    .replace(/\bcoma\b/giu, ",")
    .replace(/\bpunto\b/giu, ".");
}

function normalizeSpacing(text) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,;!?]|:(?!\/))(?=[^\s\n])/g, "$1 ")
    .replace(/,\s*,+/g, ",")
    .replace(/([.!?])\s*[,;:]+/g, "$1")
    .replace(/\s+([)\]])/g, "$1")
    .replace(/([(¿¡])\s+/g, "$1")
    .trim();
}

function removeRepeatedPhrases(text) {
  let result = text;

  for (let size = 4; size >= 1; size -= 1) {
    const words = Array.from({ length: size }, () => "[\\p{L}\\p{N}]+").join("\\s+");
    const repetition = new RegExp(`\\b(${words})(?:[\\s,]+\\1\\b)+`, "giu");
    let previous;
    do {
      previous = result;
      result = result.replace(repetition, "$1");
    } while (result !== previous);
  }

  return result;
}

function removeFillers(text) {
  const filler = "(?:eh+|em+|mmm+|ajá|bueno|pues|o sea|a ver|digamos|básicamente)";
  let result = text;

  result = result.replace(new RegExp(`(^|[.!?]\\s+|\\n)(?:${filler}[,\\s]+)+`, "giu"), "$1");
  result = result.replace(new RegExp(`,\\s*(?:${filler})(?:\\s*,|,?\\s+)`, "giu"), " ");
  return removeRepeatedPhrases(result);
}

function correctCommonSyntax(text) {
  return text
    .replace(/\bde el\b/giu, "del")
    .replace(/\ba el\b/giu, "al")
    .replace(/\bno se\b(?=\s+(?:si|cómo|como|qué|que|cuándo|cuando|dónde|donde)\b)/giu, "no sé")
    .replace(/\bpor que\b(?=\s+(?:quiero|necesito|debemos|tenemos|puedo|puede|es|está|estamos|hay)\b)/giu, "porque");
}

function addDiscourseStructure(text) {
  if (text.length < 180) return text;

  return text.replace(
    /([,;]?)\s+(?=(?:además|sin embargo|por otro lado|finalmente|por último|en resumen|después|a continuación)\b)/giu,
    (separator, punctuation, offset, source) => {
      const previousBreak = Math.max(source.lastIndexOf(".", offset - 1), source.lastIndexOf("\n", offset - 1));
      return offset - previousBreak > 70 ? ".\n\n" : separator;
    }
  );
}

function groupSentencesIntoParagraphs(text) {
  const paragraphs = text.split(/\n{2,}/);
  return paragraphs.map((paragraph) => {
    if (paragraph.length < 360) return paragraph;
    const sentences = paragraph.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g);
    if (!sentences || sentences.length < 4) return paragraph;

    const groups = [];
    for (let index = 0; index < sentences.length; index += 3) {
      groups.push(sentences.slice(index, index + 3).join(" ").replace(/\s+/g, " ").trim());
    }
    return groups.join("\n\n");
  }).join("\n\n");
}

function capitalizeSentences(text) {
  if (/^(?:https?:\/\/|www\.|\S+@\S+)\S*$/i.test(text)) return text;
  return text.replace(
    /(^|[.!?]\s+|\n+)(\p{L})/gu,
    (_, prefix, letter) => prefix + letter.toLocaleUpperCase("es")
  );
}

function ensureTerminalPunctuation(text) {
  if (!text || /[.!?]$/.test(text)) return text;
  if (/^(?:https?:\/\/|www\.|\S+@\S+)\S*$/i.test(text)) return text;
  return `${text}.`;
}

function applyDictionary(text, dictionary) {
  return dictionary.reduce((result, term) => {
    const escaped = escapeRegExp(term);
    return result.replace(new RegExp(`\\b${escaped}\\b`, "giu"), term);
  }, text);
}

function cleanTranscription(text, options = {}) {
  const {
    cleanup = true,
    dictionaryEnabled = true,
    dictionary = [],
    appendSpace = false
  } = options;

  let result = normalizeRawInput(text);
  result = removeSilenceArtifacts(result);
  if (!result) return "";
  result = formatSpokenAddresses(result);
  result = applySpokenFormatting(result);
  result = normalizeSpacing(result);
  if (cleanup) result = removeFillers(result);
  result = correctCommonSyntax(result);
  result = addDiscourseStructure(result);
  result = normalizeSpacing(result);
  result = capitalizeSentences(result);
  result = ensureTerminalPunctuation(result);
  result = groupSentencesIntoParagraphs(result);
  if (dictionaryEnabled) result = applyDictionary(result, dictionary);
  if (appendSpace && result) result += " ";
  return result;
}

module.exports = {
  cleanTranscription,
  formatSpokenAddresses,
  normalizeSpacing,
  removeFillers,
  removeSilenceArtifacts
};
