import type { Browser, Locator, Page, TestInfo, TestType } from '@playwright/test';

export interface FlowMeta {
  /** Flow number or key, e.g. "1" or "invoice-run" (`process` is accepted as alias) */
  id?: string;
  process?: string;
  title: string;
  /** Short description of the flow under test */
  purpose: string;
  /** Roles acting in the flow */
  roles: string[];
  precondition?: string;
  reqs: string[];
}

export interface FlowStepSpec {
  title: string;
  /** What the tester does */
  procedure: string;
  /** Expected result = acceptance criterion */
  expected: string;
  reqs: string[];
  /**
   * Known defect of a system: the step is expected to miss its acceptance
   * criterion there. It is reported as a deviation but does not fail the run.
   */
  knownDefect?: { system: string; note: string };
}

export interface CheckRecord { label: string; ok: boolean; error?: string }
export interface AttachmentRecord { name: string; caption: string; file: string }

export interface FlowStepRecord extends FlowStepSpec {
  nr: string;
  actual: string;
  fulfilled: boolean;
  knownDefectApplied: boolean;
  checks: CheckRecord[];
  attachments: AttachmentRecord[];
  error?: string;
  startedAt: string;
  durationMs: number;
}

export interface FlowRecord extends FlowMeta {
  id: string;
  system?: string;
  specFile?: string;
  steps: FlowStepRecord[];
}

export declare class FlowStep {
  readonly record: FlowStepRecord;
  /** Runs one assertion of the acceptance criterion and records its outcome. */
  check(label: string, fn: () => Promise<unknown>): Promise<void>;
  /** Adds a sentence to the actual result. */
  observe(text: string): void;
  /** Screenshot as attachment, with the given elements framed in red. */
  evidence(caption: string, ...highlight: Locator[]): Promise<void>;
  /** Screenshot cropped to `area`. */
  evidenceIn(area: Locator, caption: string, ...highlight: Locator[]): Promise<void>;
  /** Same as evidence(), for another page. */
  evidenceOf(page: Page, caption: string, ...highlight: Locator[]): Promise<void>;
  readonly observations: string[];
}

export declare class Flow {
  readonly page: Page;
  readonly info: TestInfo;
  readonly meta: FlowMeta & { id: string };
  readonly steps: FlowStepRecord[];
  step(nr: string, spec: FlowStepSpec, fn: (s: FlowStep) => Promise<void>): Promise<void>;
}

export interface FlowTestOptions {
  /** The `test` function of @playwright/test */
  test: TestType<any, any>;
  language?: 'en' | 'de';
  labels?: Record<string, unknown>;
  /** Name of the system under test, compared with knownDefect.system */
  system?: string;
  /** Prefix of the Playwright test title, e.g. "Prozess" */
  flowLabel?: string;
  /** Name of the JSON attachment (default flow.json) */
  attachmentName?: string;
  /** Requests to abort, e.g. absolute links to the production host */
  blockUrls?: (string | RegExp)[];
  /** Directory the spec path in the report is relative to (default: cwd) */
  specRoot?: string;
}

export type FlowBody = (args: { page: Page; flow: Flow; browser: Browser }) => Promise<void>;

export declare function createFlowTest(options: FlowTestOptions): {
  flowTest: (meta: FlowMeta, body: FlowBody) => void;
  options: Record<string, unknown>;
};

export declare function retryNetworkChanges(page: Page): void;
