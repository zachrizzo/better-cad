import * as THREE from 'three'
import { Line, Html } from '@react-three/drei'
import { useSketchDrawing, CIRCLE_SEGMENTS } from '../../hooks/useSketchDrawing'
import { formatLength } from '../../utils/units'
import {
  type ViewportMode,
  interactionPlaneProps,
  toWorldPosition,
  PLANE_2D_Z,
} from '../../utils/viewport-helpers'

const MIN_RECT_SIDE = 1e-5

interface SketchToolProps {
  mode: ViewportMode
}

/**
 * Unified sketch drawing tool.
 * Works in both 2D and 3D -- all logic lives in useSketchDrawing.
 */
function SketchToolInner({ mode }: SketchToolProps) {
  const {
    isActive,
    hoverPoint,
    drawMode,
    pendingPoint,
    points,
    lines,
    circles,
    constraints,
    selection,
    statusColor,
    lengthUnit,
    previewCorners,
    previewSize,
    linePreview,
    circlePreview,
    planeRef,
    handlePointerMove,
    handleClick,
    handleContextMenu,
    handlePointerLeave,
  } = useSketchDrawing(mode)

  if (!isActive) return null

  // In 3D: points render at Y=elevation, in 2D: at Z=PLANE_2D_Z
  // We use elevation=0 for sketch (sketch is always on the ground plane)
  const elevation = 0
  const plane = interactionPlaneProps(mode, elevation)

  // Offsets for various rendering layers
  const pointOffset = 0.02
  const lineOffset = 0.01
  const previewOffset = 0.03
  const labelOffset = mode === '3d' ? 0.16 : 0.3
  const cursorOffset = 0.05
  const pendingOffset = 0.05

  return (
    <>
      {/* Invisible plane for picking */}
      <mesh
        ref={planeRef}
        rotation={plane.rotation}
        position={plane.position}
        onClick={handleClick}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onContextMenu={handleContextMenu}
      >
        <planeGeometry args={[100, 100]} />
        <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>

      {/* Render existing lines */}
      {Array.from(lines.values()).map((line) => {
        const p1 = points.get(line.p1)
        const p2 = points.get(line.p2)
        if (!p1 || !p2) return null
        const isSelected = selection.lineIds.includes(line.id)
        const lineColor = isSelected ? '#ffaa00' : statusColor
        return (
          <Line
            key={line.id}
            points={[
              toWorldPosition([p1.x, p1.y], mode, elevation, lineOffset),
              toWorldPosition([p2.x, p2.y], mode, elevation, lineOffset),
            ]}
            color={lineColor}
            lineWidth={isSelected ? 3 : 2}
          />
        )
      })}

      {/* Render existing circles */}
      {Array.from(circles.values()).map((circ) => {
        const center = points.get(circ.center)
        if (!center) return null
        const circlePoints: [number, number, number][] = []
        for (let i = 0; i <= CIRCLE_SEGMENTS; i++) {
          const angle = (i / CIRCLE_SEGMENTS) * Math.PI * 2
          circlePoints.push(
            toWorldPosition(
              [center.x + circ.radius * Math.cos(angle), center.y + circ.radius * Math.sin(angle)],
              mode,
              elevation,
              lineOffset,
            ),
          )
        }
        return (
          <Line
            key={circ.id}
            points={circlePoints}
            color={statusColor}
            lineWidth={2}
          />
        )
      })}

      {/* Render existing points */}
      {Array.from(points.values()).map((pt) => {
        const isSelected = selection.pointIds.includes(pt.id)
        const ptColor = isSelected ? '#ffaa00' : statusColor
        return (
          <mesh key={pt.id} position={toWorldPosition([pt.x, pt.y], mode, elevation, pointOffset)}>
            {mode === '3d'
              ? <sphereGeometry args={[isSelected ? 0.07 : 0.05, 8, 8]} />
              : <circleGeometry args={[isSelected ? 0.07 : 0.05, 14]} />}
            <meshBasicMaterial color={ptColor} />
          </mesh>
        )
      })}

      {/* Constraint visual indicators */}
      {Array.from(constraints.values()).map((c) => {
        if (c.type === 'Distance' && c.points.length >= 2) {
          const p1 = points.get(c.points[0])
          const p2 = points.get(c.points[1])
          if (!p1 || !p2) return null
          const mx = (p1.x + p2.x) / 2
          const mz = (p1.y + p2.y) / 2
          return (
            <Html key={c.id} position={toWorldPosition([mx, mz], mode, elevation, 0.15)} center>
              <div className="measurement-badge" style={{ fontSize: 10 }}>
                {formatLength(c.value ?? 0, lengthUnit)}
              </div>
            </Html>
          )
        }
        if (c.type === 'Horizontal' && c.lines.length >= 1) {
          const line = lines.get(c.lines[0])
          if (!line) return null
          const p1 = points.get(line.p1)
          const p2 = points.get(line.p2)
          if (!p1 || !p2) return null
          const mx = (p1.x + p2.x) / 2
          const mz = (p1.y + p2.y) / 2
          return (
            <Html key={c.id} position={toWorldPosition([mx, mz], mode, elevation, 0.15)} center>
              <div className="measurement-badge" style={{ fontSize: 9, background: 'rgba(0,150,0,0.3)' }}>H</div>
            </Html>
          )
        }
        if (c.type === 'Vertical' && c.lines.length >= 1) {
          const line = lines.get(c.lines[0])
          if (!line) return null
          const p1 = points.get(line.p1)
          const p2 = points.get(line.p2)
          if (!p1 || !p2) return null
          const mx = (p1.x + p2.x) / 2
          const mz = (p1.y + p2.y) / 2
          return (
            <Html key={c.id} position={toWorldPosition([mx, mz], mode, elevation, 0.15)} center>
              <div className="measurement-badge" style={{ fontSize: 9, background: 'rgba(0,150,0,0.3)' }}>V</div>
            </Html>
          )
        }
        return null
      })}

      {/* Hover cursor */}
      {hoverPoint && (
        <mesh position={toWorldPosition(hoverPoint, mode, elevation, cursorOffset)}>
          {mode === '3d'
            ? <sphereGeometry args={[0.06, 12, 12]} />
            : <circleGeometry args={[0.06, 14]} />}
          <meshBasicMaterial color="#00d4ff" />
        </mesh>
      )}

      {/* Pending point marker */}
      {pendingPoint && (
        <mesh position={toWorldPosition([pendingPoint.x, pendingPoint.y], mode, elevation, pendingOffset)}>
          {mode === '3d'
            ? <sphereGeometry args={[0.08, 12, 12]} />
            : <circleGeometry args={[0.08, 14]} />}
          <meshBasicMaterial color="#ffaa00" />
        </mesh>
      )}

      {/* Rectangle preview */}
      {previewCorners && (
        <>
          <Line
            points={[
              toWorldPosition([previewCorners.ax, previewCorners.ay], mode, elevation, previewOffset),
              toWorldPosition([previewCorners.bx, previewCorners.ay], mode, elevation, previewOffset),
              toWorldPosition([previewCorners.bx, previewCorners.by], mode, elevation, previewOffset),
              toWorldPosition([previewCorners.ax, previewCorners.by], mode, elevation, previewOffset),
              toWorldPosition([previewCorners.ax, previewCorners.ay], mode, elevation, previewOffset),
            ]}
            color="#00d4ff"
            lineWidth={2}
            dashed
            dashSize={0.2}
            gapSize={0.1}
          />
          {previewSize && (
            <Html
              position={toWorldPosition(
                [(previewCorners.ax + previewCorners.bx) / 2, (previewCorners.ay + previewCorners.by) / 2],
                mode,
                elevation,
                labelOffset,
              )}
              center
            >
              <div className="measurement-badge">
                W {formatLength(previewSize.width, lengthUnit)} • D {formatLength(previewSize.depth, lengthUnit)}
              </div>
            </Html>
          )}
        </>
      )}

      {/* Line preview */}
      {linePreview && (
        <>
          <Line
            points={[
              toWorldPosition([linePreview.x1, linePreview.z1], mode, elevation, previewOffset),
              toWorldPosition([linePreview.x2, linePreview.z2], mode, elevation, previewOffset),
            ]}
            color="#00d4ff"
            lineWidth={2}
            dashed
            dashSize={0.15}
            gapSize={0.1}
          />
          <Html
            position={toWorldPosition(
              [(linePreview.x1 + linePreview.x2) / 2, (linePreview.z1 + linePreview.z2) / 2],
              mode,
              elevation,
              labelOffset,
            )}
            center
          >
            <div className="measurement-badge">
              {formatLength(Math.hypot(linePreview.x2 - linePreview.x1, linePreview.z2 - linePreview.z1), lengthUnit)}
            </div>
          </Html>
        </>
      )}

      {/* Circle preview */}
      {circlePreview && circlePreview.radius > MIN_RECT_SIDE && (
        <>
          <Line
            points={Array.from({ length: CIRCLE_SEGMENTS + 1 }, (_, i) => {
              const angle = (i / CIRCLE_SEGMENTS) * Math.PI * 2
              return toWorldPosition(
                [circlePreview.cx + circlePreview.radius * Math.cos(angle), circlePreview.cz + circlePreview.radius * Math.sin(angle)],
                mode,
                elevation,
                previewOffset,
              )
            })}
            color="#00d4ff"
            lineWidth={2}
            dashed
            dashSize={0.15}
            gapSize={0.1}
          />
          <Html
            position={toWorldPosition(
              [circlePreview.cx + circlePreview.radius + 0.2, circlePreview.cz],
              mode,
              elevation,
              labelOffset,
            )}
            center
          >
            <div className="measurement-badge">
              R {formatLength(circlePreview.radius, lengthUnit)}
            </div>
          </Html>
        </>
      )}
    </>
  )
}

/**
 * SketchPlane - 3D viewport sketch tool (drop-in replacement for the old SketchPlane).
 */
export function SketchPlane() {
  return <SketchToolInner mode="3d" />
}

/**
 * SketchPlane2D - 2D viewport sketch tool.
 */
export function SketchPlane2D() {
  return <SketchToolInner mode="2d" />
}
