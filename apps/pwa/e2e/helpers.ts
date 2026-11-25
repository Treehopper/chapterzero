import { expect, type Locator, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

export const FIXTURE_EPUB = fileURLToPath(new URL('../../../fixtures/epub/omnibus-fixture.epub', import.meta.url));
export const realEpub = (name: string) => fileURLToPath(new URL(`../../../fixtures/epub/downloaded/${name}`, import.meta.url));

/** Tap like a finger (WebKit's headless mouse input is unreliable, touch is not). */
export const tap = (l: Locator) => l.tap();

/**
 * A finger drag as touch Pointer Events (what iOS Safari sends), with real timing so the
 * recogniser sees a realistic velocity. `ms` is the total duration.
 */
export async function swipe(page: Page, dx: number, dy: number, opts: { steps?: number; ms?: number; from?: { x: number; y: number } } = {}) {
  const vp = page.viewportSize()!;
  const from = opts.from ?? { x: vp.width / 2, y: vp.height / 2 };
  const steps = opts.steps ?? 10;
  const ms = opts.ms ?? 200;
  await page.evaluate(async ({ from, dx, dy, steps, ms }) => {
    // hit-test every event like a real touch (cards are re-mounted while a finger is down)
    const fire = (type: string, x: number, y: number) =>
      (document.elementFromPoint(x, y) ?? document.body).dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId: 7, pointerType: 'touch',
        isPrimary: true, clientX: x, clientY: y, button: type === 'pointermove' ? -1 : 0, buttons: type === 'pointerup' ? 0 : 1 }));
    const wait = (t: number) => new Promise((r) => setTimeout(r, t));
    fire('pointerdown', from.x, from.y);
    for (let i = 1; i <= steps; i++) {
      await wait(ms / steps);
      fire('pointermove', from.x + (dx * i) / steps, from.y + (dy * i) / steps);
    }
    fire('pointerup', from.x + dx, from.y + dy);
  }, { from, dx, dy, steps, ms });
}

export const swipeRight = (page: Page) => swipe(page, 220, 0);
export const swipeLeft = (page: Page) => swipe(page, -220, 0);
export const swipeDown = (page: Page) => swipe(page, 0, 160);
export const swipeUp = (page: Page) => swipe(page, 0, -160);

export async function tapCard(page: Page) {
  const vp = page.viewportSize()!;
  await page.touchscreen.tap(vp.width / 2, vp.height / 2);
}

/** First run with the miniature test pack: install guide → download → check intro → (level 5 by hand | the check) → library. */
export async function firstRun(page: Page, opts: { check?: 'skip' | 'none' } = { check: 'skip' }) {
  await page.goto('/?packs=test');
  await tap(page.getByRole('button', { name: 'Continue in the browser' }));
  await tap(page.getByTestId('download-start'));
  await expect(page.getByTestId('check-intro')).toBeVisible();
  if (opts.check === 'none') return void (await tap(page.getByTestId('check-start')));
  await tap(page.getByTestId('check-own-level'));
  await tap(page.getByTestId('level-use'));
  await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
}

export async function importBook(page: Page, file = FIXTURE_EPUB) {
  await page.getByTestId('file-input').setInputFiles(file);
  await expect(page.getByTestId('preview-title')).toBeVisible({ timeout: 90_000 });
}

/** Import the fixture omnibus with the default selection and open it. */
export async function importAndOpen(page: Page) {
  await importBook(page);
  await tap(page.getByTestId('create-cards'));
  await expect(page.getByTestId('book-coverage')).toBeVisible();
}

/** Get ready: continues an open session, or takes Quick start from the start sheet (C19). */
export async function studyNow(page: Page, button = 'study-now') {
  await tap(page.getByTestId(button));
  const quick = page.getByTestId('quick-start');
  await expect(quick.or(page.getByTestId('study-stage')).or(page.getByTestId('nothing-due')).first()).toBeVisible();
  if (await quick.isVisible()) await tap(quick);
}

export async function startStudy(page: Page) {
  await studyNow(page);
  await expect(page.getByTestId('card-word')).toBeVisible();
}

const stage = (page: Page) => page.getByTestId('study-stage');
/** the current card's word, once no action is in flight */
export async function cardWord(page: Page): Promise<string> {
  await expect(stage(page)).toHaveAttribute('data-busy', 'false');
  return (await stage(page).getAttribute('data-word')) ?? '';
}
export const expectCard = (page: Page, word: string, phase?: 'front' | 'back' | 'wrongReview') =>
  Promise.all([
    expect(stage(page)).toHaveAttribute('data-word', word),
    phase ? expect(stage(page)).toHaveAttribute('data-phase', phase) : undefined,
  ]);
export const expectPhase = (page: Page, phase: 'front' | 'back' | 'wrongReview') => expect(stage(page)).toHaveAttribute('data-phase', phase);
/** wait until no study action is in flight */
export const settled = (page: Page) => expect(stage(page)).toHaveAttribute('data-busy', 'false');

/** end the session from the swipe-up panel (C12) */
export async function endSession(page: Page) {
  await page.getByTestId('grab').tap();
  await page.getByTestId('finish').tap();
}
