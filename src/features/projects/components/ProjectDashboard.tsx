import { useState, useEffect, useCallback } from 'react'
import type { Project } from '../types'
import { ProjectService }      from '../ProjectService'
import { ProjectCard }         from './ProjectCard'
import { ProjectCreateModal }  from './ProjectCreateModal'
import { UpdateContextPanel }  from './UpdateContextPanel'

// Module-level singleton — shared with useChat
const projectService = new ProjectService()

export function ProjectDashboard() {
  const [projects,         setProjects]         = useState<Project[]>([])
  const [isExpanded,       setIsExpanded]       = useState(false)
  const [isLoading,        setIsLoading]        = useState(false)
  const [showCreateModal,  setShowCreateModal]  = useState(false)
  const [updatingId,       setUpdatingId]       = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const all = await projectService.getAllProjects()
      setProjects(all)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const toggle = () => {
    setIsExpanded(v => {
      if (!v) void load()
      return !v
    })
  }

  const handleCreated = (project: Project) => {
    setShowCreateModal(false)
    setProjects(prev => [project, ...prev])
  }

  const handleUpdated = (updated: Project) => {
    setUpdatingId(null)
    setProjects(prev => prev.map(p => p.id === updated.id ? updated : p))
  }

  const updatingProject = updatingId ? projects.find(p => p.id === updatingId) ?? null : null

  return (
    <div className="w-full flex flex-col gap-2">
      {/* Toggle header */}
      <button
        onClick={toggle}
        className="
          flex items-center justify-between w-full
          px-3 py-2 rounded-xl
          text-xs text-white/40 hover:text-white/60
          border border-white/6 hover:border-white/12
          transition-colors duration-150
        "
      >
        <span className="flex items-center gap-2">
          <span className="text-white/25">◈</span>
          Projects
          {projects.length > 0 && (
            <span className="text-white/25">({projects.length})</span>
          )}
        </span>
        <span className="text-white/20">{isExpanded ? '▲' : '▼'}</span>
      </button>

      {/* Panel */}
      {isExpanded && (
        <div className="flex flex-col gap-2">
          {isLoading ? (
            <p className="text-xs text-white/25 text-center py-4">Loading…</p>
          ) : projects.length === 0 ? (
            <p className="text-xs text-white/25 text-center py-4">
              No projects yet.
            </p>
          ) : (
            projects.map(p =>
              updatingId === p.id && updatingProject ? (
                <UpdateContextPanel
                  key={p.id}
                  project={updatingProject}
                  onUpdated={handleUpdated}
                  onClose={() => setUpdatingId(null)}
                />
              ) : (
                <ProjectCard
                  key={p.id}
                  project={p}
                  onUpdateContext={() => setUpdatingId(p.id)}
                />
              )
            )
          )}

          <div className="flex items-center justify-between pt-0.5">
            <button
              onClick={() => setShowCreateModal(true)}
              className="
                text-[10px] text-white/25 hover:text-white/50
                border border-white/8 hover:border-white/18
                rounded px-2.5 py-1
                transition-colors
              "
            >
              + new project
            </button>
            <button
              onClick={() => void load()}
              className="text-[10px] text-white/20 hover:text-white/40 transition-colors"
            >
              refresh
            </button>
          </div>
        </div>
      )}

      {showCreateModal && (
        <ProjectCreateModal
          onCreated={handleCreated}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  )
}

// Export the singleton so useChat can call processConversation on the same instance
export { projectService }
