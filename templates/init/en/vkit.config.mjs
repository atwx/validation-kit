// Configuration of @atwx/validation-kit; all keys are optional, see the
// defaults in node_modules/@atwx/validation-kit/src/config.mjs.
export default {
  title: 'Validation report',
  language: 'en',
  timeZone: 'Europe/Berlin',
  paths: {
    // `file` entries in sources/sources.yml are relative to this directory
    sourceFiles: '..',
  },
  risks: ['high', 'medium', 'low'],
  // Pattern of a requirement id (also found in test names, e.g. "[AB-001]")
  idPattern: '[A-Z]{2,5}-\\d{3}',
  texts: {
    intro: '',
  },
};
