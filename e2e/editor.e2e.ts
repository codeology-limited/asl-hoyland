import { test, expect, Page, Locator } from '@playwright/test';

// ── Helpers ───────────────────────────────────────────────────────────────

const nameInput = (page: Page) => page.getByPlaceholder('Enter or choose a program name');
// Scope to the editor's switch — the page also has Ultrasound + Test-mode checkboxes.
// The checkbox itself is visually hidden, so toggle it via the visible label.
const rangeSwitch = (page: Page) => page.locator('.pe-switch input[type="checkbox"]');
const toggleRange = (page: Page) => page.locator('label.pe-switch').click();
const ultrasoundCheckbox = (page: Page) => page.getByRole('checkbox', { name: /Ultrasound device connected/i });
const saveButton = (page: Page) => page.getByRole('button', { name: 'Save program' });
const addButton = (page: Page) => page.getByRole('button', { name: 'Add frequency' });
const rows = (page: Page) => page.locator('.pe-grid__row');
const row = (page: Page, i: number) => rows(page).nth(i);
const freqInput = (page: Page, i: number) => row(page, i).locator('input.pe-c-freq');
const timeInput = (page: Page, i: number) => row(page, i).locator('input.pe-c-time');
const waveBtn = (page: Page, i: number, wave: 'Sine' | 'Square') =>
  row(page, i).getByRole('button', { name: wave, exact: true });

// Dialog capture: the app uses alert() for save-success and validation messages.
function trackDialogs(page: Page) {
  const state = { last: '' as string, all: [] as string[] };
  page.on('dialog', async (d) => {
    state.last = d.message();
    state.all.push(d.message());
    await d.accept();
  });
  return state;
}

async function gotoEditor(page: Page) {
  await page.goto('/editor');
  await expect(nameInput(page)).toBeVisible();
  await expect(row(page, 0)).toBeVisible();
}

async function setRow(page: Page, i: number, freq: string, minutes?: string, wave?: 'Sine' | 'Square') {
  await freqInput(page, i).fill(freq);
  if (minutes !== undefined) await timeInput(page, i).fill(minutes);
  if (wave) await waveBtn(page, i, wave).click();
}

// Reorder via the drag handle (native HTML5 DnD, driven with real mouse moves).
async function dragRow(page: Page, fromIdx: number, toIdx: number) {
  const handle = row(page, fromIdx).locator('.pe-c-handle');
  const target = row(page, toIdx);
  const h = await handle.boundingBox();
  const t = await target.boundingBox();
  if (!h || !t) throw new Error('missing bounding boxes for drag');
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2 - 6);
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 14 });
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2 + 3, { steps: 4 });
  await page.mouse.up();
}

// Wait until the saved program is in the datalist (i.e. customPrograms reloaded
// after a remount/reload), then type its name to load it into the form.
async function loadProgram(page: Page, name: string) {
  await expect(page.locator(`#pe-programs option[value="${name}"]`)).toHaveCount(1);
  await nameInput(page).fill(name);
}

async function saveAndExpectSuccess(page: Page, dlg: { last: string }) {
  dlg.last = '';
  await saveButton(page).click();
  await expect.poll(() => dlg.last, { timeout: 10_000 }).toContain('saved successfully');
}

// ── Tests ─────────────────────────────────────────────────────────────────

