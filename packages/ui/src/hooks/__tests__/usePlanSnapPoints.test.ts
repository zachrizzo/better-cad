import { describe, expect, it } from 'vitest'
import { snapPlanCandidate, type PlanSnapCandidate } from '../usePlanSnapPoints'

describe('snapPlanCandidate', () => {
  it('filters snap candidates by the enabled modes', () => {
    const candidates: PlanSnapCandidate[] = [
      { point: [1, 1], modes: ['endpoint'] },
      { point: [0.2, 0.2], modes: ['nearest'] },
    ]

    expect(
      snapPlanCandidate([0, 0], candidates, ['endpoint'], 0.5),
    ).toEqual({
      point: [0, 0],
      snapped: null,
    })

    expect(
      snapPlanCandidate([0, 0], candidates, ['nearest'], 0.5),
    ).toEqual({
      point: [0.2, 0.2],
      snapped: { point: [0.2, 0.2], modes: ['nearest'] },
    })
  })

  it('returns the raw point when no modes are enabled', () => {
    const candidates: PlanSnapCandidate[] = [
      { point: [0.1, 0.1], modes: ['endpoint'] },
    ]

    expect(
      snapPlanCandidate([0, 0], candidates, [], 0.5),
    ).toEqual({
      point: [0, 0],
      snapped: null,
    })
  })
})
