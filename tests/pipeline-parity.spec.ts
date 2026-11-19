import { addMilestone, confirmProcurement } from './editor-actions.ts'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { OverlapRule, Plan } from '../src/domain/scheduling.ts'

type ReferenceSource = { plans: Plan[]; rules: OverlapRule[]; record: { name: string } | null }
type ReferenceDemo = { savedVersions: () => { id: string; status: string }[]; pipelineSource: () => ReferenceSource; openPipeline: (target: { id: string; status: string }, source: ReferenceSource) => void }

async function fixture(page: Page, critical = true) {
  await page.goto('/workspaces')
  const result = await page.evaluate(async critical => {
    const dataPath = '/src/data/local-data.ts', schedulePath = '/src/domain/project.ts', clashesPath = '/src/domain/scheduling.ts'
    const { localData } = await import(dataPath)
    const { scheduleProject, acknowledgeClashes } = await import(schedulePath)
    const { findClashes } = await import(clashesPath)
    const workspace = await localData.createWorkspace('Parity team')
    await localData.createPhase(workspace.id, { name: 'Evaluation', weeks: 4, color: '#315ed4', checks: [{ target: 'self', severity: 'warning', reason: 'Shared evaluation team' }] })
    const library = await localData.createPhase(workspace.id, { name: 'Moderation', weeks: 2, color: '#b45129', checks: critical ? [{ target: 'self', severity: 'critical', reason: 'Shared moderation team' }] : [] })
    const plans = ['Community services', 'Digital services'].map(name => scheduleProject({ id: crypto.randomUUID(), name, anchor: Date.parse('2032-05-12T00:00:00Z'), planningAnchor: 0, anchorId: 3, anchorName: 'Service begins', nextPhaseId: 4, approvedBaseline: null, phases: [
      ...library.phases.map((phase: { id: string; name: string; weeks: number; color: string }, index: number) => ({ ...phase, id: index + 1, libraryPhaseId: phase.id, kind: 'phase', offset: 0, s: 0, e: 0, durationInherited: true })),
      { id: 3, name: 'Service begins', kind: 'milestone', weeks: 0, color: '#536ea1', offset: 0, libraryPhaseId: '', s: 0, e: 0, durationInherited: false },
    ] }))
    const record = await localData.savePipeline({ id: crypto.randomUUID(), workspaceId: workspace.id, expectedRevision: 0, expectedLibraryRevision: library.revision, name: 'Autumn pipeline plan', note: 'Browser parity reference', plans, acknowledgements: acknowledgeClashes(findClashes(plans, library.rules), [], 'Separate teams for this test schedule') })
    return { workspace, record }
  }, critical)
  await page.goto(`/workspaces/${result.workspace.id}/pipeline/${result.record.id}?edit=1`)
  return result
}

async function contents(page: Page, workspaceId: string) {
  return page.evaluate(async id => {
    const modulePath = '/src/data/local-data.ts'; const { localData } = await import(modulePath)
    return { library: await localData.getLibrary(id), pipelines: await localData.listPipelines(id) }
  }, workspaceId)
}

