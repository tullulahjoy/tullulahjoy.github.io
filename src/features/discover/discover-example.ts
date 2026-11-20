import { WEEK } from '../../domain/calendar.ts'
import { scheduleProject } from '../../domain/project.ts'
import type { OverlapRule, Plan } from '../../domain/scheduling.ts'
import { librarySchema, projectSchema } from '../../data/schemas.ts'

// These records belong only to this demonstration, never to a workspace or session.
function makeExample(record: { id: string; name: string; anchor: number }): Plan {
  return scheduleProject({
    ...record, planningAnchor: 0, anchorId: 5, anchorName: 'Service begins', approvedBaseline: null,
    phases: [
      { name: 'Market engagement', weeks: 4, color: '#705aa5' },
      { name: 'Evaluation', weeks: 3, color: '#315ed4' },
      { name: 'Contract award', weeks: 1, color: '#a7622d' },
      { name: 'Mobilisation', weeks: 4, color: '#16766f' },
      { name: 'Service begins', weeks: 0, color: '#536ea1' },
    ].map((phase, index) => ({
      ...phase, id: index + 1, kind: index === 4 ? 'milestone' as const : 'phase' as const,
      libraryPhaseId: `discover-phase-${index}`, offset: 0, s: 0, e: 0,
    })),
  })
}

export const examplePlans: Plan[] = [
  { id: 'discover-community', name: 'Community services', anchor: Date.UTC(2032, 8, 6) },
  { id: 'discover-digital', name: 'Digital services', anchor: Date.UTC(2032, 8, 20) },
  { id: 'discover-facilities', name: 'Facilities support', anchor: Date.UTC(2032, 10, 29) },
].map(makeExample)

export const overviewPlans: Plan[] = [...examplePlans, ...[
  { id: 'discover-hr', name: 'HR Services', anchor: Date.UTC(2033, 3, 4) },
  { id: 'discover-waste', name: 'Waste Management', anchor: Date.UTC(2034, 6, 10) },
].map(makeExample)]

export const exampleRules: OverlapRule[] = [{
  id: 'discover-shared-team', a: 'discover-phase-1', b: 'discover-phase-1', severity: 'warning',
  reason: 'These evaluations need the same team. Review whether both can be supported at the same time.',
}]

export const exampleExtent = {
  first: Math.min(...examplePlans.flatMap(plan => plan.phases.map(phase => phase.s))),
  last: Math.max(...examplePlans.flatMap(plan => plan.phases.map(phase => phase.e))),
}

// Give the editable fixture valid domain identities, without creating any
// workspace records. Its Library is supplied directly to the shared editor.
const exampleId = (number: number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`
export const adjustmentPlans = examplePlans.map((plan, index) => projectSchema.parse({
  ...plan, id: exampleId(index + 1), nextPhaseId: 6,
  phases: plan.phases.map(phase => ({
    ...phase, libraryPhaseId: phase.kind === 'phase' ? exampleId(10 + phase.id) : '',
    durationInherited: phase.kind === 'phase',
  })),
}))
export const adjustmentLibrary = librarySchema.parse({
  schemaVersion: 1, workspaceId: exampleId(100), revision: 0,
  phases: adjustmentPlans[0].phases.filter(phase => phase.kind === 'phase').map(phase => ({
    id: phase.libraryPhaseId, name: phase.name, weeks: phase.weeks, color: phase.color,
  })),
  rules: exampleRules.map(rule => ({ ...rule, id: exampleId(101), a: exampleId(12), b: exampleId(12) })),
})

export async function loadAdjustmentLibrary() { return structuredClone(adjustmentLibrary) }

export const exampleWindow = { start: exampleExtent.first - WEEK, months: 'all' as const }
