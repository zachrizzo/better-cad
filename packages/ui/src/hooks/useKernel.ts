import { useEffect, useRef, useState } from 'react'
import { type KernelBackend, getKernel } from '../services/kernel-bridge'

export function useKernel() {
  const kernelRef = useRef<KernelBackend | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    getKernel().then((k) => {
      if (!cancelled) {
        kernelRef.current = k
        setReady(true)
      }
    })
    return () => { cancelled = true }
  }, [])

  return { kernel: kernelRef.current, ready }
}
