export function downloadBlobAsFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  link.style.display = 'none'

  const mountNode = document.body ?? document.documentElement
  mountNode.appendChild(link)
  link.click()

  window.setTimeout(() => {
    URL.revokeObjectURL(url)
    link.remove()
  }, 1500)
}

export function downloadArrayBufferAsFile(
  data: ArrayBuffer,
  filename: string,
  mimeType = 'application/octet-stream',
): void {
  const blob = new Blob([data], { type: mimeType })
  downloadBlobAsFile(blob, filename)
}
