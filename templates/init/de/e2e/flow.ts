import { test } from '@playwright/test';
import { createFlowTest } from '@atwx/validation-kit/playwright';

// SYSTEM names the system under test ("legacy", "rebuild"); a step with
// knownDefect for that system is reported as deviation without failing the run.
export const SYSTEM = process.env.SYSTEM ?? 'rebuild';

export const { flowTest } = createFlowTest({ test, language: 'de', system: SYSTEM });
