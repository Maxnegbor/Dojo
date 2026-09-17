export const MAX_PROOF_IMAGES = 4

export async function compressProofImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const maxEdge = 1280
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not read this photo')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.72)
}

export function imageFilesFromList(list: FileList | File[] | Iterable<File> | null | undefined): File[] {
  if (!list) return []
  return [...list].filter((file) => file.type.startsWith('image/'))
}

export async function compressProofImages(files: File[], already = 0): Promise<string[]> {
  const room = Math.max(0, MAX_PROOF_IMAGES - already)
  const selected = files.slice(0, room)
  return Promise.all(selected.map(compressProofImage))
}
