import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { findClashes } from '../../domain/scheduling.ts'
import { FindingCard, FindingCounts } from '../../ui/findings.tsx'
import { Timeline } from '../../ui/timeline.tsx'
import type { TimelineWindow } from '../../ui/timeline.tsx'
import { closeTimelineDetails } from '../../ui/timeline-details.ts'
import { AdjustmentEditor } from '../pipeline/adjustment-dialog.tsx'
import { adjustmentLibrary, adjustmentPlans, examplePlans, exampleRules, exampleWindow, loadAdjustmentLibrary, overviewPlans } from './discover-example.ts'
import './discover.css'

const labelWidths = { wide: 200, narrow: 150, breakpoint: 600 }

export function Discover() {
  const firstExample = useRef<HTMLHeadingElement>(null)
  const [window, setWindow] = useState<TimelineWindow>({ ...exampleWindow, months: 6 })
  const [checkTeam, setCheckTeam] = useState(true)
  const [editablePlans, setEditablePlans] = useState(() => structuredClone(adjustmentPlans))
  const [editWindow, setEditWindow] = useState<TimelineWindow>(exampleWindow)
  const [adjusting, setAdjusting] = useState(false), [edited, setEdited] = useState(false)
  const rules = checkTeam ? exampleRules : []
  const findings = findClashes(examplePlans, rules)
  const editedFindings = findClashes(editablePlans, adjustmentLibrary.rules)

  return <article className="discover-page">
    <header className="discover-intro">
      <div>
        <p className="discover-product">Discover LTPP</p>
        <h1>A clearer view of your procurement pipeline.</h1>
        <p className="discover-lead">Bring your schedules together. See where activity overlaps. Explore a different plan before changing the one you use.</p>
      </div>
      <div className="discover-intro-actions">
        <Link className="button primary" to="/workspaces">Start planning</Link>
        <button className="text-button" onClick={() => { firstExample.current?.focus({ preventScroll: true }); firstExample.current?.scrollIntoView({ block: 'start', behavior: 'instant' }) }}>Try the examples below <span aria-hidden="true">↓</span></button>
      </div>
    </header>

    <p className="discover-example-note">Explore these fictional examples. You can try every control here without creating or changing a workspace.</p>

    <section className="discover-example" aria-labelledby="discover-view-heading">
      <div className="discover-story">
        <span className="discover-step">See your pipeline</span>
        <h2 id="discover-view-heading" tabIndex={-1} ref={firstExample}>One view of what’s coming.</h2>
        <p>Build each procurement from phases and milestones, then bring the schedules together on one timeline.</p>
        <p>Here, five procurements span 2032 to 2034. See what’s coming in the next six months, look a year ahead, or take in the full pipeline.</p>
        <p className="discover-try"><strong>Try it:</strong> choose ‘Six months’, ‘One year’ or ‘Full pipeline’, or use the scrollbar at the bottom to explore the timeline. Hover over a coloured phase to see its dates.</p>
      </div>
      <div className="discover-demo discover-overview" role="region" aria-label="Pipeline example">
        <div className="discover-demo-heading"><h3>A pipeline spanning 2032–2034</h3><span>Fictional example</span></div>
        <Timeline plans={overviewPlans} rules={[]} windowState={window} onWindowChange={setWindow} labelWidths={labelWidths} />
      </div>
    </section>

    <section className="discover-example" aria-labelledby="discover-clashes-heading">
      <div className="discover-story">
        <span className="discover-step">Spot potential clashes</span>
        <h2 id="discover-clashes-heading">Choose which phase overlaps to flag.</h2>
        <p>Create a Library of common phases across your procurements, and add rules to flag overlaps that matter to your team. For example, if the same team handles evaluations, add a rule to flag overlapping Evaluation phases.</p>
        <p>Warnings and critical clashes help you decide what to change. They don’t block you from saving a plan.</p>
        <label className="discover-rule"><input type="checkbox" checked={checkTeam} onChange={event => setCheckTeam(event.target.checked)} /><span>Apply this example overlap rule</span></label>
        <p className="discover-try"><strong>Try it:</strong> turn the rule off and on. The dates stay the same; the warning depends on the rule.</p>
      </div>
      <div className="discover-demo discover-demo-compact" role="region" aria-label="Clash-checking example">
        <div className="discover-demo-heading"><h3>Example rule: flag overlapping Evaluation phases</h3></div>
        <Timeline plans={examplePlans.slice(0, 2)} rules={rules} windowState={exampleWindow} hideControls labelWidths={labelWidths} />
        <div className="discover-finding" aria-live="polite" aria-atomic="true">
          <p className="discover-result">{checkTeam ? `${findings.length} ${findings.length === 1 ? 'warning' : 'warnings'} found with this rule.` : 'No rule enabled. Matching phase names alone do not trigger a warning.'}</p>
          {findings.length > 0 && <ul className="discover-finding-list">{findings.map(finding => <FindingCard finding={finding} key={finding.key} />)}</ul>}
        </div>
      </div>
    </section>

    <section className="discover-example" aria-labelledby="discover-adjust-heading">
      <div className="discover-story">
        <span className="discover-step">Explore alternatives</span>
        <h2 id="discover-adjust-heading">Try a different way forward.</h2>
        <p>Move a whole procurement, one phase or a group of phases. You can also change how long a phase lasts.</p>
        <p>Choose <strong>Adjust pipeline plan</strong> to try the same editing controls used on your Live Pipeline Plan.</p>
        <p className="discover-try">Select what to adjust, then drag it or use the controls. Review and apply your changes to this example only. Reset it whenever you like.</p>
        <p>In the app, <strong>Save as</strong> keeps an alternative without changing your live plan.</p>
      </div>
      <div className="discover-demo discover-demo-compact" role="region" aria-label="Editable pipeline example">
        <div className="discover-demo-heading"><h3>Example Live Pipeline Plan</h3><span>Fictional example</span></div>
        <div className="discover-edit-actions">
          <button className="button primary" onClick={() => { closeTimelineDetails(); setAdjusting(true) }}>Adjust pipeline plan</button>
          <button className="text-button" disabled={!edited} onClick={() => { closeTimelineDetails(); setEditablePlans(structuredClone(adjustmentPlans)); setEditWindow(exampleWindow); setEdited(false) }}>Reset example</button>
        </div>
        <Timeline plans={editablePlans} rules={adjustmentLibrary.rules} windowState={editWindow} onWindowChange={setEditWindow} labelWidths={labelWidths} />
        <div className="discover-edit-status" role="status"><p>{edited ? 'Your adjustments are applied to this example only.' : 'Try an adjustment. Your workspaces and saved plans stay unchanged.'}</p><FindingCounts findings={editedFindings} /></div>
      </div>
    </section>

    {adjusting && <AdjustmentEditor initial={editablePlans} initialLibrary={adjustmentLibrary} loadLibrary={loadAdjustmentLibrary} window={editWindow} onWindowChange={setEditWindow} onClose={() => setAdjusting(false)} onApply={changes => {
      setEditablePlans(previous => previous.map(plan => changes.find(change => change.id === plan.id) ?? plan))
      setEdited(true); setAdjusting(false)
    }} reviewNote="Applying updates this fictional example only. Nothing is saved to a workspace. Use Reset example afterwards to start again." />}

    <section className="discover-start" aria-labelledby="discover-start-heading">
      <div><h2 id="discover-start-heading">Build a pipeline for your team.</h2><p>Start with a workspace. Create your Library and reusable procurement templates, then build your live pipeline plan.</p><p className="discover-storage-note">Your plans are saved in this browser, on this device.</p></div>
      <Link className="button primary" to="/workspaces">Start planning</Link>
    </section>
  </article>
}
