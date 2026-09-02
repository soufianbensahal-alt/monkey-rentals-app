interface OptimizedImageOptions {
  maxDimension?: number
  quality?: number
}

interface OptimizedImage {
  dataUrl: string
  mimeType: string
  size: number
}

const DEFAULT_MAX_DIMENSION = 1200
const DEFAULT_QUALITY = 0.72

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('No se ha podido leer la imagen.'))
    reader.readAsDataURL(file)
  })
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('No se ha podido optimizar la imagen.'))
    image.src = dataUrl
  })
}

function dataUrlSize(dataUrl: string) {
  const base64 = dataUrl.split(',')[1] || ''
  return Math.round((base64.length * 3) / 4)
}

export async function optimizeImageFile(file: File, options: OptimizedImageOptions = {}): Promise<OptimizedImage> {
  const originalDataUrl = await readAsDataUrl(file)
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return { dataUrl: originalDataUrl, mimeType: file.type, size: file.size }
  }

  const image = await loadImage(originalDataUrl)
  const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height))
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return { dataUrl: originalDataUrl, mimeType: file.type, size: file.size }
  context.drawImage(image, 0, 0, width, height)

  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', options.quality ?? DEFAULT_QUALITY))
  if (!blob) return { dataUrl: originalDataUrl, mimeType: file.type, size: file.size }

  const optimizedDataUrl = await readAsDataUrl(blob)
  const optimizedSize = blob.size || dataUrlSize(optimizedDataUrl)
  return optimizedSize < file.size
    ? { dataUrl: optimizedDataUrl, mimeType: blob.type || 'image/jpeg', size: optimizedSize }
    : { dataUrl: originalDataUrl, mimeType: file.type, size: file.size }
}
