import { expect } from '@playwright/test';
import { flowTest } from './flow';

flowTest({
  id: '1',
  title: 'Log in',
  purpose: 'A user logs in and sees the start page.',
  roles: ['User'],
  reqs: ['EX-001'],
}, async ({ page, flow }) => {
  await flow.step('1.1', {
    title: 'Open the login page',
    procedure: 'Open /login.',
    expected: 'The login form is shown.',
    reqs: ['EX-001'],
  }, async (s) => {
    await page.goto('/login');
    await s.check('Login form visible', () => expect(page.getByRole('button', { name: /log in/i })).toBeVisible());
    await s.evidence('Login form', page.getByRole('button', { name: /log in/i }));
  });
});
