/**
 * Re-export the unified SketchPlane from the DRY tools/ folder.
 * App.tsx imports { SketchPlane } from this path, so we keep it as a shim.
 */
export { SketchPlane, SketchPlane2D } from '../tools/SketchTool'
