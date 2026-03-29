import type {
  BatchMailResponse,
  MetadataReport,
  SendBatchPayload,
  SendEmailPayload,
  SendEmailResponse,
  StripResponse,
  UploadResponse,
} from "@/lib/metashield-types"

const API_BASE = "/backend"

export class ApiPayloadError<T = unknown> extends Error {
  payload?: T

  constructor(message: string, payload?: T) {
    super(message)
    this.name = "ApiPayloadError"
    this.payload = payload
  }
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const rawText = await response.text()

  let payload: unknown = {}
  if (rawText) {
    try {
      payload = JSON.parse(rawText)
    } catch {
      payload = { error: rawText }
    }
  }

  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : typeof payload === "object" &&
            payload !== null &&
            "message" in payload &&
            typeof payload.message === "string"
          ? payload.message
          : `Request failed with status ${response.status}`

    throw new ApiPayloadError<T>(message, payload as T)
  }

  return payload as T
}

function buildBatchFormData(files: File[]) {
  const formData = new FormData()
  for (const file of files) {
    formData.append("files", file)
  }
  return formData
}

export async function uploadFile(file: File): Promise<UploadResponse> {
  const formData = new FormData()
  formData.append("file", file)

  return parseJsonResponse<UploadResponse>(
    await fetch(`${API_BASE}/upload`, {
      method: "POST",
      body: formData,
      cache: "no-store",
    }),
  )
}

export async function scanFile(filename: string): Promise<MetadataReport> {
  return parseJsonResponse<MetadataReport>(
    await fetch(`${API_BASE}/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename }),
      cache: "no-store",
    }),
  )
}

export async function stripFile(filename: string): Promise<StripResponse> {
  return parseJsonResponse<StripResponse>(
    await fetch(`${API_BASE}/strip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename }),
      cache: "no-store",
    }),
  )
}

export async function sendSanitizedEmail(
  payload: SendEmailPayload,
): Promise<SendEmailResponse> {
  return parseJsonResponse<SendEmailResponse>(
    await fetch(`${API_BASE}/send_email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    }),
  )
}

export async function prepareBatchClean(files: File[]): Promise<BatchMailResponse> {
  const formData = buildBatchFormData(files)
  formData.append("zip_output", "true")

  return parseJsonResponse<BatchMailResponse>(
    await fetch(`${API_BASE}/strip-batch`, {
      method: "POST",
      body: formData,
      cache: "no-store",
    }),
  )
}

export async function sendBatchEmail(
  payload: SendBatchPayload,
): Promise<BatchMailResponse> {
  const formData = buildBatchFormData(payload.files)
  formData.append("sender", payload.sender)
  formData.append("recipient", payload.recipients)
  formData.append("subject", payload.subject)
  formData.append("body", payload.body)
  formData.append("zip_output", String(payload.zipOutput))

  return parseJsonResponse<BatchMailResponse>(
    await fetch(`${API_BASE}/send-mail-batch`, {
      method: "POST",
      body: formData,
      cache: "no-store",
    }),
  )
}

export function getCleanDownloadUrl() {
  return `${API_BASE}/download_clean`
}

export function getOriginalDownloadUrl(filename: string) {
  return `${API_BASE}/download_original?filename=${encodeURIComponent(filename)}`
}

export function getBatchDownloadUrl(downloadUrl: string) {
  return downloadUrl.startsWith("/backend") ? downloadUrl : `${API_BASE}${downloadUrl}`
}