test('the example is read-only and leaves no Library or saved data; first Apply removes it before Save', async ({ page }, testInfo) => {
  await page.goto('/workspaces')
  await page.getByLabel('Workspace name').fill('New team')
  await page.getByRole('button', { name: 'Create workspace' }).click()
  await expect(page).toHaveURL(/\/workspaces\/[\da-f-]+\/pipeline$/)
  await page.getByRole('dialog', { name: 'Your pipeline plan starts here', exact: true }).getByRole('button', { name: 'Got it', exact: true }).click()
  const id = page.url().split('/')[4]
  const example = page.getByRole('region', { name: 'Example pipeline plan', exact: true })
  const notice = page.locator('.example-notice')
  await expect(notice.getByRole('heading', { level: 2 })).toHaveText('Example only - your pipeline plan is currently empty')
  await expect(notice.locator('p')).toHaveText('These fictional procurements show how your timeline could look. Choose + Add procurement to start your own.')
  expect(Math.abs((await notice.boundingBox())!.y + (await notice.boundingBox())!.height - (await example.boundingBox())!.y)).toBeLessThanOrEqual(1)
  await expect(example.locator('.timeline-row')).toHaveCount(4)
  await expect(example.getByRole('img', { name: 'Anchor milestone', exact: true })).toHaveCount(3)
  await expect(example.getByRole('combobox')).toHaveCount(0)
  await expect(example.getByRole('link')).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Pipeline Plan context' })).toHaveCount(0)
  const initial = await contents(page, id)
  expect(initial.library.phases).toEqual([]); expect(initial.library.rules).toEqual([]); expect(initial.pipelines).toEqual([])
  await page.screenshot({ path: testInfo.outputPath('empty-example.png'), fullPage: true })
  await example.getByRole('button', { name: /^Community services: Dialogue/ }).first().click()
  const details = page.getByRole('dialog', { name: 'Community services: timeline details', exact: true })
  await details.getByRole('button', { name: 'Pin tooltip', exact: true }).click()
  await details.getByRole('button', { name: 'Close tooltip', exact: true }).click()
  await page.getByRole('button', { name: '+ Add procurement', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Add procurement', exact: true })).toBeVisible()
  await page.getByLabel('Procurement name', { exact: true }).fill('First real procurement')
  await addMilestone(page, 'Service begins')
  await page.getByLabel('Anchor date', { exact: true }).fill('2032-05-12')
  await page.getByRole('button', { name: 'Preview schedule', exact: true }).click()
  await page.getByRole('button', { name: 'Add procurement to pipeline plan', exact: true }).click()
  await confirmProcurement(page)
  await expect(example).toHaveCount(0)
  await expect(page.locator('.pipeline-modal .example-notice')).toHaveCount(0)
  await expect(page.locator('.pipeline-introduction')).toHaveCount(0)
  await expect(page.locator('.pipeline-modal .pipeline-page')).toBeFocused()
  await expect(page.getByRole('region', { name: 'Pipeline Plan context' })).toContainText('Unsaved changes')
  await expect(page.getByRole('region', { name: 'Procurements table' })).toContainText('First real procurement')
  expect(await contents(page, id)).toEqual(initial)
})

test('findings filter counts, focus, empty results and procurement links use real data', async ({ page }) => {
  await fixture(page, false)
  const findings = page.getByRole('region', { name: 'Warnings and critical clashes', exact: true })
  await expect(findings.getByRole('button', { name: 'All (1)', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await findings.getByRole('button', { name: 'Critical clashes (0)', exact: true }).click()
  await expect(findings.getByRole('button', { name: 'Critical clashes (0)', exact: true })).toBeFocused()
  await expect(findings.getByRole('status')).toHaveText('Showing 0 of 1 findings. Filter: Critical clashes.')
  await expect(findings.getByText('No critical clashes found. Select All to see the other findings.', { exact: true })).toBeVisible()
  await findings.getByRole('button', { name: 'Warnings (1)', exact: true }).click()
  await expect(findings.getByRole('heading', { name: 'Phase: Evaluation', exact: true })).toBeVisible()
  await findings.getByRole('link', { name: 'Edit Community services', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Edit procurement', exact: true })).toBeVisible()
  await expect(page.locator('.procurement-summary')).toContainText('Community services')
})

test('the procurement overview displays Friday finishes and supports read-only schedule details', async ({ page }) => {
  const data = await fixture(page)
  const anchorLabels = page.getByRole('region', { name: 'Pipeline Plan timeline', exact: true }).locator('.timeline-label small')
  await expect(anchorLabels).toHaveCount(data.record.plans.length)
  for (const plan of data.record.plans) {
    const label = page.getByRole('region', { name: 'Pipeline Plan timeline', exact: true }).locator('.timeline-label').filter({ has: page.getByRole('button', { name: plan.name, exact: true }) })
    await expect(label.getByRole('img', { name: 'Anchor milestone', exact: true })).toBeVisible()
    await expect(label.locator('small')).toContainText(plan.anchorName)
    const textBounds = (await label.locator('small').boundingBox())!
    const iconBounds = (await label.getByRole('img', { name: 'Anchor milestone', exact: true }).boundingBox())!
    expect(iconBounds.x).toBeGreaterThanOrEqual(textBounds.x)
    expect(iconBounds.x + iconBounds.width).toBeLessThanOrEqual(textBounds.x + textBounds.width)
  }
  const table = page.getByRole('region', { name: 'Procurements table', exact: true })
  await expect(table.getByRole('columnheader')).toHaveText(['Procurement', 'Planning start', 'Planning finish', 'Anchor date', 'Actions'])
  const row = table.getByRole('row').filter({ hasText: 'Community services' })
  await expect(row).toContainText('12 May 2032')
  await row.getByRole('link', { name: 'Edit Community services', exact: true }).last().click()
  await expect(page.getByRole('heading', { name: 'Edit procurement' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Exit edit mode', exact: true }).click()
  const viewing = page.getByRole('region', { name: 'Procurements table', exact: true }).getByRole('row').filter({ hasText: 'Community services' })
  await viewing.getByRole('link', { name: 'View details for Community services', exact: true }).last().click()
  const dialog = page.getByRole('dialog', { name: 'Community services', exact: true })
  const schedule = dialog.getByRole('region', { name: 'Procurement schedule table' })
  await expect(schedule.getByRole('row').filter({ hasText: 'Moderation' })).toContainText('7 May 2032')
  await expect(schedule.getByRole('row').filter({ hasText: 'Service begins' })).toContainText('12 May 2032')
  await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
  const stored = await contents(page, data.workspace.id)
  expect(stored.pipelines).toEqual([data.record])
})

test('independent pinned details, focus restoration and native Save dropdown work together', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await fixture(page)
  const first = page.getByRole('button', { name: /^Community services: Evaluation/ }).first()
  await first.focus()
  const firstDetails = page.getByRole('dialog', { name: 'Community services: timeline details', exact: true })
  await page.keyboard.press('Tab')
  await expect(firstDetails.getByRole('button', { name: 'Pin tooltip', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(firstDetails).toHaveAttribute('data-pinned', 'true')
  const second = page.getByRole('button', { name: /^Digital services: Evaluation/ }).first()
  await second.click()
  const secondDetails = page.getByRole('dialog', { name: 'Digital services: timeline details', exact: true })
  await secondDetails.getByRole('button', { name: 'Pin tooltip', exact: true }).click()
  await expect(page.locator('.timeline-tooltip[data-pinned=true]')).toHaveCount(2)
  await page.keyboard.press('Escape')
  await expect(second).toBeFocused()
  await expect(page.locator('.timeline-tooltip[data-pinned=true]')).toHaveCount(1)
  const save = page.getByRole('region', { name: 'Pipeline Plan context' }).locator('button[popovertarget]')
  await save.click()
  await expect(page.locator('.timeline-tooltip')).toHaveCount(0)
  await expect(save).toHaveAttribute('aria-expanded', 'true')
  const menu = page.getByRole('group', { name: 'Save the displayed pipeline plan', exact: true })
  await expect(menu.getByText('Save a new copy under a different name.', { exact: true })).toBeVisible()
  await menu.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(save).toBeFocused()
  expect(errors).toEqual([])
})

test('Full pipeline plan disables window stepping and changes no saved schedules', async ({ page }) => {
  const data = await fixture(page)
  await page.getByRole('combobox', { name: 'Viewing window', exact: true }).selectOption('all')
  await expect(page.getByRole('button', { name: 'Previous viewing window', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Next viewing window', exact: true })).toBeDisabled()
  await expect(page.getByRole('dialog', { name: 'Editing live pipeline plan', exact: true }).getByLabel('Window starts', { exact: true })).toBeDisabled()
  await page.getByRole('combobox', { name: 'Viewing window', exact: true }).selectOption('6')
  await expect(page.getByRole('dialog', { name: 'Editing live pipeline plan', exact: true }).getByLabel('Window starts', { exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Next viewing window', exact: true }).click()
  expect((await contents(page, data.workspace.id)).pipelines).toEqual([data.record])
})

test('populated page dimensions match the connected prototype with equivalent schedules', async ({ page, context }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const reference = await context.newPage()
  await reference.setViewportSize({ width: 1440, height: 1000 })
  await reference.goto('/mockups/pipeline.html')
  await reference.waitForFunction(() => Boolean((window as unknown as { LTPPDemo?: unknown }).LTPPDemo))
  await reference.evaluate(() => {
    const demo = (window as unknown as { LTPPDemo: ReferenceDemo }).LTPPDemo
    const target = demo.savedVersions().find(version => version.status === 'saved')!
    demo.openPipeline(target, demo.pipelineSource())
  })
  await reference.goto('/mockups/pipeline.html?view=resume')
  await expect(reference.getByRole('heading', { name: 'Editing pipeline', exact: true })).toBeVisible()
  const source = await reference.evaluate(() => (window as unknown as { LTPPDemo: ReferenceDemo }).LTPPDemo.pipelineSource())
  await page.goto('/workspaces')
  const target = await page.evaluate(async source => {
    const dataPath = '/src/data/local-data.ts', clashesPath = '/src/domain/scheduling.ts', projectPath = '/src/domain/project.ts'
    const { localData } = await import(dataPath)
    const { findClashes } = await import(clashesPath)
    const { acknowledgeClashes } = await import(projectPath)
    const workspace = await localData.createWorkspace('Reference comparison')
    const ids = new Map<string, string>()
    for (const phase of source.plans.flatMap(plan => plan.phases).filter(phase => phase.kind === 'phase')) {
      const key = phase.libraryPhaseId || phase.name
      if (ids.has(key)) continue
      const library = await localData.createPhase(workspace.id, { name: `${phase.name} [${key}]`, weeks: phase.weeks, color: phase.color, checks: [] })
      ids.set(key, library.phases.at(-1).id)
    }
    for (const rule of source.rules) {
      const a = ids.get(rule.a ?? rule.sourceId ?? ''), b = ids.get(rule.b ?? rule.target ?? '')
      if (a && b) await localData.createRule(workspace.id, { a, b, severity: rule.severity, reason: rule.reason ?? '' })
    }
    const library = await localData.getLibrary(workspace.id)
    const plans = source.plans.map(plan => ({ id: crypto.randomUUID(), name: plan.name, anchor: plan.anchor, planningAnchor: plan.planningAnchor, anchorId: plan.anchorId, anchorName: plan.anchorName, nextPhaseId: Math.max(...plan.phases.map(phase => phase.id)) + 1, approvedBaseline: null, phases: plan.phases.map(phase => ({ id: phase.id, name: phase.name, kind: phase.kind, weeks: phase.weeks, offset: phase.offset, color: phase.color, s: phase.s, e: phase.e, libraryPhaseId: phase.kind === 'phase' ? ids.get(phase.libraryPhaseId || phase.name)! : '', durationInherited: false })) }))
    const record = await localData.savePipeline({ id: crypto.randomUUID(), workspaceId: workspace.id, expectedRevision: 0, expectedLibraryRevision: library.revision, name: source.record?.name ?? 'Reference pipeline plan', note: 'Equivalent prototype schedule for browser verification', plans, acknowledgements: acknowledgeClashes(findClashes(plans, library.rules), [], 'Browser reference fixture') })
    return { workspace, record }
  }, source)
  await page.goto(`/workspaces/${target.workspace.id}/pipeline/${target.record.id}?edit=1`)
  await expect(page.locator('.phase-segment').first()).toBeVisible()
  const styles = async (current: Page, selectors: string[]) => current.evaluate(selectors => selectors.map(selector => {
    const element = (document.querySelector('.pipeline-modal') ?? document).querySelector(selector)
    if (!element) throw new Error(`Missing reference element: ${selector}`)
    const style = getComputedStyle(element)
    return { font: style.fontSize, padding: style.padding, background: style.backgroundColor, border: style.borderTopWidth, radius: style.borderRadius, height: element.getBoundingClientRect().height }
  }), selectors)
  const referenceStyles = await styles(reference, ['.pipeline-context-panel', '.context-panel-name', '.timeline-row:not(.timeline-ruler-row)', '.timeline-ruler-row', '.timeline-label', '.segment'])
  const actualStyles = await styles(page, ['.pipeline-context-panel', '.context-name-row h2', '.timeline-row:not(.ruler-row)', '.ruler-row', '.timeline-label', '.phase-segment'])
  for (let i = 0; i < actualStyles.length; i++) {
    expect(actualStyles[i].font).toBe(referenceStyles[i].font)
    expect(actualStyles[i].padding).toBe(referenceStyles[i].padding)
    expect(actualStyles[i].border).toBe(referenceStyles[i].border)
    expect(actualStyles[i].radius).toBe(referenceStyles[i].radius)
    if (i === 2) {
      // The approved inline anchor may wrap a long label onto one additional line.
      const lineHeight = await page.locator('.timeline-anchor-label').first().evaluate(element => parseFloat(getComputedStyle(element).lineHeight))
      expect(actualStyles[i].height).toBeGreaterThanOrEqual(referenceStyles[i].height - 2)
      expect(actualStyles[i].height).toBeLessThanOrEqual(referenceStyles[i].height + lineHeight + 2)
    } else expect(Math.abs(actualStyles[i].height - referenceStyles[i].height)).toBeLessThanOrEqual(2)
  }
  expect(actualStyles[0].background).toBe(referenceStyles[0].background)
  await expect(page.locator('.pipeline-introduction')).toHaveCount(0)
  await expect(page.getByText(/connected prototype|Reset demo|fictional editor/)).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('react-populated.png'), fullPage: true })
  await reference.locator('.demo-context, #reset-demo').evaluateAll(elements => elements.forEach(element => element.remove()))
  await reference.screenshot({ path: testInfo.outputPath('prototype-populated.png'), fullPage: true })
})

for (const width of [320, 768, 1440]) {
  test(`populated pipeline plan and read-only table stay usable at ${width}px`, async ({ page }, testInfo) => {
    const warnings: string[] = []
    page.on('console', message => { if (message.type() === 'warning') warnings.push(message.text()) })
    await page.setViewportSize({ width, height: 1000 })
    const data = await fixture(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(page.getByRole('region', { name: 'Procurements table' })).toHaveAttribute('tabindex', '0')
    await page.screenshot({ path: testInfo.outputPath('populated.png'), fullPage: true })
    await page.getByRole('link', { name: 'Review findings', exact: true }).click()
    await expect(page.getByRole('region', { name: 'Warnings and critical clashes', exact: true })).toBeInViewport()
    await expect(page.getByRole('region', { name: 'Warnings and critical clashes', exact: true })).toBeFocused()
    await page.goto(`/workspaces/${data.workspace.id}/pipeline/${data.record.id}`)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(page.getByRole('button', { name: '+ Add procurement', exact: true })).toHaveCount(0)
    await expect(page.locator('.pipeline-introduction')).toHaveCount(0)
    expect(warnings.filter(message => /blocker|POP navigation/i.test(message))).toEqual([])
  })
}
