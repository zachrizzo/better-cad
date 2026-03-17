/**
 * Re-export the unified SectionPlane from the DRY tools/ folder.
 * App.tsx imports { SectionPlane } from this path, so we keep it as a shim.
 */
export { SectionPlane, SectionPlane2D } from '../tools/SectionTool'
