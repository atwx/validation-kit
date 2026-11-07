// Configuration of @atwx/validation-kit; all keys are optional, see the
// defaults in node_modules/@atwx/validation-kit/src/config.mjs.
export default {
  title: 'Testbericht',
  language: 'de',
  timeZone: 'Europe/Berlin',
  paths: {
    // `file` entries in sources/sources.yml are relative to this directory
    sourceFiles: '..',
  },
  risks: ['hoch', 'mittel', 'niedrig'],
  // Pattern of a requirement id (also found in test names, e.g. "[AB-001]")
  idPattern: '[A-Z]{2,5}-\\d{3}',
  behaviour: {
    sections: {
      assessment: 'Einordnung', implementation: 'Umsetzung', question: 'Frage', background: 'Hintergrund',
      interim: 'Bis zur Klärung', decision: 'Interne Entscheidung', answer: 'Antwort',
    },
  },
  texts: {
    intro: '',
  },
};
