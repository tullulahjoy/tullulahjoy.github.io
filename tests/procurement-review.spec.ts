import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { addMilestone, browsePhase, confirmProcurement } from './editor-actions.ts'

async function preview(page: Page, rules = false, existing = false, anchorDate = '2028-06-15') {
  await page.goto('/workspaces')
  const data = await page.evaluate(async ({ rules, existing }) => {
    const path = '/src/data/local-data.ts', domain = '/src/domain/project.ts'
    const { localData } = await import(path), { scheduleProject } = await import(domain)
    const workspace = await localData.createWorkspace('Review team')
    const library = await localData.createPhase(workspace.id, { name: 'Evaluation', weeks: 4, color: '#315ed4', checks: rules ? [{ target: 'self', severity: 'critical', reason: '' }] : [] })
    let recordId = ''
    if (existing) {
      const phase = library.phases[0]
      const project = scheduleProject({ id: crypto.randomUUID(), name: 'Existing procurement', anchor: Date.UTC(2032, 4, 12), planningAnchor: 0, anchorId: 2, anchorName: 'Service begins', nextPhaseId: 3, approvedBaseline: null, phases: [
        { ...phase, id: 1, kind: 'phase', libraryPhaseId: phase.id, durationInherited: true, offset: 0, s: 0, e: 0 },
        { id: 2, name: 'Service begins', kind: 'milestone', weeks: 0, color: '#536ea1', libraryPhaseId: '', durationInherited: false, offset: 0, s: 0, e: 0 },
      ] })
      recordId = (await localData.savePipeline({ id: crypto.randomUUID(), workspaceId: workspace.id, expectedRevision: 0, expectedLibraryRevision: library.revision, name: 'Existing plan', plans: [project], acknowledgements: [] })).id
    }
    return { workspaceId: workspace.id, recordId }
  }, { rules, existing })
  await page.goto(`/workspaces/${data.workspaceId}/pipeline${data.recordId ? `/${data.recordId}` : ''}?edit=1&add=1`)
  await page.getByLabel('Procurement name', { exact: true }).fill('New procurement')
  await browsePhase(page, 'Evaluation')
  await addMilestone(page, 'Service begins')
  await browsePhase(page, 'Evaluation')
  await page.getByLabel('Anchor date', { exact: true }).fill(anchorDate)
  await page.getByRole('button', { name: 'Preview schedule', exact: true }).click()
  return page.getByRole('region', { name: 'Procurement review', exact: true })
}

