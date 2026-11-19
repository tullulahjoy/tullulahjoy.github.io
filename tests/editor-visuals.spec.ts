import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { moveRow } from './editor-actions.ts'

async function setup(page: Page) {
  await page.goto('/workspaces')
  return page.evaluate(async () => {
    const path = '/src/data/local-data.ts', projectPath = '/src/domain/project.ts'
    const { localData } = await import(path), { scheduleProject } = await import(projectPath)
    const workspace = await localData.createWorkspace('Visual review')
    for (const [name, weeks, color] of [['Dialogue', 4, '#705aa5'], ['Bid writing', 6, '#315ed4'], ['Evaluation', 4, '#16766f'], ['Moderation', 2, '#a7622d'], ['Contract award', 2, '#3a6496'], ['Mobilisation', 24, '#bf302f']]) {
      await localData.createPhase(workspace.id, { name, weeks, color, checks: [] })
    }
    const library = await localData.getLibrary(workspace.id)
    const phases = [...library.phases.map((phase: { id: string }, index: number) => ({ ...phase, id: index + 1, kind: 'phase', libraryPhaseId: phase.id, durationInherited: true, offset: 0 })),
      { id: 7, name: 'Service begins', kind: 'milestone', weeks: 0, color: '#536ea1', libraryPhaseId: '', durationInherited: false, offset: 0 }]
    await localData.saveTemplate(workspace.id, crypto.randomUUID(), 0, library.revision, { name: 'Service transfer', description: '', anchorId: 7, phases })
    const project = scheduleProject({ id: crypto.randomUUID(), name: 'Community services', anchor: Date.UTC(2032, 4, 12), planningAnchor: 0, anchorId: 7, anchorName: 'Service begins', nextPhaseId: 8, approvedBaseline: null, phases: phases.map(phase => ({ ...phase, s: 0, e: 0 })) })
    const record = await localData.savePipeline({ id: crypto.randomUUID(), workspaceId: workspace.id, expectedRevision: 0, expectedLibraryRevision: library.revision, name: 'Autumn pipeline plan', note: 'Visual reference', plans: [project], acknowledgements: [] })
    localStorage.setItem(`ltpp-app:welcome-dismissed:${workspace.id}`, '1')
    const alternative = await localData.savePipeline({ ...record, id: crypto.randomUUID(), name: 'Alternative', expectedRevision: 0, expectedLibraryRevision: library.revision })
    return { workspace, library, record, alternative }
  })
}

for (const width of [390, 1440]) {
  test(`template anchor, feedback and footer have distinct aligned groups at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    const data = await setup(page)
    await page.goto(`/workspaces/${data.workspace.id}/library?section=templates`)
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await moveRow(page, 4, 3)
    const editor = page.locator('.template-editor')
    await expect(editor.locator('.schedule-bottom-tools [role=status]')).toContainText('Contract award moved to position 4')
    await expect(editor.getByLabel('Anchor milestone', { exact: true })).toHaveValue('7')
    const anchor = (await editor.locator('.template-anchor select').boundingBox())!
    expect(anchor.width).toBeLessThanOrEqual(420)
    const save = (await editor.getByRole('button', { name: 'Save template', exact: true }).boundingBox())!
    const add = (await editor.locator('.schedule-bottom-add').getByRole('button', { name: '+ Add milestone', exact: true }).boundingBox())!
    expect(Math.abs(save.x + save.width - add.x - add.width)).toBeLessThan(2)
    expect((await editor.locator('.template-actions').boundingBox())!.y).toBeGreaterThan(anchor.y + anchor.height)
    await editor.getByRole('button', { name: 'Save template', exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath('template-footer.png') })
    await editor.getByRole('button', { name: 'Save template', exact: true }).click()
    await expect(page.getByText('Template saved. Existing procurements are unchanged.', { exact: true })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Anchor', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await expect(page.getByLabel('Anchor milestone', { exact: true })).toHaveValue('7')
  })

  test(`viewing, editing and live Pipeline Plan states retain layout and distinct original colour roles at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    const data = await setup(page)
    const reference = await page.context().newPage()
    await reference.goto('/mockups/pipeline.html')
    await expect(reference.locator('#pipeline-context')).toHaveAttribute('data-state', 'live')
    const appearance = (element: Element) => { const style = getComputedStyle(element); return { background: style.backgroundColor, border: style.borderTopColor, padding: style.padding, radius: style.borderRadius } }
    const label = (element: Element) => { const style = getComputedStyle(element); return { color: style.color, weight: style.fontWeight } }
    const colours: string[] = []
    for (const state of ['viewing', 'editing', 'live']) {
      await page.goto(state === 'live' ? `/workspaces/${data.workspace.id}/pipeline` : `/workspaces/${data.workspace.id}/pipeline/${data.alternative.id}${state === 'editing' ? '?edit=1' : ''}`)
      await reference.setViewportSize({ width, height: 900 })
      await reference.locator('#pipeline-context').evaluate((el, state) => el.setAttribute('data-state', state), state)
      const panel = page.getByRole('region', { name: 'Pipeline Plan context', exact: true })
      await expect(panel).toHaveAttribute('data-state', state)
      const style = await panel.evaluate(appearance)
      const referenceStyle = await reference.locator('#pipeline-context').evaluate(appearance)
      expect({ padding: style.padding, radius: style.radius }).toEqual({ padding: referenceStyle.padding, radius: referenceStyle.radius })
      const contextLabel = await panel.locator('.context-label').evaluate(label)
      expect(contextLabel.weight).toBe((await reference.locator('.context-label').evaluate(label)).weight)
      expect(contextLabel.color).toBe(state === 'viewing' ? 'rgb(92, 110, 133)' : state === 'editing' ? 'rgb(107, 79, 134)' : 'rgb(49, 94, 212)')
      colours.push(style.background)
      if (state === 'editing') {
        await expect(panel.getByRole('button', { name: 'Save', exact: true })).toHaveCSS('background-color', 'rgb(107, 79, 134)')
        await expect(panel.getByRole('button', { name: 'Exit edit mode', exact: true })).toBeVisible()
        await expect(page.getByRole('button', { name: '+ Add procurement', exact: true })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Adjust pipeline plan', exact: true })).toBeVisible()
      } else await expect(panel.getByRole('link', { name: state === 'live' ? 'Edit live plan' : 'Edit this pipeline plan', exact: true })).toBeVisible()
      await page.screenshot({ path: testInfo.outputPath(`${state}-pipeline.png`) })
    }
    expect(new Set(colours).size).toBe(3)
    await expect(page.locator('main')).not.toContainText(/(?:actual|usual) anchor/i)
    await expect(page.getByRole('columnheader', { name: 'Anchor date', exact: true })).toBeAttached()
    await reference.close()
  })
}
