import { NextResponse } from "next/server"

const DEFAULT_BACKEND_URL = "http://127.0.0.1:5000"

function normalizeBaseUrl(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value
}

export function getBackendBaseUrl() {
  return normalizeBaseUrl(process.env.METASHIELD_BACKEND_URL || DEFAULT_BACKEND_URL)
}

export function buildBackendUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  return `${getBackendBaseUrl()}${normalizedPath}`
}

function backendUnavailableResponse(error: unknown) {
  const details = error instanceof Error ? error.message : "Unknown connection error"
  return NextResponse.json(
    {
      error: `Meta-Shield backend is unavailable at ${getBackendBaseUrl()}. ${details}`,
    },
    { status: 502 },
  )
}

export async function proxyBackendJson(path: string, init: RequestInit) {
  try {
    const response = await fetch(buildBackendUrl(path), {
      ...init,
      cache: "no-store",
    })

    const rawText = await response.text()

    let payload: unknown = {}
    if (rawText) {
      try {
        payload = JSON.parse(rawText)
      } catch {
        payload = { error: rawText }
      }
    }

    return NextResponse.json(payload, { status: response.status })
  } catch (error) {
    return backendUnavailableResponse(error)
  }
}

export async function proxyBackendDownload(path: string) {
  try {
    const response = await fetch(buildBackendUrl(path), {
      cache: "no-store",
    })

    if (!response.ok) {
      const message = await response.text()
      return NextResponse.json(
        {
          error: message || "Download failed.",
        },
        { status: response.status },
      )
    }

    const headers = new Headers()
    const contentType = response.headers.get("content-type")
    const contentDisposition = response.headers.get("content-disposition")
    const contentLength = response.headers.get("content-length")

    if (contentType) {
      headers.set("content-type", contentType)
    }
    if (contentDisposition) {
      headers.set("content-disposition", contentDisposition)
    }
    if (contentLength) {
      headers.set("content-length", contentLength)
    }

    headers.set("cache-control", "no-store")

    return new Response(response.body, {
      status: response.status,
      headers,
    })
  } catch (error) {
    return backendUnavailableResponse(error)
  }
}