for (const width of [320, 1440]) {
  test(`first procurement has a cohesive review and one next action at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    const review = await preview(page)
    await expect(review.getByRole('heading', { level: 2 })).toHaveText('Review the schedule')
    await expect(review.getByRole('heading', { level: 3 })).toHaveText(['Timeline', 'Clash checks'])
    await expect(review.getByRole('heading', { level: 2 })).toBeFocused()
    await expect(review.locator('.review-stage-heading')).toContainText('Review the timeline and exact dates before adding your first procurement.')
    await expect(review).toContainText('This is your first procurement. There are no other procurements to check for clashes.')
    await expect(review).toContainText('No clash-checking rules have been set up. You can add these in Library.')
    await expect(review.locator('.finding-counts')).toHaveCount(0)
    await expect(review.locator('.planning-findings')).toHaveCount(0)
    const checks = review.getByRole('region', { name: 'Clash checks', exact: true })
    const appearance = (element: HTMLElement) => { const style = getComputedStyle(element); return { border: style.borderTopColor, width: style.borderTopWidth, radius: style.borderRadius } }
    expect(await checks.evaluate(appearance)).toEqual(await review.locator('.phase-date-details').evaluate(appearance))
    expect(await checks.locator('.clash-check-heading').evaluate(el => getComputedStyle(el).backgroundColor)).toBe(await review.locator('.phase-date-details summary').evaluate(el => getComputedStyle(el).backgroundColor))
    await expect(checks.locator('.clash-check-heading p')).toHaveText('Checks for problematic overlaps with other procurements.')
    const font = (element: HTMLElement) => getComputedStyle(element).fontSize
    expect(await checks.getByRole('heading', { name: 'Clash checks' }).evaluate(font)).toBe(await review.locator('.phase-date-details summary').evaluate(font))
    expect(await checks.locator('.clash-check-heading p').evaluate(font)).toBe(await review.locator('.phase-date-details summary small').evaluate(font))
    expect(await checks.locator('.clash-check-content > p').first().evaluate(font)).toBe(await checks.locator('.clash-check-heading p').evaluate(font))
    const disclosure = review.locator('.phase-date-details')
    await expect(disclosure).toHaveJSProperty('open', false)
    await expect(disclosure.locator('table')).toBeHidden()
    await expect(disclosure.locator('summary')).toContainText('Phase and milestone dates')
    await expect(disclosure.locator('summary')).toContainText('Show start and finish dates for all 3 phases and milestones.')
    await expect(review.getByRole('region', { name: 'Anchor and gaps', exact: true })).toHaveCount(0)
    await disclosure.locator('summary').focus()
    await page.keyboard.press('Space')
    await expect(disclosure).toHaveJSProperty('open', true)
    const anchorRow = review.getByRole('region', { name: 'Phase and milestone dates', exact: true }).getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'Service begins', exact: true }) })
    await expect(anchorRow).toContainText('15 Jun 2028')
    await expect(anchorRow.locator('td').nth(0)).toHaveText('12 Jun 2028Anchor date entered: 15 Jun 2028.')
    await expect(anchorRow.locator('td').nth(1)).toHaveText('12 Jun 2028')
    await expect(review.getByRole('region', { name: 'Phase and milestone dates', exact: true }).locator('tbody tr').last().locator('td').first()).toHaveText('12 Jun 2028')
    await expect(page.getByLabel('Anchor date', { exact: true })).toHaveValue('2028-06-15')
    const footer = review.locator('.project-actions')
    await expect(footer).toContainText('Adding places this procurement on your working pipeline plan. Save the pipeline plan afterwards to keep your changes.')
    await expect(footer.locator('.button.primary')).toHaveCount(1)
    await expect(footer.getByRole('button', { name: 'Add procurement to pipeline plan', exact: true })).toBeEnabled()
    await expect(footer.getByRole('button', { name: 'Update preview', exact: true })).not.toHaveClass(/primary/)
    expect(await footer.evaluate(el => getComputedStyle(el).backgroundColor)).toBe(await review.locator('.review-stage-heading').evaluate(el => getComputedStyle(el).backgroundColor))
    expect(await review.locator('.review-stage-heading').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(220, 231, 243)')
    expect(await review.locator('.review-card').evaluate(el => getComputedStyle(el).borderTopWidth)).toBe('4px')
    await disclosure.locator('summary').click()
    await expect(disclosure.locator('table')).toBeHidden()
    await review.getByRole('heading', { name: 'Review the schedule', exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath('review-start.png') })
    await review.getByRole('region', { name: 'Clash checks', exact: true }).scrollIntoViewIfNeeded()
    await expect(footer.getByRole('button', { name: 'Add procurement to pipeline plan', exact: true })).toBeInViewport()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('review-end.png') })
    await page.getByLabel('Item 1 duration in weeks', { exact: true }).fill('5')
    await expect(footer.getByRole('button', { name: 'Add procurement to pipeline plan', exact: true })).toBeDisabled()
    await expect(footer.getByRole('button', { name: 'Preview schedule', exact: true })).toHaveClass(/primary/)
    await footer.getByRole('button', { name: 'Preview schedule', exact: true }).click()
    await expect(footer.getByRole('button', { name: 'Add procurement to pipeline plan', exact: true })).toBeEnabled()
  })
}

for (const rules of [false, true]) {
  test(`existing procurements use an honest neutral overlap result with rules=${rules}`, async ({ page }) => {
    const review = await preview(page, rules, true)
    await expect(review.locator('.review-stage-heading')).toContainText('Review the timeline, exact dates and clash checks against other procurements before adding this procurement.')
    const checks = review.getByRole('region', { name: 'Clash checks', exact: true })
    await expect(checks).not.toContainText('This is your first procurement.')
    await expect(checks).toContainText(rules ? 'No warnings or critical clashes found against the shared Library rules.' : 'No clash-checking rules have been set up.')
    await expect(checks.locator('.finding-counts')).toHaveCount(0)
    await expect(review.getByRole('button', { name: 'Add procurement to pipeline plan', exact: true })).toBeEnabled()
  })
}

test('a first procurement with configured rules does not imply comparisons have been performed', async ({ page }) => {
  const review = await preview(page, true)
  await expect(review).toContainText('There are no other procurements to check for clashes.')
  await expect(review).not.toContainText('No warnings or critical clashes found')
  await expect(review.locator('.finding-counts')).toHaveCount(0)
})

test('an anchor entered on Monday needs no date annotation', async ({ page }) => {
  const review = await preview(page, false, false, '2028-06-12')
  await review.locator('.phase-date-details summary').click()
  const dates = review.getByRole('region', { name: 'Phase and milestone dates', exact: true })
  const anchor = dates.getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'Service begins', exact: true }) })
  await expect(anchor.locator('td').nth(0)).toHaveText('12 Jun 2028')
  await expect(anchor.locator('td').nth(1)).toHaveText('12 Jun 2028')
  await expect(dates.locator('.anchor-planning-note')).toHaveCount(0)
  await page.getByRole('button', { name: 'Remove phase: Evaluation', exact: true }).first().click()
  await page.getByRole('button', { name: 'Remove phase: Evaluation', exact: true }).click()
  await page.getByRole('button', { name: 'Preview schedule', exact: true }).click()
  await expect(review.locator('.phase-date-details summary')).toContainText('Show start and finish dates for 1 phase or milestone.')
})

test('editing shows Monday planning dates for saved and proposed milestones while retaining the entered anchor', async ({ page }) => {
  const review = await preview(page)
  await review.getByRole('button', { name: 'Add procurement to pipeline plan', exact: true }).click()
  await confirmProcurement(page)
  await page.getByRole('button', { name: 'New procurement', exact: true }).click()
  await expect(page.locator('.procurement-summary')).toContainText('15 Jun 2028')
  await page.getByLabel('Item 1 duration in weeks', { exact: true }).fill('5')
  await page.getByRole('button', { name: 'Preview changes', exact: true }).click()
  await expect(page.locator('.phase-date-details')).toHaveJSProperty('open', false)
  await expect(page.locator('.phase-date-details summary')).toContainText('Show saved and proposed start and finish dates for all 3 phases and milestones.')
  await page.locator('.phase-date-details summary').click()
  const dates = page.getByRole('region', { name: 'Phase and milestone dates', exact: true })
  const anchor = dates.getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'Service begins', exact: true }) })
  await expect(anchor.locator('td').nth(0)).toHaveText('12 Jun 2028Anchor date entered: 15 Jun 2028.')
  await expect(anchor.locator('td').nth(1)).toHaveText('12 Jun 2028Anchor date entered: 15 Jun 2028.')
  await expect(anchor.locator('td').nth(2)).toHaveText('12 Jun 2028')
  await expect(anchor.locator('td').nth(3)).toHaveText('12 Jun 2028')
  await expect(dates.locator('tbody tr').last().locator('td').nth(1)).toHaveText('12 Jun 2028')
})

for (const [initialDate, proposedDate, affected] of [['2031-01-13', '2031-02-10', 'Saved'], ['2031-02-10', '2031-01-13', 'Proposed']]) {
  test(`editing identifies the ${affected.toLowerCase()} duration that excludes Christmas without changing active weeks`, async ({ page }) => {
    const review = await preview(page, false, false, initialDate)
    await review.getByRole('button', { name: 'Add procurement to pipeline plan', exact: true }).click()
    await confirmProcurement(page)
    await page.getByRole('button', { name: 'New procurement', exact: true }).click()
    if (affected === 'Saved') {
      await page.getByRole('button', { name: 'Preview changes', exact: true }).click()
      await page.locator('.phase-date-details summary').click()
      const duration = page.getByRole('region', { name: 'Phase and milestone dates' }).locator('tbody tr').first().locator('td').nth(4)
      await expect(duration.locator('.duration-comparison')).toHaveText(['Saved: 4 active weeks', 'Proposed: 4 active weeks'])
      await expect(duration.locator('.christmas-duration-note')).toHaveText('Christmas and New Year break excluded.')
    }
    await page.getByRole('button', { name: 'Edit details', exact: true }).click()
    const details = page.getByRole('dialog', { name: 'Edit procurement details' })
    await details.getByLabel('Anchor date', { exact: true }).fill(proposedDate)
    await details.getByRole('button', { name: 'Use these details', exact: true }).click()
    await page.getByRole('button', { name: 'Preview changes', exact: true }).click()
    await page.locator('.phase-date-details summary').click()
    const dates = page.getByRole('region', { name: 'Phase and milestone dates', exact: true })
    const duration = dates.locator('tbody tr').first().locator('td').nth(4)
    await expect(duration.locator('.duration-comparison')).toHaveText(affected === 'Saved' ? ['Saved: 4 active weeks', 'Proposed: 4 weeks'] : ['Saved: 4 weeks', 'Proposed: 4 active weeks'])
    await expect(duration.locator('.christmas-duration-note')).toHaveText(`${affected} duration excludes the Christmas and New Year break.`)
    await expect(dates).toContainText(affected === 'Saved' ? 'No longer includes the Christmas break; active duration unchanged.' : 'Now includes the Christmas break; active duration unchanged.')
    await expect(dates.locator('tbody tr').last().locator('.christmas-duration-note')).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Anchor and gaps' })).toHaveCount(0)
  })
}
