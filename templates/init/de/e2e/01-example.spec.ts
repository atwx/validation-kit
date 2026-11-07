import { expect } from '@playwright/test';
import { flowTest } from './flow';

flowTest({
  id: '1',
  title: 'Anmelden',
  purpose: 'Eine Benutzerin meldet sich an und sieht die Startseite.',
  roles: ['Benutzer'],
  reqs: ['EX-001'],
}, async ({ page, flow }) => {
  await flow.step('1.1', {
    title: 'Anmeldeseite öffnen',
    procedure: '/login öffnen.',
    expected: 'Das Anmeldeformular wird angezeigt.',
    reqs: ['EX-001'],
  }, async (s) => {
    await page.goto('/login');
    await s.check('Anmeldeformular sichtbar', () => expect(page.getByRole('button', { name: /anmelden/i })).toBeVisible());
    await s.evidence('Anmeldeformular', page.getByRole('button', { name: /anmelden/i }));
  });
});
