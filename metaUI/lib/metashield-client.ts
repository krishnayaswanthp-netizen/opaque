import type {
  MetadataReport,
  StripResponse,
  UploadResponse,
} from "@/lib/metashield-types"

const API_BASE = "/api/metashield"

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const rawText = await response.text()

  let payload: unknown = {}
  if (rawText) {
    try {
      payload = JSON.parse(rawText)
    } catch {
      payload = {
        error: rawText,
      }
    }
  }

  if (!response.ok) {
    const errorMessage =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : `Request failed with status ${response.status}`

    throw new Error(errorMessage)
  }

  return payload as T
}

export async function uploadFile(file: File): Promise<UploadResponse> {
  const formData = new FormData()
  formData.append("file", file)

  const response = await fetch(`${API_BASE}/upload`, {
    method: "POST",
    body: formData,
    cache: "no-store",
  })

  return parseJsonResponse<UploadResponse>(response)
}

export async function scanFile(filename: string): Promise<MetadataReport> {
  const response = await fetch(`${API_BASE}/scan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ filename }),
    cache: "no-store",
  })

  return parseJsonResponse<MetadataReport>(response)
}

export async function stripFile(filename: string): Promise<StripResponse> {
  const response = await fetch(`${API_BASE}/strip`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ filename }),
    cache: "no-store",
  })

  return parseJsonResponse<StripResponse>(response)
}

export function getCleanDownloadUrl() {
  return `${API_BASE}/download-clean`
}

export function getOriginalDownloadUrl(filename: string) {
  return `${API_BASE}/download-original?filename=${encodeURIComponent(filename)}`
}
