import { useLayoutEffect, useRef, useState } from 'react'
import { useBeforeUnload } from 'react-router'
import { ZodError } from 'zod'
import type { Library, Project, SavedPipeline } from '../../data/schemas.ts'
import { projectSchema } from '../../data/schemas.ts'
import { localData } from '../../data/local-data.ts'
import { useWorkspace } from '../../app/workspace-context.ts'
import { changePhaseDuration, dateChanges, defaultSelection, finishDate, moveSelection, selectedBounds } from '../../domain/scheduling.ts'
import type { Plan, Selection } from '../../domain/scheduling.ts'
import { formatDate } from '../../domain/calendar.ts'
import { Dialog, ErrorMessage } from '../../ui/dialog.tsx'
import { closeTimelineDetails } from '../../ui/timeline-details.ts'
import { useLeaveProtection } from '../../ui/use-leave-protection.ts'
import type { TimelineWindow } from '../../ui/timeline.tsx'
import { AdjustmentTimeline } from './adjustment-timeline.tsx'
import { PhaseActionTabs, PhaseDurationControls } from './adjustment-controls.tsx'
import { AdjustmentDates, AdjustmentFindings } from './adjustment-review.tsx'
import './adjustment.css'

type Mode = 'whole' | 'phase' | 'range'
function failureMessage(failure: unknown) {
  if (failure instanceof ZodError) return failure.issues.some(issue => issue.path.includes('offset'))
    ? 'This adjustment would create a timing relationship outside the supported 104-week range. Choose a smaller movement.'
    : failure.issues.map(issue => issue.message).join(' ')
  return failure instanceof Error ? failure.message : 'This change could not be calculated. Your changes are still here.'
}
export function AdjustmentDialog({ initial, saved, window, onWindowChange, onClose, onApply }: {
  initial: Project[]; saved: SavedPipeline | null; window: TimelineWindow; onWindowChange: (next: TimelineWindow) => void
  onClose: () => void; onApply: (plans: Project[]) => void
}) {
  const workspace = useWorkspace()
  async function loadLibrary() {
    const [library, record] = await Promise.all([localData.getLibrary(workspace.id), saved ? localData.getPipeline(workspace.id, saved.id) : Promise.resolve(null)])
    if (saved && (!record || record.revision !== saved.revision)) throw new Error('This saved pipeline plan changed in another tab. Your adjustments are still here. Close this adjustment and reopen the latest saved plan before applying changes.')
    workspace.acceptLibrary(library)
    return library
  }
  return <AdjustmentEditor initial={initial} initialLibrary={workspace.library} loadLibrary={loadLibrary} window={window} onWindowChange={onWindowChange} onClose={onClose} onApply={onApply} />
}

