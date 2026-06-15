import { useEffect, useState } from 'react'
import type { Project } from '../types'
import { projectService } from './ProjectDashboard'
import { ProjectCard }    from './ProjectCard'

// Real Projects from the World Model, for the OS left-rail panel.
export function ProjectsPanel() {
  const [projects, setProjects] = useState<Project[] | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const all = await projectService.getAllProjects()
        if (!cancelled) setProjects(all.sort((a, b) => b.updatedAt - a.updatedAt))
      } catch {
        if (!cancelled) setProjects([])
      }
    })()
    return () => { cancelled = true }
  }, [])

  if (projects === null) return <p className="text-[11px] text-white/25 py-2">loading…</p>
  if (projects.length === 0) {
    return (
      <p className="text-[11px] text-white/35 py-2 leading-relaxed">
        No projects yet. Tell Piku what you're building and it'll start tracking the goal, decisions, and progress here.
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      {projects.map(p => <ProjectCard key={p.id} project={p} />)}
    </div>
  )
}
