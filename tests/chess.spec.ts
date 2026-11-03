import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const pageErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /A beautiful game/ })).toBeVisible();
});

test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page), 'The browser must not throw uncaught application errors').toEqual([]);
});

function square(page: Page, name: string) {
  return page.locator(`[data-square="${name}"]`);
}

async function move(page: Page, from: string, to: string) {
  await square(page, from).click();
  await expect(square(page, to)).toHaveClass(/legal-target/);
  await square(page, to).click();
}

async function localGame(page: Page, untimed = true) {
  await page.getByRole('button', { name: 'A friend', exact: true }).click();
  if (untimed) await page.getByRole('button', { name: /∞ Unlimited/ }).click();
  await page.getByRole('button', { name: 'Start a new game', exact: true }).click();
  await expect(page.getByText('OVER THE BOARD', { exact: true })).toBeVisible();
}

async function importFen(page: Page, fen: string) {
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'FEN position', exact: true }).click();
  await dialog.getByRole('textbox').fill(fen);
  await dialog.getByRole('button', { name: 'Load position', exact: true }).click();
  await expect(dialog).toBeHidden();
}

test('loads the real browser Stockfish worker and replies with a legal move', async ({ page }) => {
  await expect(page.locator('.engine-badge')).toContainText('STOCKFISH 17.1', { timeout: 30000 });
  await move(page, 'e2', 'e4');
  await expect(page.getByRole('button', { name: 'Move 1, white e4', exact: true })).toBeVisible();
  const reply = page.getByRole('button', { name: /^Move 1, black / });
  await expect(reply).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.game-status')).toHaveText(/White to move/);
  await expect(page.locator('.error-banner')).toHaveCount(0);
  await expect(square(page, 'e4')).toHaveAttribute('aria-label', 'e4 white pawn');
  await expect(page.getByRole('tabpanel', { name: 'Move history' }).getByRole('button')).toHaveCount(2);
});

