// Example: a lending library moves from a legacy PHP application to a rebuild.
// The test results in test-results/ are fixtures (fixtures/make-results.mjs),
// so the report builds without a running system.
export default {
  title: 'Library rebuild – validation report',
  language: 'en',
  timeZone: 'Europe/Berlin',
  paths: { sourceFiles: '.' },
  // Two variants share one domain model: the city library and the campus library
  domain: {
    variants: [{ id: 'city', title: 'City library' }, { id: 'campus', title: 'Campus library' }],
  },
  numbering: { flowDeviation: 'D-F-', ruleDeviation: 'D-R-' },
  texts: {
    intro: 'The rebuild keeps the behaviour of the legacy system unless it is obviously wrong. Where an acceptance criterion asks for more, the change is proposed to the client instead of being built right away.',
    behaviourIntro: 'Principle: the rebuild behaves like the legacy system. Fixes are listed for information; changes beyond that are proposals.',
  },
};
