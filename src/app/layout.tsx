import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, NavLink, Outlet, isRouteErrorResponse, useLoaderData, useLocation, useNavigate, useNavigation, useParams, useRevalidator, useRouteError, useRouteLoaderData } from 'react-router'
import { LocalDataError } from '../data/local-data.ts'
import type { Library, Workspace, WorkspaceData } from '../data/schemas.ts'
import { PipelineSessionProvider } from '../features/pipeline/pipeline-session.tsx'

const sections = {
  pipeline: 'Live Pipeline',
  library: 'Library',
  'saved-pipelines': 'Saved Pipeline Plans',
  'how-it-works': 'How it works',
}

function Frame({ children, workspace, pipelinePath, workspaceControl }: { children: ReactNode; workspace?: Workspace; pipelinePath?: string; workspaceControl?: ReactNode }) {
  const { pathname } = useLocation()
  const navigation = useNavigation()
  const main = useRef<HTMLElement>(null)
  const previousPath = useRef(pathname)
  const section = Object.entries(sections).find(([path]) => pathname.split('/').includes(path))?.[1]
  const title = `${section ?? 'Workspaces'} · LTPP`

  useEffect(() => {
    document.title = title
    const withinSavedPlans = previousPath.current !== pathname && previousPath.current.split('/')[3] === 'saved-pipelines' && pathname.split('/')[3] === 'saved-pipelines'
    if (!withinSavedPlans) main.current?.focus()
    previousPath.current = pathname
  }, [pathname, title])

  return <>
    <a className="skip-link" href="#main-content" onClick={event => {
      event.preventDefault()
      main.current?.focus()
      main.current?.scrollIntoView({ block: 'start' })
    }}>Skip to content</a>
    <header className="app-header">
      <Link className="app-brand" to={pipelinePath ?? '/workspaces'}><span>LTPP</span><span className="app-brand-description">Long-term pipeline planner</span></Link>
      <nav className="app-nav" aria-label="Main navigation">
        {workspace && Object.entries(sections).map(([path, label]) => path === 'pipeline'
          ? <Link key={path} to={pipelinePath ?? `/workspaces/${workspace.id}/pipeline`} aria-current={section === label ? 'page' : undefined}>{label}</Link>
          : <Link key={path} to={`/workspaces/${workspace.id}/${path}`} aria-current={section === label ? 'page' : undefined}>{label}</Link>)}
        {workspaceControl}
        <NavLink to="/workspaces" end>Workspaces</NavLink>
      </nav>
      <span className="local-identity">Local user</span>
    </header>
    <main id="main-content" ref={main} tabIndex={-1} aria-busy={navigation.state === 'loading'}>{children}</main>
    <footer className="app-footer">Saved on this device, in this browser. Clearing this site’s browser data removes saved workspaces. Accounts and sharing will be added later.</footer>
  </>
}

export function Layout() {
  const { workspaceId } = useParams()
  return workspaceId ? <Outlet /> : <Frame><Outlet /></Frame>
}

export function WorkspaceLayout() {
  const workspace = useLoaderData<WorkspaceData>()
  return <WorkspaceShell key={workspace.id} workspace={workspace} />
}

function WorkspaceShell({ workspace }: { workspace: WorkspaceData }) {
  const [updatedLibrary, acceptLibrary] = useState<Library | null>(null)
  const library = updatedLibrary && updatedLibrary.revision > workspace.library.revision ? updatedLibrary : workspace.library
  const context = { ...workspace, library, acceptLibrary }
  return <PipelineSessionProvider workspace={context}><WorkspaceFrame workspace={workspace}><Outlet context={context} /></WorkspaceFrame></PipelineSessionProvider>
}

function WorkspaceFrame({ workspace, children }: { workspace: Workspace; children: ReactNode }) {
  const workspaces = useRouteLoaderData<Workspace[]>('app') ?? []
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const section = Object.keys(sections).find(path => pathname.split('/').includes(path)) ?? 'pipeline'

  return <Frame workspace={workspace} pipelinePath={`/workspaces/${workspace.id}/pipeline`} workspaceControl={
      <label className="header-workspace"><span className="sr-only">Workspace</span>
        <select value={workspace.id} onChange={event => void navigate(`/workspaces/${event.target.value}/${section}`)}>
          {workspaces.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
  }>{children}</Frame>
}

export function RouteError() {
  const error = useRouteError()
  const revalidator = useRevalidator()
  const missing = isRouteErrorResponse(error) && error.status === 404
  const pipelineMissing = missing && error.data === 'Pipeline Plan not found'
  const message = missing ? pipelineMissing ? 'This pipeline plan does not exist in this workspace. Choose a saved pipeline plan from the workspace.' : 'This workspace does not exist in this browser. Choose one of your saved workspaces.'
    : error instanceof LocalDataError ? error.message : 'This page could not be loaded. Try again. Your saved data has been left unchanged.'
  return <Frame><section className="empty-state" role="alert">
    <h1>{missing ? pipelineMissing ? 'Pipeline Plan not found' : 'Workspace not found' : 'Unable to load your workspaces'}</h1>
    <p>{message}</p>
    <div className="actions">
      {!missing && <button className="button primary" disabled={revalidator.state !== 'idle'} onClick={() => void revalidator.revalidate()}>{revalidator.state === 'idle' ? 'Try again' : 'Trying again…'}</button>}
      <Link className="button" to="/workspaces">Back to workspaces</Link>
    </div>
  </section></Frame>
}

export function NotFound() {
  return <section className="empty-state"><h1>Page not found</h1><p>Choose a workspace to continue.</p><Link className="button" to="/workspaces">Back to workspaces</Link></section>
}

export function Loading() {
  return <p className="initial-loading" role="status">Loading your workspaces…</p>
}