test('rejects illegal moves and detects Fool’s mate in local play', async ({ page }) => {
  await localGame(page);
  await square(page, 'e2').click();
  await expect(square(page, 'e4')).toHaveClass(/legal-target/);
  await square(page, 'e5').click();
  await expect(square(page, 'e2')).toHaveAttribute('aria-label', 'e2 white pawn');
  await expect(page.getByRole('tabpanel', { name: 'Move history' }).getByRole('button')).toHaveCount(0);
  await move(page, 'f2', 'f3');
  await move(page, 'e7', 'e5');
  await move(page, 'g2', 'g4');
  await move(page, 'd8', 'h4');
  await expect(page.getByRole('heading', { name: 'Black wins', exact: true })).toBeVisible();
  await expect(page.getByText('A decisive finish. Checkmate.', { exact: true })).toBeVisible();
  await expect(square(page, 'e1')).toHaveClass(/in-check/);
  await expect(square(page, 'e1')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Move 2, black Qh4#', exact: true })).toBeVisible();
});

test('imports a FEN and allows a knight underpromotion', async ({ page }) => {
  await importFen(page, '7k/P7/8/8/8/8/6p1/4K3 w - - 0 1');
  await move(page, 'a7', 'a8');
  const dialog = page.getByRole('dialog', { name: 'Choose your promotion' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Promote to knight', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(square(page, 'a8')).toHaveAttribute('aria-label', 'a8 white knight');
  await expect(page.getByRole('button', { name: 'Move 1, white a8=N', exact: true })).toBeVisible();
});

test('castles on both sides and moves the rook with the king', async ({ page }) => {
  await importFen(page, 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  await move(page, 'e1', 'g1');
  await expect(square(page, 'g1')).toHaveAttribute('aria-label', 'g1 white king');
  await expect(square(page, 'f1')).toHaveAttribute('aria-label', 'f1 white rook');
  await expect(square(page, 'h1')).toHaveAttribute('aria-label', 'h1 empty');
  await move(page, 'e8', 'c8');
  await expect(square(page, 'c8')).toHaveAttribute('aria-label', 'c8 black king');
  await expect(square(page, 'd8')).toHaveAttribute('aria-label', 'd8 black rook');
  await expect(page.getByRole('button', { name: 'Move 1, black O-O-O', exact: true })).toBeVisible();
});

test('captures en passant and removes the bypassed pawn', async ({ page }) => {
  await importFen(page, '7k/8/8/3pP3/8/8/8/4K3 w - d6 0 2');
  await move(page, 'e5', 'd6');
  await expect(square(page, 'd6')).toHaveAttribute('aria-label', 'd6 white pawn');
  await expect(square(page, 'd5')).toHaveAttribute('aria-label', 'd5 empty');
  await expect(square(page, 'e5')).toHaveAttribute('aria-label', 'e5 empty');
  await expect(page.getByRole('button', { name: /white exd6$/ })).toBeVisible();
});

test('reviews earlier positions, returns to the game, flips the board, and exports PGN', async ({ page }) => {
  await localGame(page);
  await move(page, 'e2', 'e4');
  await move(page, 'e7', 'e5');
  await move(page, 'g1', 'f3');
  await page.getByRole('button', { name: 'First position', exact: true }).click();
  await expect(square(page, 'e2')).toHaveAttribute('aria-label', 'e2 white pawn');
  await expect(square(page, 'e4')).toHaveAttribute('aria-label', 'e4 empty');
  await expect(square(page, 'e2')).toBeDisabled();
  await page.getByRole('button', { name: 'Next move', exact: true }).click();
  await expect(square(page, 'e4')).toHaveAttribute('aria-label', 'e4 white pawn');
  await page.getByRole('button', { name: 'Latest position', exact: true }).click();
  await expect(square(page, 'f3')).toHaveAttribute('aria-label', 'f3 white knight');
  await expect(square(page, 'd7')).toBeEnabled();
  await page.getByRole('button', { name: 'Flip board', exact: true }).click();
  await expect(page.locator('.chessboard .square').first()).toHaveAttribute('data-square', 'h1');
  const downloadPending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PGN', exact: true }).click();
  const download = await downloadPending;
  expect(download.suggestedFilename()).toBe('thakur-chess-game.pgn');
  const path = await download.path();
  expect(path).not.toBeNull();
  expect(await readFile(path!, 'utf8')).toContain('1. e4 e5 2. Nf3');
});

test('copies the current FEN and rejects invalid imports without replacing the board', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await localGame(page);
  await move(page, 'e2', 'e4');
  await page.getByRole('button', { name: 'Copy FEN', exact: true }).click();
  const fen = await page.evaluate(() => navigator.clipboard.readText());
  expect(fen).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'FEN position', exact: true }).click();
  await dialog.getByRole('textbox').fill('this is not a FEN');
  await dialog.getByRole('button', { name: 'Load position', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText(/Invalid FEN/);
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(square(page, 'e4')).toHaveAttribute('aria-label', 'e4 white pawn');
});

test('restores the game after reload with paused clocks until explicitly resumed', async ({ page }) => {
  await localGame(page, false);
  await move(page, 'e2', 'e4');
  await move(page, 'e7', 'e5');
  await expect.poll(async () => {
    const snapshot = await page.evaluate(() => JSON.parse(localStorage.getItem('thakur-chess-club:v1') || 'null'));
    return snapshot?.pgn;
  }).toContain('1. e4 e5');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Resume game' })).toBeVisible();
  await expect(square(page, 'e4')).toHaveAttribute('aria-label', 'e4 white pawn');
  await expect(square(page, 'e5')).toHaveAttribute('aria-label', 'e5 black pawn');
  await expect(square(page, 'g1')).toBeDisabled();
  const before = await page.getByLabel('White clock', { exact: true }).textContent();
  await page.waitForTimeout(1200);
  expect(await page.getByLabel('White clock', { exact: true }).textContent()).toBe(before);
  await page.getByRole('button', { name: 'Resume game' }).click();
  await expect(square(page, 'g1')).toBeEnabled();
  await expect(page.getByLabel('White clock', { exact: true })).not.toHaveText(before!);
  await move(page, 'g1', 'f3');
  await expect(square(page, 'f3')).toHaveAttribute('aria-label', 'f3 white knight');
});

test('fits a narrow mobile viewport and keeps board controls usable', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await localGame(page);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await move(page, 'e2', 'e4');
  await expect(square(page, 'e4')).toHaveAttribute('aria-label', 'e4 white pawn');
  const board = await page.locator('.chessboard').boundingBox();
  expect(board).not.toBeNull();
  expect(board!.x).toBeGreaterThanOrEqual(0);
  expect(board!.x + board!.width).toBeLessThanOrEqual(375);
  await page.getByRole('button', { name: 'Flip board', exact: true }).click();
  await expect(page.locator('.chessboard .square').first()).toHaveAttribute('data-square', 'h1');
});

test('preserves imported black-to-move fullmove numbers in status and notation', async ({ page }) => {
  await importFen(page, '4k3/8/8/3pp3/3P1N2/8/8/4K3 b - - 0 23');
  await expect(page.locator('.game-status')).toHaveText('Black to move. Make it count.');
  await move(page, 'e5', 'd4');
  await expect(page.getByRole('button', { name: 'Move 23, black exd4', exact: true })).toBeVisible();
  await move(page, 'f4', 'd5');
  await expect(page.getByRole('button', { name: 'Move 24, white Nxd5', exact: true })).toBeVisible();
  const rows = page.locator('.move-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).locator('.move-number')).toHaveText('23.');
  await expect(rows.nth(1).locator('.move-number')).toHaveText('24.');
  await page.getByRole('button', { name: 'First position', exact: true }).click();
  await expect(square(page, 'e5')).toHaveAttribute('aria-label', 'e5 black pawn');
  await page.getByRole('button', { name: 'Next move', exact: true }).click();
  await expect(page.locator('.game-status')).toHaveText('Reviewing move 23');
});

test('continues an imported concluded PGN as a fresh analysis game with an open result', async ({ page }) => {
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'PGN game', exact: true }).click();
  await dialog.getByRole('textbox').fill('1. e4 e5 1-0');
  await dialog.getByRole('button', { name: 'Load game', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(square(page, 'g1')).toBeEnabled();
  await move(page, 'g1', 'f3');
  const downloadPending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PGN', exact: true }).click();
  const download = await downloadPending;
  const path = await download.path();
  const pgn = await readFile(path!, 'utf8');
  expect(pgn).toContain('[Result "*"]');
  expect(pgn).toContain('1. e4 e5 2. Nf3 *');
  expect(pgn).not.toContain('1-0');
});

test('uses actual engine analysis for hints and cleanly cancels analysis on takeback', async ({ page }) => {
  await localGame(page);
  await move(page, 'e2', 'e4');
  await move(page, 'e7', 'e5');
  await page.getByRole('button', { name: 'Hint', exact: true }).click();
  await expect(page.locator('.analysis-depth')).toHaveText(/^Depth [1-9]\d*$/, { timeout: 30000 });
  await expect(page.locator('.principal-variation p')).toHaveText(/\S/);
  await expect(page.locator('.status-banner')).toContainText(/Consider [a-h][1-8] → [a-h][1-8]/, { timeout: 30000 });
  await expect(page.locator('.chessboard .square.selected')).toHaveCount(1);
  await expect(page.locator('.chessboard .legal-target').first()).toBeVisible();
  await page.getByRole('button', { name: 'Take back', exact: true }).click();
  await expect(page.locator('.chessboard .square.selected')).toHaveCount(0);
  await expect(page.locator('.analysis-score')).toHaveText('—');
  await expect(page.locator('.principal-variation')).toHaveCount(0);
  await page.getByRole('button', { name: 'Analyze position', exact: true }).click();
  await expect(page.locator('.game-status')).toHaveText('Analyzing position…');
  await page.getByRole('button', { name: 'Take back', exact: true }).click();
  await expect(square(page, 'e2')).toHaveAttribute('aria-label', 'e2 white pawn');
  await expect(square(page, 'e7')).toHaveAttribute('aria-label', 'e7 black pawn');
  await page.waitForTimeout(2200);
  await expect(page.locator('.analysis-score')).toHaveText('—');
  await expect(page.locator('.principal-variation')).toHaveCount(0);
  await expect(page.locator('.chessboard .square.selected')).toHaveCount(0);
  await expect(page.locator('.error-banner')).toHaveCount(0);
});

test('starting a local game while the computer thinks prevents stale engine replies', async ({ page }) => {
  // A longer engine search leaves time to exercise cancellation through the UI.
  await page.getByLabel('ENGINE STRENGTH', { exact: true }).focus();
  await page.getByLabel('ENGINE STRENGTH', { exact: true }).press('End');
  await page.getByRole('button', { name: 'Start a new game', exact: true }).click();
  await expect(page.locator('.engine-badge')).toContainText('STOCKFISH 17.1', { timeout: 30000 });
  await move(page, 'e2', 'e4');
  await expect(page.locator('.game-status')).toHaveText('Stockfish is thinking…');
  await page.getByRole('button', { name: 'Start a new game', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'A friend', exact: true }).click();
  await dialog.getByRole('button', { name: 'New game', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('OVER THE BOARD', { exact: true })).toBeVisible();
  await move(page, 'd2', 'd4');
  await page.waitForTimeout(2500);
  await expect(page.getByRole('tabpanel', { name: 'Move history' }).getByRole('button')).toHaveCount(1);
  await expect(square(page, 'd4')).toHaveAttribute('aria-label', 'd4 white pawn');
  await expect(square(page, 'e7')).toHaveAttribute('aria-label', 'e7 black pawn');
  await expect(page.locator('.game-status')).toHaveText('Black to move');
  await expect(page.locator('.error-banner')).toHaveCount(0);
});
