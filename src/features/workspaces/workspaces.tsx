import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Form, Link, useActionData, useNavigation, useRevalidator, useRouteLoaderData } from 'react-router'
import type { Workspace } from '../../data/schemas.ts'
import { localData } from '../../data/local-data.ts'
import { Dialog, ErrorMessage } from '../../ui/dialog.tsx'
import { useListReorder } from '../../ui/use-list-reorder.ts'

export interface WorkspaceActionResult {
  name: string
  fieldError?: string
  error?: string
}

const emptyWorkspaces: Workspace[] = []
type ManagementFocus = { kind: 'delete'; id: string; index: number } | { kind: 'move'; id: string; button: HTMLButtonElement; order: string[] }

export function Workspaces() {
  const workspaces = useRouteLoaderData<Workspace[]>('app') ?? emptyWorkspaces
  const result = useActionData<WorkspaceActionResult>()
  const navigation = useNavigation()
  const revalidator = useRevalidator()
  const error = useRef<HTMLParagraphElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const createInput = useRef<HTMLInputElement>(null)
  const mutation = useRef(false)
  const managementFocus = useRef<ManagementFocus | null>(null)
  const [pending, setPending] = useState(false)
  const [managementError, setManagementError] = useState('')
  const [status, setStatus] = useState('')
  const [deleting, setDeleting] = useState<Workspace | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const saving = navigation.state !== 'idle'

  useEffect(() => {
    if (result) error.current?.focus()
  }, [result])
  useLayoutEffect(() => {
    const focus = managementFocus.current
    if (pending || deleting || !focus) return
    if (focus.kind === 'delete' && workspaces.some(workspace => workspace.id === focus.id)) return
    if (focus.kind === 'move' && JSON.stringify(workspaces.map(workspace => workspace.id)) !== JSON.stringify(focus.order)) return
    const frame = requestAnimationFrame(() => {
      let target: HTMLElement | null | undefined
      if (focus.kind === 'delete') {
        const links = list.current?.querySelectorAll<HTMLAnchorElement>('li > a')
        target = links?.[Math.min(focus.index, links.length - 1)] ?? createInput.current
      } else target = focus.button.isConnected && !focus.button.disabled ? focus.button : list.current?.querySelector<HTMLAnchorElement>(`li[data-workspace-id="${focus.id}"] a`)
      managementFocus.current = null
      target?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [pending, deleting, workspaces])

  async function move(from: number, to: number) {
    if (mutation.current) return
    const workspace = workspaces[from]
    const button = list.current?.querySelector<HTMLButtonElement>(`button[data-drag-item="${workspace.id}"]`)
    if (!button) return
    mutation.current = true; setPending(true); setManagementError(''); setStatus('Saving workspace order...')
    try {
      const ordered = await localData.reorderWorkspace(workspace.id, to, workspaces.map(item => item.id))
      managementFocus.current = { kind: 'move', id: workspace.id, button, order: ordered.map(item => item.id) }
      await revalidator.revalidate()
      setStatus(`Moved ${workspace.name} to position ${ordered.findIndex(item => item.id === workspace.id) + 1} of ${ordered.length}.`)
    } catch (error) { setStatus(''); setManagementError(error instanceof Error ? error.message : 'The workspace order could not be saved. Try again.') }
    finally {
      mutation.current = false; setPending(false)
    }
  }

  async function remove() {
    if (!deleting || mutation.current) return
    mutation.current = true; setPending(true); setDeleteError(''); setManagementError(''); setStatus('')
    const workspace = deleting, index = workspaces.findIndex(item => item.id === workspace.id)
    try {
      await localData.deleteWorkspace(workspace.id, workspace.name)
      await revalidator.revalidate()
      managementFocus.current = { kind: 'delete', id: workspace.id, index }
      setDeleting(null); setStatus(`Deleted ${workspace.name}.`)
    } catch (error) { setDeleteError(error instanceof Error ? error.message : 'The workspace could not be deleted. Try again.') }
    finally { mutation.current = false; setPending(false) }
  }

  const { scroll, status: reorderStatus } = useListReorder(workspaces, (from, to) => void move(from, to), {
    disabled: pending || saving || Boolean(deleting) || workspaces.length < 2, containerName: 'list', orderName: 'workspace', announceMove: false,
  })

  return <>
    <div className="page-heading"><h1>Your workspaces</h1><p>Each workspace has its own Library, Procurement Templates and Live Pipeline Plan.</p></div>
    <div className="workspaces-layout">
      <section className="workspace-list" aria-labelledby="workspace-list-heading">
        <h2 id="workspace-list-heading">{workspaces.length ? 'Choose a workspace' : 'Create your first workspace'}</h2>
        <ErrorMessage message={managementError} />
        {managementError && <button className="button" disabled={pending || saving} onClick={() => void revalidator.revalidate()}>Refresh workspaces</button>}
        {status && <p className="workspace-status" role="status">{status}</p>}
        <p className="sr-only" role="status">{reorderStatus}</p>
        {workspaces.length ? <div ref={scroll} className="workspace-reorder"><ul ref={list}>{workspaces.map(workspace => <li key={workspace.id} data-workspace-id={workspace.id} data-item-id={workspace.id}>
          <button type="button" className="workspace-icon-button workspace-grip" data-drag-item={workspace.id} aria-pressed={false} disabled={pending || saving || Boolean(deleting) || workspaces.length < 2}
            aria-label={`Reorder ${workspace.name}`} title="Drag to reorder" aria-describedby="workspace-reorder-help">
            <svg width="16" height="20" viewBox="0 0 16 20" fill="currentColor" aria-hidden="true"><circle cx="5" cy="4" r="1.5" /><circle cx="11" cy="4" r="1.5" /><circle cx="5" cy="10" r="1.5" /><circle cx="11" cy="10" r="1.5" /><circle cx="5" cy="16" r="1.5" /><circle cx="11" cy="16" r="1.5" /></svg>
          </button>
          <Link to={`/workspaces/${workspace.id}/pipeline`}><strong>{workspace.name}</strong></Link>
          <button type="button" className="workspace-icon-button workspace-delete" aria-label={`Delete ${workspace.name}`} title={`Delete ${workspace.name}`} disabled={pending || saving}
            onClick={() => { setDeleting(workspace); setDeleteError('') }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" /></svg>
          </button>
        </li>)}</ul><p id="workspace-reorder-help" className="sr-only">Drag a grip to reorder workspaces. With the keyboard, press Space or Enter to pick up, use Up or Down, Home or End to choose a position, then Space or Enter to drop. Escape cancels.</p></div> : <p>Each workspace has its own procurement pipeline. Keep alternative plans for that pipeline together in the same workspace.</p>}
      </section>
      <section className="create-workspace" aria-labelledby="create-heading">
        <h2 id="create-heading">Create a workspace</h2>
        <Form method="post" action="/workspaces" aria-busy={saving}>
          <label className="field" htmlFor="workspace-name">Workspace name</label>
          <p className="field-hint" id="name-hint">For example, Community services team.</p>
          <input ref={createInput} id="workspace-name" name="name" type="text" required maxLength={80} defaultValue={result?.name ?? ''} autoComplete="off" aria-invalid={Boolean(result?.fieldError)} aria-describedby={`name-hint${result?.fieldError ? ' workspace-error' : ''}`} />
          {(result?.fieldError || result?.error) && <p className="form-error" id="workspace-error" role="alert" tabIndex={-1} ref={error}>{result.fieldError ?? result.error}</p>}
          <button className="button primary" type="submit" disabled={saving || pending}>{saving ? 'Creating workspace…' : 'Create workspace'}</button>
        </Form>
      </section>
    </div>
    {deleting && <Dialog title={`Delete “${deleting.name}”?`} alert busy={pending} onClose={() => setDeleting(null)} className="flow-dialog" footer={<>
      <button className="button" data-autofocus disabled={pending} onClick={() => setDeleting(null)}>Cancel</button>
      <button className="button danger" disabled={pending} onClick={() => void remove()}>{pending ? 'Deleting...' : 'Delete workspace'}</button>
    </>}>
      <p>Deleting <strong>{deleting.name}</strong> permanently removes its Library, Procurement Templates, Live Pipeline Plan, saved pipeline plans and unfinished procurement draft from this browser.</p>
      <p>This cannot be undone.</p>
      <ErrorMessage message={deleteError} />
    </Dialog>}
  </>
}