test.describe('Program editor — create / edit / save / reload', () => {
  test('create a 3-frequency program with mixed waveforms, save, reload, verify', async ({ page }) => {
    const dlg = trackDialogs(page);
    await gotoEditor(page);

    await nameInput(page).fill('Alpha Mix');
    await setRow(page, 0, '528', '3');               // default Sine
    await addButton(page).click();
    await setRow(page, 1, '741', '5', 'Square');
    await addButton(page).click();
    await setRow(page, 2, '852.5', '2', 'Sine');
    await expect(rows(page)).toHaveCount(3);

    await saveAndExpectSuccess(page, dlg);

    // Full page reload → IndexedDB must persist; then load it back by name.
    await page.reload();
    await expect(nameInput(page)).toBeVisible();
    await loadProgram(page, 'Alpha Mix');

    await expect(rows(page)).toHaveCount(3);
    await expect(freqInput(page, 0)).toHaveValue('528');
    await expect(timeInput(page, 0)).toHaveValue('3');
    await expect(waveBtn(page, 0, 'Sine')).toHaveAttribute('aria-pressed', 'true');

    await expect(freqInput(page, 1)).toHaveValue('741');
    await expect(timeInput(page, 1)).toHaveValue('5');
    await expect(waveBtn(page, 1, 'Square')).toHaveAttribute('aria-pressed', 'true');

    await expect(freqInput(page, 2)).toHaveValue('852.5');
    await expect(timeInput(page, 2)).toHaveValue('2');
    await expect(waveBtn(page, 2, 'Sine')).toHaveAttribute('aria-pressed', 'true');
  });

  test('edit an existing program (frequency, minutes, waveform) and persist the changes', async ({ page }) => {
    const dlg = trackDialogs(page);
    await gotoEditor(page);

    await nameInput(page).fill('Editable');
    await setRow(page, 0, '528', '3');
    await saveAndExpectSuccess(page, dlg);

    await page.reload();
    await expect(nameInput(page)).toBeVisible();
    await loadProgram(page, 'Editable');
    await expect(freqInput(page, 0)).toHaveValue('528');

    // Mutate and re-save under the same name (upsert).
    await freqInput(page, 0).fill('999');
    await timeInput(page, 0).fill('7');
    await waveBtn(page, 0, 'Square').click();
    await saveAndExpectSuccess(page, dlg);

    await page.reload();
    await expect(nameInput(page)).toBeVisible();
    await loadProgram(page, 'Editable');
    await expect(freqInput(page, 0)).toHaveValue('999');
    await expect(timeInput(page, 0)).toHaveValue('7');
    await expect(waveBtn(page, 0, 'Square')).toHaveAttribute('aria-pressed', 'true');
    await expect(rows(page)).toHaveCount(1);
  });

  test('ranged program: toggle, fill start/end, save, reload, verify range mode restores', async ({ page }) => {
    const dlg = trackDialogs(page);
    await gotoEditor(page);

    await toggleRange(page);
    await expect(rangeSwitch(page)).toBeChecked();
    await expect(rows(page)).toHaveCount(2);

    await nameInput(page).fill('Sweep One');
    await freqInput(page, 0).fill('100');     // start
    await timeInput(page, 0).fill('10');      // total run time (only on first row)
    await freqInput(page, 1).fill('2000');    // end
    // Second row's time input is hidden in range mode.
    await expect(timeInput(page, 1)).toHaveCount(0);

    await saveAndExpectSuccess(page, dlg);

    await page.reload();
    await expect(nameInput(page)).toBeVisible();
    await loadProgram(page, 'Sweep One');

    await expect(rangeSwitch(page)).toBeChecked();
    await expect(rows(page)).toHaveCount(2);
    await expect(freqInput(page, 0)).toHaveValue('100');
    await expect(timeInput(page, 0)).toHaveValue('10');
    await expect(freqInput(page, 1)).toHaveValue('2000');
  });

  test('add and remove frequency rows (delete the middle one)', async ({ page }) => {
    await gotoEditor(page);
    await nameInput(page).fill('Row Ops');

    await setRow(page, 0, '111');
    await addButton(page).click();
    await setRow(page, 1, '222');
    await addButton(page).click();
    await setRow(page, 2, '333');
    await expect(rows(page)).toHaveCount(3);

    // Delete the middle row (index 1 has a Remove button; the last row has the +).
    await row(page, 1).getByRole('button', { name: /Remove frequency/ }).click();
    await expect(rows(page)).toHaveCount(2);
    await expect(freqInput(page, 0)).toHaveValue('111');
    await expect(freqInput(page, 1)).toHaveValue('333');
  });

  test('reorder rows by dragging the handle, then persist the new order', async ({ page }) => {
    const dlg = trackDialogs(page);
    await gotoEditor(page);
    await nameInput(page).fill('Reorder Me');

    await setRow(page, 0, '11', '1');
    await addButton(page).click();
    await setRow(page, 1, '22', '2');
    await addButton(page).click();
    await setRow(page, 2, '33', '3');
    await expect(rows(page)).toHaveCount(3);

    // Drag the 3rd row (33) up to the 1st position.
    await dragRow(page, 2, 0);
    await expect(freqInput(page, 0)).toHaveValue('33');
    await expect(freqInput(page, 1)).toHaveValue('11');
    await expect(freqInput(page, 2)).toHaveValue('22');

    await saveAndExpectSuccess(page, dlg);
    await page.reload();
    await expect(nameInput(page)).toBeVisible();
    await loadProgram(page, 'Reorder Me');
    await expect(freqInput(page, 0)).toHaveValue('33');
    await expect(freqInput(page, 1)).toHaveValue('11');
    await expect(freqInput(page, 2)).toHaveValue('22');
  });

  test('validation: blocks save with no name and with no frequency', async ({ page }) => {
    const dlg = trackDialogs(page);
    await gotoEditor(page);

    // No name at all.
    dlg.last = '';
    await saveButton(page).click();
    await expect.poll(() => dlg.last).toContain('enter a program name');

    // Name present but no frequency.
    await nameInput(page).fill('Nameless Freqs');
    dlg.last = '';
    await saveButton(page).click();
    await expect.poll(() => dlg.last).toContain('enter at least one frequency');
  });

  test('saved program shows up in the Custom tab dropdown', async ({ page }) => {
    const dlg = trackDialogs(page);
    await gotoEditor(page);
    await nameInput(page).fill('Custom Visible');
    await setRow(page, 0, '440', '4');
    await saveAndExpectSuccess(page, dlg);

    // The Custom list is ultrasound-filtered (default ON shows only ultra programs),
    // so untick "Ultrasound device connected" to see ordinary custom programs.
    await ultrasoundCheckbox(page).uncheck();

    // Navigate to the Custom tab; its dropdown should include the saved program.
    await page.getByRole('link', { name: 'Custom' }).click();
    const select = page.getByRole('combobox');
    await expect(select.locator('option', { hasText: 'Custom Visible' })).toHaveCount(1);
  });

  test('decimal frequencies and minutes round-trip exactly', async ({ page }) => {
    const dlg = trackDialogs(page);
    await gotoEditor(page);
    await nameInput(page).fill('Decimals');
    await setRow(page, 0, '1873.5', '0.5', 'Square');
    await saveAndExpectSuccess(page, dlg);

    await page.reload();
    await expect(nameInput(page)).toBeVisible();
    await loadProgram(page, 'Decimals');
    await expect(freqInput(page, 0)).toHaveValue('1873.5');
    await expect(timeInput(page, 0)).toHaveValue('0.5');
    await expect(waveBtn(page, 0, 'Square')).toHaveAttribute('aria-pressed', 'true');
  });
});
