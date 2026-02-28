import { useEffect } from 'react'
import { useUIStore } from '../stores/ui-store'
import { useSketchStore } from '../stores/sketch-store'
import { useDocumentStore } from '../stores/document-store'
import { useBimStore } from '../stores/bim-store'

export function useKeyboardShortcuts() {
  const setActiveTool = useUIStore((s) => s.setActiveTool)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't fire when in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      switch (e.key) {
        case 'Escape':
          setActiveTool('select')
          useSketchStore.getState().deactivateSketch()
          break
        case 'w':
        case 'W':
          if (!e.ctrlKey && !e.metaKey) {
            setActiveTool('wall')
            useSketchStore.getState().deactivateSketch()
          }
          break
        case 's':
        case 'S':
          if (!e.ctrlKey && !e.metaKey) {
            setActiveTool('sketch')
            useSketchStore.getState().activateSketch()
          }
          break
        case 'g':
        case 'G':
          if (!e.ctrlKey && !e.metaKey) useUIStore.getState().toggleGrid()
          break
        case 'm':
        case 'M':
          if (!e.ctrlKey && !e.metaKey) {
            setActiveTool('measure')
            useSketchStore.getState().deactivateSketch()
          }
          break
        case 'd':
        case 'D':
          if (!e.ctrlKey && !e.metaKey) {
            setActiveTool('door')
            useSketchStore.getState().deactivateSketch()
          }
          break
        case 'Delete':
        case 'Backspace': {
          if (e.ctrlKey || e.metaKey) break
          const selectedId = useUIStore.getState().selectedBodyId
          if (selectedId) {
            const bimState = useBimStore.getState()
            if (bimState.walls.has(selectedId)) {
              bimState.removeWall(selectedId)
            }
            if (bimState.doors.has(selectedId)) {
              bimState.removeDoor(selectedId)
            }
            useDocumentStore.getState().removeCadMesh(selectedId)
            useUIStore.getState().selectBody(null)
            console.log('[BetterCAD] Deleted body:', selectedId)
          }
          break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setActiveTool])
}
