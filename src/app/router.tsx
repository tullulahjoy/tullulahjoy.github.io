import { createBrowserRouter, createHashRouter, redirect } from 'react-router'
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router'
import { localData, LocalDataError } from '../data/local-data.ts'
import { workspaceNameSchema } from '../data/schemas.ts'
import { Workspaces } from '../features/workspaces/workspaces.tsx'
import type { WorkspaceActionResult } from '../features/workspaces/workspaces.tsx'
import { Layout, Loading, NotFound, RouteError, WorkspaceLayout } from './layout.tsx'

async function loadWorkspace({ params }: LoaderFunctionArgs) {
  const workspace = await localData.getWorkspace(params.workspaceId ?? '')
  if (!workspace) throw new Response('Workspace not found', { status: 404 })
  const library = await localData.getLibrary(workspace.id)
  return { ...workspace, library }
}

async function createWorkspace({ request }: ActionFunctionArgs): Promise<WorkspaceActionResult | Response> {
  const form = await request.formData()
  const name = String(form.get('name') ?? '')
  const checked = workspaceNameSchema.safeParse(name)
  if (!checked.success) return { name, fieldError: checked.error.issues[0]?.message ?? 'Enter a workspace name.' }
  try {
    const workspace = await localData.createWorkspace(checked.data)
    return redirect(`/workspaces/${workspace.id}/pipeline`)
  } catch (error) {
    return { name, error: error instanceof LocalDataError ? error.message : 'The workspace could not be saved. Try again.' }
  }
}

// GitHub Pages cannot serve application paths directly. Other hosts keep clean URLs.
const createRouter = import.meta.env.VITE_ROUTER_MODE === 'hash' ? createHashRouter : createBrowserRouter

export const router = createRouter([{
  id: 'app',
  path: '/',
  Component: Layout,
  loader: () => localData.listWorkspaces(),
  ErrorBoundary: RouteError,
  HydrateFallback: Loading,
  children: [
    { index: true, loader: () => redirect('/workspaces'), element: <Loading /> },
    { path: 'discover', lazy: async () => ({ Component: (await import('../features/discover/discover.tsx')).Discover }) },
    { path: 'workspaces', action: createWorkspace, Component: Workspaces },
    {
      id: 'workspace',
      path: 'workspaces/:workspaceId',
      loader: loadWorkspace,
      Component: WorkspaceLayout,
      children: [
        { index: true, loader: ({ params }) => redirect(`/workspaces/${params.workspaceId}/pipeline`), element: <Loading /> },
        { path: 'pipeline/:pipelineId?', lazy: async () => ({ Component: (await import('../features/pipeline/pipeline.tsx')).PipelineRoute }), loader: async ({ params, request }) => {
          if (!params.pipelineId) {
            const workspace = await localData.getWorkspace(params.workspaceId!)
            if (!workspace?.currentBaselineId) return null
            const live = await localData.getPipeline(workspace.id, workspace.currentBaselineId)
            if (!live) throw new LocalDataError('The live pipeline plan could not be loaded. Your saved data has been left unchanged. Try again or open Saved Pipeline Plans.')
            return live
          }
          const record = await localData.getPipeline(params.workspaceId!, params.pipelineId)
          if (!record) throw new Response('Pipeline Plan not found', { status: 404 })
          const workspace = await localData.getWorkspace(params.workspaceId!)
          const query = new URL(request.url).search
          if (record.id !== workspace?.currentBaselineId) return redirect(`/workspaces/${params.workspaceId}/saved-pipelines/${record.id}${query}`)
          return redirect(`/workspaces/${params.workspaceId}/pipeline${query}`)
        } },
        { path: 'library', lazy: async () => ({ Component: (await import('../features/library/library.tsx')).Library }) },
        { path: 'saved-pipelines/:pipelineId?', lazy: async () => ({ Component: (await import('../features/saved-pipelines/saved-pipelines.tsx')).SavedPipelines }), loader: async ({ params, request }) => {
          const records = await localData.listPipelines(params.workspaceId!)
          if (params.pipelineId && !records.some(record => record.id === params.pipelineId)) throw new Response('Pipeline Plan not found', { status: 404 })
          const workspace = await localData.getWorkspace(params.workspaceId!)
          if (params.pipelineId && params.pipelineId === workspace?.currentBaselineId) return redirect(`/workspaces/${params.workspaceId}/pipeline${new URL(request.url).search}`)
          return records
        } },
        { path: 'how-it-works', lazy: async () => ({ Component: (await import('../features/how-it-works/how-it-works.tsx')).HowItWorks }) },
      ],
    },
    { path: '*', Component: NotFound },
  ],
}])
