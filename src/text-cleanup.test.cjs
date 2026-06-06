const assert = require("node:assert/strict");
const { cleanTranscription } = require("./text-cleanup.cjs");

const cleanupCases = [
  ["eh bueno necesito necesito enviar esto", "Necesito enviar esto."],
  ["bueno, o sea, tenemos tenemos que revisar la propuesta", "Tenemos que revisar la propuesta."],
  ["a ver, básicamente necesitamos revisar revisar el documento", "Necesitamos revisar el documento."],
  ["vamos a el evento de el martes", "Vamos al evento del martes."],
  ["no se si debemos avanzar", "No sé si debemos avanzar."],
  ["hola     equipo   necesitamos   avanzar", "Hola equipo necesitamos avanzar."],
  ["hola coma equipo punto y aparte nos vemos mañana", "Hola, equipo.\n\nNos vemos mañana."],
  ["hola punto nos vemos mañana", "Hola. Nos vemos mañana."],
  ["hola. . . . nos vemos mañana", "Hola. Nos vemos mañana."],
  ["...", ""],
  [". . .", ""],
  ["   ", ""],
  ["[Música]", ""],
  ["(Aplausos)", ""],
  ["gracias por ver el video", ""],
  ["y", ""],
  ["la.", ""],
  ["sí", "Sí."],
  ["quiero agregar música al video", "Quiero agregar música al video."]
];

const addressCases = [
  ["escribe a soporte arroba nextstepai punto com", "Escribe a soporte@nextstepai.com."],
  ["mi correo es felipe punto avinzano arroba gmail punto com", "Mi correo es felipe.avinzano@gmail.com."],
  ["contacta ventas guion latam arroba nextstep punto ai", "Contacta ventas-latam@nextstep.ai."],
  ["escribe a soporte arroba next step ai punto com", "Escribe a soporte@nextstepai.com."],
  ["visita nextstepai punto com", "Visita nextstepai.com."],
  ["visita next step ai punto com", "Visita nextstepai.com."],
  ["visita www punto nextstepai punto com", "Visita www.nextstepai.com."],
  ["abre nextstepai punto com slash contacto", "Abre nextstepai.com/contacto."],
  ["soporte@nextstepai.com", "soporte@nextstepai.com"],
  ["https://nextstepai.com/contacto", "https://nextstepai.com/contacto"]
];

const structureInput = [
  "necesitamos revisar el proyecto porque el cliente solicitó cambios importantes en la propuesta,",
  "además debemos actualizar el presupuesto y confirmar las fechas con el equipo",
  "por último enviaremos la versión final mañana"
].join(" ");

const structureExpected = [
  "Necesitamos revisar el proyecto porque el cliente solicitó cambios importantes en la propuesta.",
  "",
  "Además debemos actualizar el presupuesto y confirmar las fechas con el equipo.",
  "",
  "Por último enviaremos la versión final mañana."
].join("\n");

for (const [input, expected] of [...cleanupCases, ...addressCases]) {
  assert.equal(cleanTranscription(input), expected, input);
}

assert.equal(cleanTranscription(structureInput), structureExpected, "estructura discursiva");
assert.equal(
  cleanTranscription("hablamos de nextstepai", { dictionary: ["NextStepAI"] }),
  "Hablamos de NextStepAI."
);
assert.equal(cleanTranscription("eh bueno hola", { cleanup: false }), "Eh bueno hola.");
assert.equal(cleanTranscription("hola", { appendSpace: true }), "Hola. ");

console.log(`${cleanupCases.length + addressCases.length + 4} text pipeline cases passed`);