// The editor owns only its draft. Its caller supplies the Library and decides
// where applied changes go, allowing the same controls to run without storage.
export function AdjustmentEditor({ initial, initialLibrary, loadLibrary, window, onWindowChange, onClose, onApply, reviewNote = 'This applies adjustments to the open pipeline plan. Use Save in the editing window to update the named plan, or Save as to keep a separate alternative.' }: {
  initial: Project[]; initialLibrary: Library; loadLibrary: () => Promise<Library>
  window: TimelineWindow; onWindowChange: (next: TimelineWindow) => void
  onClose: () => void; onApply: (plans: Project[]) => void; reviewNote?: string
}) {
  const [before] = useState(() => structuredClone(initial))
  const [draft, setDraft] = useState(before), [history, setHistory] = useState<Project[][]>([])
  const [selection, setSelection] = useState(() => defaultSelection(before[0]))
  const [mode, setMode] = useState<Mode>(before[0].phases.some(phase => phase.kind === 'phase') ? 'range' : 'whole')
  const [allowAnchor, setAllowAnchor] = useState(false), [reviewing, setReviewing] = useState(false)
  const [amount, setAmount] = useState('4'), [direction, setDirection] = useState(-1), [error, setError] = useState(''), [message, setMessage] = useState('')
  const [discard, setDiscard] = useState(false), [busy, setBusy] = useState(false)
  const [library, setLibrary] = useState(initialLibrary)
  const [reviewRevision, setReviewRevision] = useState<number | null>(null)
  const lock = useRef(false), content = useRef<HTMLDivElement>(null), datesHeading = useRef<HTMLHeadingElement>(null)
  const changes = dateChanges(before, draft), dirty = changes.length > 0
  const plan = draft.find(plan => plan.id === selection.planId)!, bounds = selectedBounds(plan, selection)
  const anchorIncluded = plan.phases.slice(selection.first, selection.last + 1).some(phase => phase.id === plan.anchorId)
  const hasPhases = plan.phases.some(phase => phase.kind === 'phase')
  useLeaveProtection(dirty, onClose)
  useBeforeUnload(event => { if (dirty) { event.preventDefault(); event.returnValue = '' } })
  useLayoutEffect(() => {
    closeTimelineDetails()
    if (reviewing) datesHeading.current?.focus({ preventScroll: true })
    const node = reviewing ? datesHeading.current : content.current
    if (reviewing) node?.scrollIntoView({ block: 'start' })
    else content.current?.closest('dialog')?.querySelector<HTMLElement>('header h2')?.focus({ preventScroll: true })
  }, [reviewing])
  async function reviewOrApply(apply: boolean) {
    if (lock.current) return
    lock.current = true; setBusy(true); setError(''); closeTimelineDetails()
    try {
      const nextLibrary = await loadLibrary()
      setLibrary(nextLibrary)
      if (apply && nextLibrary.revision !== reviewRevision) {
        setReviewing(false); setReviewRevision(null)
        setError('The Library changed. Clash checks have been refreshed. Review the changes again before applying your adjustments.'); return
      }
      const validated = draft.map(plan => projectSchema.parse(plan))
      if (apply) {
        const changedIds = new Set(changes.map(change => change.planId))
        onApply(validated.filter(plan => changedIds.has(plan.id)))
      }
      else { setReviewRevision(nextLibrary.revision); setReviewing(true) }
    } catch (failure) { setError(failureMessage(failure)) }
    finally { lock.current = false; setBusy(false) }
  }
  function commit(calculate: () => Plan[], description: string) {
    try {
      const next = calculate().map(candidate => {
        const original = draft.find(plan => plan.id === candidate.id)!
        return projectSchema.parse({ ...original, ...candidate, phases: candidate.phases.map(phase => ({ ...phase, durationInherited: original.phases.find(item => item.id === phase.id)!.weeks === phase.weeks ? original.phases.find(item => item.id === phase.id)!.durationInherited : false })) })
      })
      if (!dateChanges(draft, next).length) return ''
      closeTimelineDetails(); setHistory(previous => [...previous, draft]); setDraft(next); setMessage(description); setError(''); setReviewRevision(null)
      return ''
    } catch (failure) { const message = failureMessage(failure); setMessage(''); setError(message); return message }
  }
  function move(next: Selection, weeks: number) { commit(() => moveSelection(draft, next, weeks, allowAnchor), `Selected activity moved ${Math.abs(weeks)} ${Math.abs(weeks) === 1 ? 'week' : 'weeks'} ${weeks < 0 ? 'earlier' : 'later'}. Dates and clash checks refreshed.`) }
  function select(next: Selection) {
    if (next.planId !== selection.planId) setAllowAnchor(false)
    const nextPlan = draft.find(plan => plan.id === next.planId)!
    setSelection(next); setMode(!nextPlan.phases.some(phase => phase.kind === 'phase') ? 'whole' : next.first === next.last ? 'phase' : 'range'); setError('')
  }
  function changeMode(next: Mode) {
    setMode(next); setError('')
    setSelection(next === 'whole' ? { planId: plan.id, first: 0, last: plan.phases.length - 1 } : next === 'phase' ? { planId: plan.id, first: plan.phases.findIndex(phase => phase.kind === 'phase'), last: plan.phases.findIndex(phase => phase.kind === 'phase') } : defaultSelection(plan))
  }
  function cancel() {
    closeTimelineDetails()
    if (dirty) setDiscard(true)
    else onClose()
  }
  const anchor = <section className="anchor-box"><h4>{allowAnchor ? 'Anchor movement allowed' : 'Anchor locked'}</h4><p>{plan.anchorName}<strong>{formatDate(plan.anchor)}</strong></p><small>Plotted on Monday {formatDate(plan.planningAnchor)}.</small>{anchorIncluded ? <label className="anchor-permission"><input type="checkbox" checked={allowAnchor} onChange={event => { setAllowAnchor(event.target.checked); setError('') }} />Allow this procurement's anchor date to move</label> : <small>The selected range leaves this anchor in place.</small>}</section>
  const movement = <form className="movement-form" onSubmit={event => { event.preventDefault(); move(selection, direction * Number(amount)) }}><h4>Move by an exact amount</h4><div className="movement-inputs"><select aria-label="Movement direction" value={direction} onChange={event => setDirection(Number(event.target.value))}><option value={-1}>Earlier</option><option value={1}>Later</option></select><input aria-label="Number of weeks" type="number" min={1} max={104} step={1} required value={amount} onChange={event => setAmount(event.target.value)} /><span>weeks</span></div><button className="button" type="submit">Apply movement</button></form>
  return <>
    <Dialog title="Adjust pipeline plan" eyebrow="Pipeline adjustment" headerAside={<span className="adjustment-draft-badge">{dirty ? 'Unsaved adjustments' : 'No changes yet'}</span>} onClose={cancel} onEscape={() => { if (reviewing) { closeTimelineDetails(); setReviewing(false) } else cancel() }} busy={busy} wide focusTitle className="adjustment-dialog" footer={<>
      <button className="button" disabled={busy} onClick={cancel}>Cancel adjustment</button>
      <button className="button" disabled={busy || !history.length || reviewing} onClick={() => { closeTimelineDetails(); setDraft(history.at(-1)!); setHistory(previous => previous.slice(0, -1)); setError(''); setMessage('Last change undone. Dates, durations and clash checks refreshed.') }}>Undo last change</button>
      <span className="adjustment-change-count">{changes.length ? `${changes.length} changed ${changes.length === 1 ? 'entry' : 'entries'}` : 'Make an adjustment to review changes.'}</span>
      <button className="button primary" disabled={!dirty || busy} title={!dirty ? 'Move activity or change a phase duration before reviewing changes.' : undefined} onClick={() => void reviewOrApply(reviewing)}>{busy ? 'Checking...' : reviewing ? 'Apply adjustments' : 'Review changes'}</button>
    </>}>
      <div className="adjustment-body" ref={content} inert={busy} aria-busy={busy}>
        <div className="adjustment-board">
          {reviewing && <nav className="adjustment-review-nav" aria-label="Adjustment review sections">{[['adjustment-visual', 'Pipeline visual'], ['adjustment-dates', 'Date and duration changes']].map(([id, label]) => <button type="button" key={id} onClick={() => { const target = id === 'adjustment-dates' ? datesHeading.current : content.current?.querySelector<HTMLElement>(`#${id}`); target?.focus({ preventScroll: true }); target?.scrollIntoView({ block: 'start' }) }}>{label}</button>)}</nav>}
          <section id="adjustment-visual" tabIndex={-1} aria-label="Pipeline visual"><p className="adjustment-board-intro help">{reviewing ? 'Review the proposed pipeline plan. The date and duration changes table is below.' : 'Drag the Move selection handle to move activity. Select One phase to change its duration.'}</p><AdjustmentTimeline plans={draft} rules={library.rules} selection={selection} allowAnchor={allowAnchor} window={window} onWindowChange={onWindowChange} onSelect={select} onMove={move} onError={message => { setMessage(''); setError(message) }} reviewing={reviewing} /></section>
          <p className="adjustment-board-help help">Move activity or change a phase's duration in whole weeks. Christmas pauses are recalculated. Use the controls for precise or keyboard-only changes.</p>
          {reviewing && <AdjustmentDates before={before} after={draft} headingRef={datesHeading} />}
        </div>
        <aside className="adjustment-controls" aria-label={reviewing ? 'Adjustment review' : 'Adjustment controls'}>
          {reviewing ? <><h3>Review changes</h3><p>{new Set(changes.map(change => change.planId)).size} {new Set(changes.map(change => change.planId)).size === 1 ? 'procurement has' : 'procurements have'} changed. The table shows changed dates, phase durations, anchors and adjustment gaps.</p><p className="info-box">{reviewNote}</p><button className="button" onClick={() => setReviewing(false)}>Back to adjusting</button></> : <>
            <h3>Choose what to adjust</h3><label className="field-label">Procurement<select value={plan.id} onChange={event => { const next = draft.find(plan => plan.id === event.target.value)!; select(defaultSelection(next)); setMode(next.phases.some(phase => phase.kind === 'phase') ? 'range' : 'whole') }}>{draft.map(plan => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>
            <fieldset className="mode-choice"><legend>Selection</legend>{([['whole', 'Whole procurement'], ['phase', 'One phase'], ['range', 'Phase range']] as const).map(([value, label]) => <label key={value}><input type="radio" name="adjustment-mode" checked={mode === value} disabled={value !== 'whole' && !hasPhases} onChange={() => changeMode(value)} />{label}</label>)}</fieldset>
            {!hasPhases && <p className="help">This procurement contains milestones only. Select the whole procurement to move it.</p>}
            {mode !== 'whole' && <div className="range-fields"><label className="field-label">{mode === 'phase' ? 'Phase' : 'From phase'}<select value={selection.first} onChange={event => { const first = Number(event.target.value); setSelection({ ...selection, first, last: mode === 'phase' ? first : Math.max(first, selection.last) }); setError('') }}>{plan.phases.map((phase, index) => phase.kind === 'phase' && <option value={index} key={phase.id}>{phase.name}</option>)}</select></label>{mode === 'range' && <label className="field-label">Through to phase<select value={selection.last} onChange={event => { setSelection({ ...selection, last: Number(event.target.value) }); setError('') }}>{plan.phases.map((phase, index) => phase.kind === 'phase' && index >= selection.first && <option value={index} key={phase.id}>{phase.name}</option>)}</select></label>}</div>}
            <div className="selection-summary"><strong>Selected activity</strong><p>{plan.phases[selection.first].name}{selection.last !== selection.first && ` through to ${plan.phases[selection.last].name}`}</p><small>{formatDate(bounds.s)} to {formatDate(Math.max(...plan.phases.slice(selection.first, selection.last + 1).map(finishDate)))}</small></div>
            {mode === 'phase' ? <PhaseActionTabs key={`${plan.id}:${selection.first}`} anchor={anchor} movement={movement} onActionChange={() => setError('')} duration={<PhaseDurationControls key={`${plan.id}:${selection.first}:${plan.phases[selection.first].s}:${plan.phases[selection.first].e}:${plan.phases[selection.first].weeks}`} phase={plan.phases[selection.first]} onApply={(weeks, keep) => commit(() => changePhaseDuration(draft, selection, weeks, keep, before), 'Phase duration changed. Dates and clash checks refreshed.')} />} /> : <>{anchor}{movement}</>}
          </>}
          <ErrorMessage message={error} /><p className="help" role="status">{message}</p>
          <AdjustmentFindings before={before} after={draft} rules={library.rules} />
        </aside>
      </div>
    </Dialog>
    {discard && <Dialog title="Discard these adjustments?" alert onClose={() => setDiscard(false)} className="flow-dialog adjustment-discard" footer={<><button className="button" data-autofocus onClick={() => setDiscard(false)}>Keep editing</button><button className="button danger" onClick={onClose}>Discard adjustments</button></>}><p>Your unsaved adjustments will be lost. The pipeline plan will stay as it was before this adjustment session.</p></Dialog>}
  </>
}
