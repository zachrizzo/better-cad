import { useEffect, useState } from 'react'
import { type KernelBackend, getKernel } from '../services/kernel-bridge'

// Module-level singleton — ensures only one WASM instance is created
// regardless of how many components call useKernel().
let kernelSingleton: KernelBackend | null = null
let kernelPromise: Promise<KernelBackend> | null = null
let kernelError: string | null = null

function getKernelSingleton(): Promise<KernelBackend> {
  if (kernelSingleton) return Promise.resolve(kernelSingleton)
  if (kernelError) return Promise.reject(new Error(kernelError))
  if (!kernelPromise) {
    kernelPromise = getKernel().then((k) => {
      kernelSingleton = k
      return k
    }).catch((err) => {
      kernelError = err instanceof Error ? err.message : String(err)
      kernelPromise = null
      throw err
    })
  }
  return kernelPromise
}

export function useKernel() {
  const [kernel, setKernel] = useState<KernelBackend | null>(kernelSingleton)
  const [ready, setReady] = useState(kernelSingleton !== null)
  const [error, setError] = useState<string | null>(kernelError)

  useEffect(() => {
    if (kernelSingleton) {
      setKernel(kernelSingleton)
      setReady(true)
      return
    }
    if (kernelError) {
      setError(kernelError)
      return
    }
    let cancelled = false
    getKernelSingleton().then((k) => {
      if (!cancelled) {
        setKernel(k)
        setReady(true)
      }
    }).catch((err) => {
      if (!cancelled) {
        const msg = err instanceof Error ? err.message : String(err)
        setError(msg)
        console.error('[BetterCAD] Kernel initialization failed:', msg)
      }
    })
    return () => { cancelled = true }
  }, [])

  return { kernel, ready, error }
}
