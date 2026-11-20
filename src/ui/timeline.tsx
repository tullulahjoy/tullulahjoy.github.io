import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { DAY, WEEK, addMonths, formatDate, isoDate, monday, parseDate } from '../domain/calendar.ts'
import { findClashes } from '../domain/scheduling.ts'
import type { OverlapRule, Plan, Selection } from '../domain/scheduling.ts'
import { PhaseSegments } from './timeline-segments.tsx'
import { bindTimelineDetails } from './timeline-details.ts'
import { ProcurementLink } from './procurement-details.tsx'
import './timeline.css'

export type TimelineWindow = { start: number; months: number | 'all' }
export type TimelineInteraction = {
  selection: Selection; onPick: (selection: Selection) => void; moving?: boolean
  overlay: (plan: Plan, frame: { start: number; end: number }, pixelsPerWeek: number) => ReactNode
}

export function Timeline({ plans, rules, onSelect, getHref, viewing = false, page = false, actions, example = false, extent, windowState, onWindowChange, hideControls = false, hideFooter = false, interaction, highlight, visiblePlanIds, labelWidths }: {
  plans: Plan[]; rules: OverlapRule[]; onSelect?: (id: string) => void; getHref?: (id: string) => string
  viewing?: boolean; page?: boolean; actions?: ReactNode; example?: boolean
  extent?: { first: number; last: number }; windowState?: { start: number; months: number | 'all' }; onWindowChange?: (window: { start: number; months: number | 'all' }) => void
  hideControls?: boolean; hideFooter?: boolean
  interaction?: TimelineInteraction
  highlight?: Selection
  visiblePlanIds?: string[]
  labelWidths?: { wide: number; narrow: number; breakpoint: number }
}) {
  const [today] = useState(() => monday(Date.now()))
  const first = extent?.first ?? (plans.length ? Math.min(...plans.flatMap(plan => plan.phases.map(phase => phase.s))) : today)
  const last = extent?.last ?? (plans.length ? Math.max(...plans.flatMap(plan => plan.phases.map(phase => phase.e))) : first + WEEK)
  const [localStart, setViewStart] = useState(first)
  const [displayedStart, setDisplayedStart] = useState(windowState?.start ?? first)
  const [localMonths, setMonths] = useState<number | 'all'>(example ? 'all' : 12)
  const viewStart = windowState?.start ?? localStart, months = windowState?.months ?? localMonths
  const [width, setWidth] = useState(900)
  const scroll = useRef<HTMLDivElement>(null)
  const helpId = useId()
  useLayoutEffect(() => {
    if (!scroll.current) return
    setWidth(Math.round(scroll.current.getBoundingClientRect().width))
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    observer.observe(scroll.current)
    return () => observer.disconnect()
  }, [])
  const full = months === 'all'
  const requested = full ? first : viewStart
  const duration = full ? last - first + 2 * WEEK : addMonths(requested, months) - requested
  const start = monday(Math.min(first - WEEK, requested))
  const end = Math.max(last + WEEK, requested + duration)
  const label = labelWidths ? width < labelWidths.breakpoint ? labelWidths.narrow : labelWidths.wide : width < 700 ? 190 : 250
  const available = Math.max(250, width - label)
  const trackWidth = full ? available : Math.max(available, Math.ceil((end - start) / duration * available))
  const perDay = trackWidth / ((end - start) / DAY)
  const findings = useMemo(() => findClashes(plans, rules), [plans, rules])
  useEffect(() => { if (scroll.current) scroll.current.scrollLeft = full ? 0 : Math.max(0, (viewStart - start) / DAY * perDay) }, [full, viewStart, start, perDay])
  const ticks: number[] = []
  const month = new Date(start)
  month.setUTCDate(1)
  if (month.getTime() < start) month.setUTCMonth(month.getUTCMonth() + 1)
  let previous = -Infinity
  for (let time = month.getTime(); time < end; time = month.getTime()) {
    const position = (time - start) / DAY * perDay
    if (position - previous > 90) { ticks.push(time); previous = position }
    month.setUTCMonth(month.getUTCMonth() + 1)
  }
  function setStart(value: number) { setViewStart(value); setDisplayedStart(value); onWindowChange?.({ start: value, months }) }
  const controls = !example && !hideControls && <div className="timeline-controls">
    <button className="button" aria-label="Previous viewing window" disabled={full} onClick={() => setStart(addMonths(displayedStart, -Number(months)))}>←</button>
    <label className="field">Viewing window<select value={months} onChange={event => { const value = event.target.value; const nextMonths = value === 'all' ? 'all' : Number(value); const nextStart = value === 'all' ? first : displayedStart; setMonths(nextMonths); setViewStart(nextStart); setDisplayedStart(nextStart); onWindowChange?.({ start: nextStart, months: nextMonths }) }}><option value={6}>Six months</option><option value={12}>One year</option><option value="all">Full pipeline plan</option></select></label>
    <label className="field">Window starts<input type="date" value={isoDate(full ? first : windowState?.start ?? displayedStart)} disabled={full} onChange={event => { const value = parseDate(event.target.value); if (Number.isFinite(value)) setStart(value) }} /></label>
    <button className="button" aria-label="Next viewing window" disabled={full} onClick={() => setStart(addMonths(displayedStart, Number(months)))}>→</button>
  </div>
  return <section className={`planning-timeline${page ? ' pipeline-timeline' : ''}${example ? ' example-timeline' : ''}`} aria-label={example ? 'Example pipeline plan' : 'Pipeline Plan timeline'}>
    {page || example ? <div className="pipeline-toolbar"><h2>{example ? 'Example pipeline plan' : 'Pipeline Plan timeline'}</h2><div className="pipeline-toolbar-actions">{controls}{actions}</div></div> : controls}
    <div className="timeline-scroll" ref={scroll} tabIndex={0} role="region" aria-label="Scrollable procurement pipeline plan" aria-describedby={hideFooter ? undefined : helpId} onScroll={event => { if (!full) setDisplayedStart(start + Math.round(event.currentTarget.scrollLeft / perDay) * DAY) }}>
      <div className="timeline-canvas" style={{ width: label + trackWidth, '--timeline-label': `${label}px`, '--timeline-week': `${perDay * 7}px` } as CSSProperties}>
        <div className="timeline-row ruler-row"><div className="timeline-label">Procurement</div><div className="timeline-track ruler">
          {ticks.map(time => <span className="timeline-tick" key={time} style={{ left: `${(time - start) / DAY * perDay}px` }}>{new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(time)}</span>)}
        </div></div>
        {plans.filter(plan => !visiblePlanIds || visiblePlanIds.includes(plan.id)).map(plan => <div className={`timeline-row${interaction?.selection.planId === plan.id ? ' selected-row' : ''}`} key={plan.id}>
          <div className="timeline-label">{onSelect ? getHref ? <ProcurementLink id={plan.id} name={plan.name} href={getHref(plan.id)} onSelect={onSelect} viewing={viewing} /> : <button className="text-button" onClick={() => onSelect(plan.id)}>{plan.name}</button> : <strong>{plan.name}</strong>}<small className="timeline-anchor-label"><span className="timeline-anchor-icon" role="img" aria-label="Anchor milestone" title="Anchor milestone">⚓︎</span>{plan.anchorName}: {formatDate(plan.anchor)}</small></div>
          <div className="timeline-track"><PhaseSegments plan={plan} frame={{ start, end }} clashes={findings} sharedTooltips bindDetails={bindTimelineDetails}
            range={interaction?.selection.planId === plan.id ? interaction.selection : highlight?.planId === plan.id ? highlight : undefined} faded={interaction?.moving}
            onPick={interaction ? index => interaction.onPick({ planId: plan.id, first: index, last: index }) : undefined} />
            {interaction?.overlay(plan, { start, end }, perDay * 7)}
          </div>
        </div>)}
      </div>
    </div>
    {!hideFooter && <div className="timeline-foot"><div className="timeline-legend"><span>Coloured blocks: phases</span><span>Diagonal split: intentional overlap within a procurement</span><span>Hatching: Christmas and New Year break or scheduled gap</span><span>◆ Milestone / anchor</span><span><i className="legend-key" aria-hidden="true" />Amber dashed outline: warning</span><span><i className="legend-key critical" aria-hidden="true" />Red solid outline: critical clash</span></div>
      <p id={helpId}>{example || !onSelect ? 'Scroll to inspect the full schedule. Hover over or focus a block for details. Tooltips can be pinned.' : viewing ? 'Scroll to inspect the saved schedule. Open a procurement’s details, or choose Edit this pipeline plan to explore changes.' : 'Scroll to inspect the schedule. Open a procurement’s name to edit it. Select or focus a block for dates and overlap details.'}</p>
    </div>}
  </section>
}
