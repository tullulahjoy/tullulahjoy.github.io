import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { Project } from '../src/data/schemas.ts'
import { confirmProcurement, editProcurementName } from './editor-actions.ts'

async function setup(page: Page) {
  await page.goto('/workspaces')
  return page.evaluate(async () => {
    const dataPath = '/src/data/local-data.ts', projectPath = '/src/domain/project.ts'
    const { localData } = await import(dataPath), { scheduleProject } = await import(projectPath)
    const workspace = await localData.createWorkspace('Live-plan team')
    const library = await localData.createPhase(workspace.id, { name: 'Evaluation', weeks: 4, color: '#315ed4', checks: [] })
    const phase = library.phases[0]
    const project = scheduleProject({ id: crypto.randomUUID(), name: 'Community services', anchor: Date.UTC(2032, 4, 12), planningAnchor: 0, anchorId: 2, anchorName: 'Service begins', nextPhaseId: 3, approvedBaseline: null, phases: [
      { ...phase, id: 1, kind: 'phase', libraryPhaseId: phase.id, durationInherited: true, offset: 0, s: 0, e: 0 },
      { id: 2, name: 'Service begins', kind: 'milestone', weeks: 0, color: '#536ea1', libraryPhaseId: '', durationInherited: false, offset: 0, s: 0, e: 0 },
    ] })
    const record = await localData.savePipeline({ id: crypto.randomUUID(), workspaceId: workspace.id, expectedRevision: 0, expectedLibraryRevision: library.revision, name: 'Autumn pipeline plan', note: 'First saved plan', plans: [project], acknowledgements: [] })
    localStorage.setItem(`ltpp-app:welcome-dismissed:${workspace.id}`, '1')
    return { workspace, library, record }
  })
}
const liveEditor = (page: Page) => page.getByRole('dialog', { name: 'Editing live pipeline plan', exact: true })
async function change(page: Page) {
  await liveEditor(page).getByRole('button', { name: 'Community services', exact: true }).click()
  await editProcurementName(page, 'Updated community services')
  await page.getByRole('button', { name: 'Preview changes', exact: true }).click()
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await confirmProcurement(page)
}
async function openSave(page: Page, mode = 'Save') {
  await liveEditor(page).getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByRole('group', { name: 'Save the displayed pipeline plan' }).getByRole('button', { name: mode, exact: true }).click()
}
for (const width of [320, 1440]) test(`live edit is a distinct modal with safe exits at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 })
  const data = await setup(page), base = `/workspaces/${data.workspace.id}`
  await page.goto(`${base}/pipeline`)
  await expect(page.locator('.pipeline-context-panel')).toHaveAttribute('data-state', 'live')
  await expect(page.getByRole('link', { name: 'Live Pipeline', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByText('Confirm as first baseline', { exact: true })).toHaveCount(0)
  await page.getByRole('link', { name: 'Edit live plan', exact: true }).click()
  const modal = liveEditor(page)
  await expect(modal).toBeVisible()
  await expect(page.locator('html')).toHaveCSS('overflow', 'hidden')
  await expect(modal.locator('.pipeline-context-panel')).toHaveCSS('background-color', 'rgb(242, 237, 248)')
  await expect(page.locator('[inert] .pipeline-context-panel')).toHaveAttribute('data-state', 'live')
  await expect(modal.getByRole('button', { name: 'Save', exact: true })).toHaveCSS('background-color', 'rgb(107, 79, 134)')
  await change(page)
  await modal.getByRole('button', { name: 'Close Editing live pipeline plan', exact: true }).click()
  const exit = page.getByRole('dialog', { name: 'Exit edit mode?', exact: true })
  await expect(exit).toContainText('returning to Live Pipeline')
  await exit.getByRole('button', { name: 'Keep editing', exact: true }).click()
  await expect(modal).toContainText('Updated community services')
  await modal.getByRole('button', { name: 'Exit edit mode', exact: true }).click()
  await exit.getByRole('button', { name: 'Discard changes and exit', exact: true }).click()
  await expect(page).toHaveURL(`${base}/pipeline`)
  await expect(page.getByRole('link', { name: 'Edit live plan', exact: true })).toBeFocused()
  await expect(page.getByRole('button', { name: 'Community services', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Edit live plan', exact: true }).click()
  await change(page)
  await page.screenshot({ path: info.outputPath('live-edit-modal.png') })
  await modal.getByRole('button', { name: 'Exit edit mode', exact: true }).click()
  await exit.getByRole('button', { name: 'Save and exit', exact: true }).click()
  const save = page.getByRole('dialog', { name: /Save changes to/ })
  await save.getByLabel('Notes (optional)', { exact: true }).fill('Updated live plan')
  await save.getByRole('button', { name: 'Save and exit', exact: true }).click()
  await expect(page).toHaveURL(`${base}/pipeline`)
  await expect(page.getByRole('button', { name: 'Updated community services', exact: true })).toBeVisible()
  const records = await page.evaluate(async id => { const path = '/src/data/local-data.ts'; return (await import(path)).localData.listPipelines(id) }, data.workspace.id)
  expect(records).toHaveLength(1)
  expect(records[0]).toMatchObject({ id: data.record.id, revision: 2, note: 'Updated live plan' })
})

test('Save as opens the separate saved editor; Make live retains both plans and names both', async ({ page }) => {
  const data = await setup(page), base = `/workspaces/${data.workspace.id}`
  await page.goto(`${base}/pipeline?edit=1`)
  await change(page)
  await openSave(page, 'Save as\u2026')
  const save = page.getByRole('dialog', { name: 'Save pipeline plan', exact: true })
  await save.getByLabel('Name (required)', { exact: true }).fill('Spring alternative')
  await save.getByRole('button', { name: 'Save', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'Editing pipeline plan', exact: true })
  await expect(modal).toContainText('All changes saved')
  await expect(page).toHaveURL(/saved-pipelines\/[\da-f-]+\?edit=1$/)
  await expect(page.locator('.page-heading h1')).toHaveText('Saved Pipeline Plans')
  const id = page.url().split('/saved-pipelines/')[1].split('?')[0]
  await modal.getByRole('button', { name: 'Close Editing pipeline plan', exact: true }).click()
  await page.getByRole('row').filter({ hasText: 'Spring alternative' }).getByRole('button', { name: 'Make live', exact: true }).click()
  const confirmation = page.getByRole('dialog', { name: 'Make "Spring alternative" live?', exact: true })
  await expect(confirmation).toContainText('Autumn pipeline plan')
  await expect(confirmation).toContainText('will remain in Saved Pipeline Plans')
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('row').filter({ hasText: 'Spring alternative' }).getByRole('button', { name: 'Make live', exact: true }).click()
  await confirmation.getByRole('button', { name: 'Make live', exact: true }).click()
  await expect(page).toHaveURL(`${base}/pipeline`)
  await expect(page.locator('.pipeline-context-panel')).toContainText('Spring alternative')
  await page.reload()
  await expect(page.locator('.pipeline-context-panel')).toContainText('Spring alternative')
  const stored = await page.evaluate(async workspaceId => { const path = '/src/data/local-data.ts', { localData } = await import(path); return { workspace: await localData.getWorkspace(workspaceId), records: await localData.listPipelines(workspaceId) } }, data.workspace.id)
  expect(stored.workspace.currentBaselineId).toBe(id)
  expect(stored.records).toHaveLength(2)
  expect(stored.records.find((record: { id: string }) => record.id === data.record.id)).toEqual(data.record)
})

test('live overview has one plan heading and explicit detail/edit actions with editable procurement anchors', async ({ page }) => {
  const data = await setup(page), base = `/workspaces/${data.workspace.id}`
  await page.goto(`${base}/pipeline`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(data.record.name)
  await expect(page.getByRole('heading', { name: 'Your procurement pipeline plan', exact: true })).toHaveCount(0)
  await expect(page.locator('.context-label')).toHaveText('Live pipeline plan')
  await expect(page.locator('.pipeline-context-panel')).toContainText('Follow the live plan, or explore a different way forward.')
  const row = page.getByRole('region', { name: 'Procurements table', exact: true }).getByRole('row').filter({ hasText: 'Community services' })
  await expect(row.locator('td').first()).toContainText('Community services')
  await expect(row.locator('td').first().locator('a, button')).toHaveCount(0)
  await row.getByRole('link', { name: 'View details for Community services', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Community services', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Close details', exact: true }).click()
  await row.getByRole('link', { name: 'Edit Community services', exact: true }).click()
  const modal = liveEditor(page)
  await expect(modal.getByRole('heading', { name: 'Edit procurement', exact: true })).toBeVisible()
  await expect(page).toHaveURL(`${base}/pipeline?edit=1&procurement=${data.record.plans[0].id}`)
  await modal.getByRole('button', { name: 'Edit details', exact: true }).click()
  const details = page.getByRole('dialog', { name: 'Edit procurement details', exact: true })
  await expect(details.getByLabel('Anchor date', { exact: true })).toBeEnabled()
  await expect(details.getByRole('combobox', { name: 'Anchor milestone', exact: true })).toBeEnabled()
  await expect(details.getByRole('button', { name: /lock anchor/i })).toHaveCount(0)
  await details.getByLabel('Anchor date', { exact: true }).fill('2032-06-18')
  await details.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(modal.locator('.procurement-summary')).toContainText('12 May 2032')
  await modal.getByRole('button', { name: 'Edit details', exact: true }).click()
  await details.getByLabel('Anchor date', { exact: true }).fill('2032-06-18')
  await details.getByRole('button', { name: 'Use these details', exact: true }).click()
  await expect(modal.locator('.procurement-summary')).not.toContainText(/Locked|Unlocked/)
  await modal.getByRole('button', { name: 'Preview changes', exact: true }).click()
  await modal.getByRole('button', { name: 'Save changes', exact: true }).click()
  await confirmProcurement(page)
  await modal.getByRole('button', { name: 'Exit edit mode', exact: true }).click()
  await page.getByRole('dialog', { name: 'Exit edit mode?', exact: true }).getByRole('button', { name: 'Save and exit', exact: true }).click()
  await page.getByRole('dialog', { name: /Save changes to/ }).getByRole('button', { name: 'Save and exit', exact: true }).click()
  await expect(page).toHaveURL(`${base}/pipeline`)
  await expect(row).toContainText('18 Jun 2032')
  await expect(row.getByRole('link', { name: 'Edit Community services', exact: true })).toBeFocused()
})

test('Make live rejects stale selection, competing live choices and other workspaces atomically', async ({ page }) => {
  const data = await setup(page)
  const result = await page.evaluate(async data => {
    const path = '/src/data/local-data.ts', { localData } = await import(path)
    const alternative = await localData.savePipeline({ ...data.record, id: crypto.randomUUID(), name: 'Alternative', expectedRevision: 0, expectedLibraryRevision: data.library.revision })
    const attempt = async (id: string, revision: number, live: string) => { try { await localData.makeLive(data.workspace.id, id, revision, live); return 'success' } catch (error) { return (error as Error).message } }
    const stale = await attempt(alternative.id, alternative.revision + 1, data.record.id)
    const foreign = await localData.createWorkspace('Other team')
    const foreignLibrary = await localData.createPhase(foreign.id, { name: 'Phase', weeks: 1, color: '#315ed4', checks: [] })
    const foreignRecord = await localData.savePipeline({ ...alternative, id: crypto.randomUUID(), workspaceId: foreign.id, plans: data.record.plans.map((plan: Project) => ({ ...plan, phases: plan.phases.map(phase => phase.kind === 'phase' ? { ...phase, libraryPhaseId: foreignLibrary.phases[0].id } : phase) })), expectedRevision: 0, expectedLibraryRevision: foreignLibrary.revision })
    const crossWorkspace = await attempt(foreignRecord.id, foreignRecord.revision, data.record.id)
    const concurrent = await Promise.allSettled([1, 2].map(() => localData.makeLive(data.workspace.id, alternative.id, alternative.revision, data.record.id)))
    return { stale, crossWorkspace, successes: concurrent.filter(item => item.status === 'fulfilled').length, workspace: await localData.getWorkspace(data.workspace.id), records: await localData.listPipelines(data.workspace.id), alternative }
  }, data)
  expect(result.stale).toContain('selected pipeline plan changed')
  expect(result.crossWorkspace).toContain('selected pipeline plan changed')
  expect(result.successes).toBe(1)
  expect(result.workspace.currentBaselineId).toBe(result.alternative.id)
  expect(result.records).toEqual(expect.arrayContaining([data.record, result.alternative]))
})

for (const selection of ['selected', 'sole', 'ambiguous']) test(`legacy ${selection} setup preserves data and chooses live only when unambiguous`, async ({ page }) => {
  const data = await setup(page)
  const result = await page.evaluate(async ({ data, selection }) => {
    const path = '/src/data/local-data.ts', { localData } = await import(path)
    if (selection !== 'sole') await localData.savePipeline({ ...data.record, id: crypto.randomUUID(), name: 'Other saved plan', expectedRevision: 0, expectedLibraryRevision: data.library.revision })
    const records = await localData.listPipelines(data.workspace.id)
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('ltpp-app-local'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    const legacy = { ...data.workspace, ...(selection === 'selected' ? { setupPipelineId: data.record.id } : {}) }
    const tx = db.transaction(['workspaces', 'pipelines'], 'readwrite')
    const confirmation = { at: '2026-10-01T12:00:00Z', by: 'Local user', rationale: 'Historical note' }
    tx.objectStore('workspaces').put(legacy)
    tx.objectStore('pipelines').put({ ...data.record, confirmation })
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error) }); db.close()
    const workspace = await localData.getWorkspace(data.workspace.id)
    const preserved = await localData.getPipeline(data.workspace.id, data.record.id)
    const updated = await localData.savePipeline({ ...preserved, expectedRevision: preserved.revision, expectedLibraryRevision: data.library.revision, note: 'Updated note' })
    return { workspace, records, preserved, updated, confirmation }
  }, { data, selection })
  expect(result.workspace.currentBaselineId).toBe(selection === 'ambiguous' ? undefined : data.record.id)
  expect(result.preserved).toEqual({ ...data.record, confirmation: result.confirmation })
  expect(result.updated.confirmation).toEqual(result.confirmation)
  expect(result.updated.plans).toEqual(data.record.plans)
})

test('first Save rolls back its live selection together with the record if workspace storage fails', async ({ page }) => {
  const data = await setup(page)
  const result = await page.evaluate(async data => {
    const path = '/src/data/local-data.ts', { localData } = await import(path)
    const workspace = await localData.createWorkspace('Atomic first save')
    const library = await localData.createPhase(workspace.id, { name: 'Evaluation', weeks: 4, color: '#315ed4', checks: [] })
    const original = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args) { if (this.name === 'workspaces') throw new DOMException('Storage full', 'QuotaExceededError'); return original.apply(this, args) }
    let error = ''
    try { await localData.savePipeline({ ...data.record, id: crypto.randomUUID(), workspaceId: workspace.id, plans: data.record.plans.map((plan: Project) => ({ ...plan, phases: plan.phases.map(phase => phase.kind === 'phase' ? { ...phase, libraryPhaseId: library.phases[0].id } : phase) })), expectedRevision: 0, expectedLibraryRevision: library.revision }) } catch (failure) { error = (failure as Error).message } finally { IDBObjectStore.prototype.put = original }
    return { error, workspace: await localData.getWorkspace(workspace.id), records: await localData.listPipelines(workspace.id) }
  }, data)
  expect(result.error).toContain('could not be saved')
  expect(result.workspace.currentBaselineId).toBeUndefined()
  expect(result.records).toEqual([])
})
