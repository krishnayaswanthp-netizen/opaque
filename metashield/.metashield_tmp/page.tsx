"use client"

import { startTransition, useEffect, useRef, useState } from "react"
import type { LucideIcon } from "lucide-react"
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  FileText,
  FileWarning,
  Loader2,
  Mail,
  MapPin,
  RotateCcw,
  SendHorizontal,
  Shield,
  ShieldCheck,
  Smartphone,
  Terminal,
  Upload,
  UserCircle2,
} from "lucide-react"

import { Header } from "@/components/opaque/header"
import { Button } from "@/components/ui/button"

type Stage = "upload" | "scanning" | "results"
type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"

interface GPSInfo {
  latitude: number
  longitude: number
  altitude_m: number | null
  maps_url: string
}

interface SensitiveFinding {
  label: string
  value: string
  ifd_name: string
  description: string
  attacker_use: string
  danger_to_user: string
  danger_level: RiskLevel
}

interface MetadataReport {
  file: string
  file_type?: "image" | "document"
  document_type?: string | null
  file_size_kb: number
  gps: GPSInfo | null
  gps_warning: string | null
  thumbnail_present: boolean
  thumbnail_size_bytes: number
  sensitive_findings: SensitiveFinding[]
  device: Record<string, string>
  timestamps: Record<string, string>
  other_pii: Record<string, string>
  raw_tag_count: number
  sensitive_tag_count: number
  risk_level: RiskLevel
  risk_reasons: string[]
  score?: number
  contains_hidden_data?: boolean
  recommendations?: string[]
  error?: string
}

interface AuditAttachmentReport {
  artifact_output_file?: string
  before?: MetadataReport
}

interface AuditReport {
  attachment_reports: AuditAttachmentReport[]
  clean_email_output?: string | null
  audit_report_output?: string | null
}

interface StripResponse {
  before: MetadataReport
  after: MetadataReport
  tags_removed: number
  size_before_kb: number
  size_after_kb: number
  stripped_at: string
  success: boolean
  duration_ms: number
  audit: AuditReport
  clean_file: string
  smtp_enabled?: boolean
  smtp_default_sender?: string | null
}

interface UploadResponse {
  filename: string
}

interface EmailFormState {
  sender: string
  recipients: string
  subject: string
  body: string
}

interface SendEmailResponse {
  message: string
  email_sent: boolean
  sender: string
  recipients: string[]
  subject: string
  duration_ms: number
  clean_file?: string | null
  clean_email_output?: string | null
  audit_report_output?: string | null
  smtp_enabled?: boolean
  smtp_default_sender?: string | null
}

interface ScanLogEntry {
  id: string
  message: string
  status: "info" | "success" | "error"
}

const BACKEND_BASE = "/backend"
const ACCEPTED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".tif", ".tiff", ".pdf", ".docx"]

const riskBadgeClasses: Record<RiskLevel, string> = {
  CRITICAL: "border border-neon-red/40 bg-neon-red/15 text-neon-red",
  HIGH: "border border-neon-yellow/40 bg-neon-yellow/15 text-neon-yellow",
  MEDIUM: "border border-neon-blue/40 bg-neon-blue/15 text-neon-blue",
  LOW: "border border-neon-green/40 bg-neon-green/15 text-neon-green",
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
        : `Request failed with status ${response.status}`

    throw new Error(message)
  }

  return payload as T
}

function formatKeyLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function formatTimestamp(value: string) {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString()
}

function formatThumbnailSize(bytes: number) {
  return `${(bytes / 1024).toFixed(1)} KB`
}

function getEffectiveFileType(report: MetadataReport) {
  return report.file_type ?? "image"
}

function getFindingIcon(label: string): LucideIcon {
  if (label.startsWith("GPS")) {
    return MapPin
  }

  if (label.includes("Date") || label.includes("Time")) {
    return Clock3
  }

  if (
    label.includes("Camera") ||
    label.includes("Lens") ||
    label.includes("Software") ||
    label.includes("Maker")
  ) {
    return Smartphone
  }

  if (label.includes("Thumbnail")) {
    return Eye
  }

  if (label.includes("Artist") || label.includes("Owner") || label.includes("Host")) {
    return UserCircle2
  }

  return AlertCircle
}

function buildAttackerInsights(findings: SensitiveFinding[]) {
  const seen = new Set<string>()

  return findings.filter((finding) => {
    const key = `${finding.attacker_use}|${finding.danger_to_user}`
    if (seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}

function buildLogEntry(message: string, status: ScanLogEntry["status"]): ScanLogEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    message,
    status,
  }
}

function UploadPane({
  onFileUpload,
  error,
}: {
  onFileUpload: (file: File) => void | Promise<void>
  error?: string | null
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const submitFile = (file: File | null) => {
    if (!file) {
      return
    }

    const extension = file.name.includes(".")
      ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase()
      : ""

    if (!ACCEPTED_EXTENSIONS.includes(extension)) {
      setLocalError(
        `Unsupported file type. Upload one of: ${ACCEPTED_EXTENSIONS.join(", ")}`,
      )
      return
    }

    setLocalError(null)
    void onFileUpload(file)
  }

  const activeError = localError || error

  return (
    <div className="space-y-4">
      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault()
          setIsDragOver(true)
        }}
        onDragLeave={(event) => {
          event.preventDefault()
          setIsDragOver(false)
        }}
        onDrop={(event) => {
          event.preventDefault()
          setIsDragOver(false)
          submitFile(event.dataTransfer.files?.[0] ?? null)
        }}
        className={`
          relative cursor-pointer rounded-xl p-12 border-2 border-dashed transition-all duration-300
          ${isDragOver
            ? "border-neon-green bg-neon-green/5 neon-glow-green"
            : "border-border hover:border-neon-blue hover:bg-neon-blue/5"
          }
          group
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS.join(",")}
          onChange={(event) => {
            submitFile(event.target.files?.[0] ?? null)
            event.target.value = ""
          }}
          className="hidden"
        />

        <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-neon-green rounded-tl-lg" />
        <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-neon-green rounded-tr-lg" />
        <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-neon-green rounded-bl-lg" />
        <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-neon-green rounded-br-lg" />

        <div className="flex flex-col items-center gap-6">
          <div
            className={`
              relative rounded-full p-6 glass-panel transition-all duration-300
              ${isDragOver ? "neon-glow-green" : "group-hover:neon-glow-blue"}
            `}
          >
            <Upload
              className={`
                w-12 h-12 transition-colors duration-300
                ${isDragOver ? "text-neon-green" : "text-muted-foreground group-hover:text-neon-blue"}
              `}
            />
            <div
              className={`
                absolute inset-0 rounded-full blur-xl transition-opacity duration-300
                ${isDragOver
                  ? "bg-neon-green/20 opacity-100"
                  : "bg-neon-blue/20 opacity-0 group-hover:opacity-100"
                }
              `}
            />
          </div>

          <div className="space-y-2 text-center">
            <p
              className={`
                text-lg font-medium transition-colors duration-300
                ${isDragOver ? "text-neon-green neon-text-green" : "text-foreground"}
              `}
            >
              Drop a real user file to inspect its hidden metadata
            </p>
            <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <FileText className="w-4 h-4" />
              Supports PNG, JPG, JPEG, TIF, TIFF, PDF, and DOCX
            </p>
            <p className="text-xs text-muted-foreground/90">
              Meta-Shield only analyzes the file you provide. No static demo data is used.
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="h-px w-12 bg-gradient-to-r from-transparent to-border" />
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              or click to browse
            </span>
            <div className="h-px w-12 bg-gradient-to-l from-transparent to-border" />
          </div>
        </div>
      </div>

      {activeError ? (
        <div className="flex items-start gap-3 rounded-xl border border-neon-red/30 bg-neon-red/10 px-4 py-3 text-sm text-neon-red">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{activeError}</p>
        </div>
      ) : null}
    </div>
  )
}

function ScanPane({
  fileName,
  logs,
  progress,
  error,
  onReset,
}: {
  fileName: string | null
  logs: ScanLogEntry[]
  progress: number
  error?: string | null
  onReset: () => void
}) {
  const logContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = logContainerRef.current
    if (!container) {
      return
    }

    container.scrollTop = container.scrollHeight
  }, [logs])

  return (
    <div className="glass-panel rounded-xl p-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Terminal className="w-5 h-5 text-neon-blue" />
            <div className="absolute inset-0 blur-sm bg-neon-blue/50" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Scan Progress</h2>
            <p className="text-xs text-muted-foreground">
              {fileName ? `Analyzing ${fileName}` : "Analyzing the uploaded file"}
            </p>
          </div>
        </div>

        <div className="rounded-full border border-neon-blue/20 bg-neon-blue/10 px-3 py-1 text-xs uppercase tracking-[0.25em] text-neon-blue">
          {Math.round(progress)}% complete
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Live Meta-Shield workflow</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-secondary">
          <div
            className="relative h-full rounded-full bg-gradient-to-r from-neon-blue to-neon-green transition-all duration-300"
            style={{ width: `${progress}%` }}
          >
            <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-white/30 to-transparent" />
          </div>
        </div>
      </div>

      <div
        ref={logContainerRef}
        className="max-h-72 space-y-2 overflow-y-auto rounded-lg bg-background/50 p-4 font-mono text-sm"
      >
        {logs.length ? (
          logs.map((log) => {
            const isSuccess = log.status === "success"
            const isError = log.status === "error"

            return (
              <div
                key={log.id}
                className={`
                  flex items-start gap-3 leading-6
                  ${isSuccess ? "text-neon-green" : ""}
                  ${isError ? "text-neon-red" : ""}
                  ${!isSuccess && !isError ? "text-neon-blue" : ""}
                `}
              >
                {isSuccess ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                ) : isError ? (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
                )}
                <span>
                  <span className="mr-2 text-muted-foreground">{">"}</span>
                  {log.message}
                </span>
              </div>
            )
          })
        ) : (
          <div className="flex items-center gap-3 text-neon-blue">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>
              <span className="mr-2 text-muted-foreground">{">"}</span>
              Initializing secure scanner...
            </span>
          </div>
        )}
      </div>

      {error ? (
        <div className="space-y-4 rounded-xl border border-neon-red/30 bg-neon-red/10 p-4">
          <div className="flex items-start gap-3 text-sm text-neon-red">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
          <Button
            onClick={onReset}
            variant="outline"
            className="border-neon-red/30 bg-transparent text-neon-red hover:bg-neon-red/10 hover:text-neon-red"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Try Another File
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <div className="flex gap-1">
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className="h-2 w-2 animate-pulse rounded-full bg-neon-blue"
                style={{ animationDelay: `${index * 200}ms` }}
              />
            ))}
          </div>
          <span>Streaming live analysis from the Meta-Shield backend</span>
        </div>
      )}
    </div>
  )
}

function MetadataGroup({
  title,
  icon: Icon,
  entries,
}: {
  title: string
  icon: LucideIcon
  entries: Record<string, string>
}) {
  const rows = Object.entries(entries)

  if (!rows.length) {
    return null
  }

  return (
    <div className="space-y-3 rounded-xl border border-border/80 bg-background/40 p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-neon-blue" />
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>

      {rows.map(([key, value]) => (
        <div key={key} className="space-y-1">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {formatKeyLabel(key)}
          </p>
          <p className="break-words text-sm text-foreground">{value}</p>
        </div>
      ))}
    </div>
  )
}

function DetailCard({ finding }: { finding: SensitiveFinding }) {
  const Icon = getFindingIcon(finding.label)

  return (
    <div className="space-y-4 rounded-xl border border-border/80 bg-background/45 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-background/80 p-2">
            <Icon className="h-4 w-4 text-neon-blue" />
          </div>
          <div>
            <p className="font-semibold text-foreground">{finding.label}</p>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              {finding.ifd_name} block
            </p>
          </div>
        </div>

        <span
          className={`rounded-full px-2.5 py-1 text-[11px] uppercase tracking-[0.25em] ${riskBadgeClasses[finding.danger_level]}`}
        >
          {finding.danger_level}
        </span>
      </div>

      <div className="space-y-3 text-sm">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Found Value</p>
          <p className="mt-1 break-words font-mono text-neon-blue">{finding.value}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">What It Is</p>
          <p className="mt-1 text-foreground">{finding.description}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Attacker Use</p>
          <p className="mt-1 text-foreground">{finding.attacker_use}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Danger To User</p>
          <p className="mt-1 text-foreground">{finding.danger_to_user}</p>
        </div>
      </div>
    </div>
  )
}

function ResultsPane({
  sourceFileName,
  uploadedFilename,
  report,
  stripResult,
}: {
  sourceFileName: string | null
  uploadedFilename: string | null
  report: MetadataReport
  stripResult: StripResponse | null
}) {
  const [showDetailedView, setShowDetailedView] = useState(false)
  const fileType = getEffectiveFileType(report)
  const totalFindings = report.sensitive_findings.length
  const attackInsights = buildAttackerInsights(report.sensitive_findings).slice(0, 4)
  const afterReport = stripResult?.after ?? null
  const firstAttachment = stripResult?.audit.attachment_reports.find(
    (attachment) => attachment.before,
  )

  return (
    <div className="space-y-6">
      <div
        className={`
          glass-panel rounded-xl p-6
          ${report.risk_level === "CRITICAL" ? "neon-glow-red border-neon-red/30" : ""}
          ${report.risk_level === "HIGH" ? "border-neon-yellow/30" : ""}
          ${report.risk_level === "MEDIUM" ? "border-neon-blue/30" : ""}
          ${report.risk_level === "LOW" ? "border-neon-green/30" : ""}
        `}
      >
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div
              className={`rounded-xl p-3 ${report.risk_level === "LOW" && totalFindings === 0 ? "bg-neon-green/20" : "bg-neon-red/15"}`}
            >
              {report.risk_level === "LOW" && totalFindings === 0 ? (
                <Shield className="h-8 w-8 text-neon-green" />
              ) : (
                <AlertTriangle className="h-8 w-8 text-neon-red" />
              )}
            </div>
            <div className="space-y-2">
              <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">
                Threat Level
              </p>
              <h3
                className={`text-2xl font-bold uppercase tracking-[0.12em] ${report.risk_level === "LOW" && totalFindings === 0 ? "text-neon-green" : "text-neon-red"}`}
              >
                {report.risk_level === "LOW" && totalFindings === 0
                  ? "Safe"
                  : `${report.risk_level} Risk`}
              </h3>
              <p className="max-w-2xl text-sm text-muted-foreground">
                {report.risk_reasons[0] ??
                  "Meta-Shield finished scanning the uploaded file and summarized the exposed metadata below."}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:min-w-[280px]">
            <div className="rounded-xl border border-border/80 bg-background/45 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Findings
              </p>
              <p className="mt-2 text-3xl font-bold text-foreground">{totalFindings}</p>
            </div>
            <div className="rounded-xl border border-border/80 bg-background/45 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Total Metadata Tags
              </p>
              <p className="mt-2 text-3xl font-bold text-foreground">{report.raw_tag_count}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="glass-panel space-y-5 rounded-xl p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <FileWarning className="h-5 w-5 text-neon-blue" />
              <h3 className="text-lg font-semibold text-foreground">Metadata Exposed (Before)</h3>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs uppercase tracking-[0.28em] ${riskBadgeClasses[report.risk_level]}`}
            >
              {report.risk_level}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-xl border border-border/80 bg-background/45 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Source File
              </p>
              <p className="mt-2 break-all text-sm text-foreground">
                {sourceFileName ?? "Uploaded file"}
              </p>
            </div>
            <div className="rounded-xl border border-border/80 bg-background/45 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Stored As
              </p>
              <p className="mt-2 break-all text-sm text-foreground">
                {uploadedFilename ?? "Pending"}
              </p>
            </div>
            <div className="rounded-xl border border-border/80 bg-background/45 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                File Size
              </p>
              <p className="mt-2 text-sm text-foreground">{report.file_size_kb} KB</p>
            </div>
            <div className="rounded-xl border border-border/80 bg-background/45 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Sensitive Tags
              </p>
              <p className="mt-2 text-sm font-semibold text-neon-red">
                {report.sensitive_tag_count}
              </p>
            </div>
            <div className="rounded-xl border border-border/80 bg-background/45 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Thumbnail Leakage
              </p>
              <p className="mt-2 text-sm text-foreground">
                {fileType === "image"
                  ? report.thumbnail_present
                    ? `Present (${formatThumbnailSize(report.thumbnail_size_bytes)})`
                    : "Not detected"
                  : "Not applicable"}
              </p>
            </div>
            <div className="rounded-xl border border-border/80 bg-background/45 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                {fileType === "image" ? "GPS Status" : "Hidden Data"}
              </p>
              <p className="mt-2 text-sm text-foreground">
                {fileType === "image"
                  ? report.gps
                    ? "Live coordinates found"
                    : report.gps_warning
                      ? "Invalid GPS block"
                      : "No GPS data"
                  : report.contains_hidden_data
                    ? "Present"
                    : "Not detected"}
              </p>
            </div>
          </div>

          {report.error ? (
            <div className="rounded-xl border border-neon-blue/25 bg-neon-blue/10 p-4 text-sm text-neon-blue">
              {report.error}
            </div>
          ) : null}

          {report.gps ? (
            <div className="space-y-3 rounded-xl border border-neon-red/30 bg-neon-red/10 p-4">
              <div className="flex items-center gap-2 text-neon-red">
                <MapPin className="h-4 w-4" />
                <p className="font-semibold">GPS coordinates exposed</p>
              </div>
              <div className="space-y-1 text-sm text-foreground">
                <p>Latitude: {report.gps.latitude}</p>
                <p>Longitude: {report.gps.longitude}</p>
                <p>Altitude: {report.gps.altitude_m ?? "N/A"} m</p>
              </div>
              <a
                href={report.gps.maps_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex text-sm text-neon-red underline underline-offset-4"
              >
                Open in Google Maps
              </a>
            </div>
          ) : null}

          {!report.gps && report.gps_warning ? (
            <div className="space-y-2 rounded-xl border border-neon-yellow/30 bg-neon-yellow/10 p-4 text-sm">
              <div className="flex items-center gap-2 text-neon-yellow">
                <AlertTriangle className="h-4 w-4" />
                <p className="font-semibold">GPS metadata detected</p>
              </div>
              <p className="text-foreground">{report.gps_warning}</p>
            </div>
          ) : null}

          {report.thumbnail_present ? (
            <div className="rounded-xl border border-neon-yellow/30 bg-neon-yellow/10 p-4 text-sm text-foreground">
              Embedded EXIF thumbnail is present. A preview image may still leak content even before the full file is opened.
            </div>
          ) : null}

          {fileType === "document" && report.contains_hidden_data ? (
            <div className="rounded-xl border border-neon-red/30 bg-neon-red/10 p-4 text-sm text-foreground">
              Hidden document content was detected. Comments, tracked changes, or embedded objects can expose information that is not obvious from the visible file contents alone.
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <MetadataGroup title="Device Fingerprint" icon={Smartphone} entries={report.device} />
            <MetadataGroup title="Timestamps" icon={Clock3} entries={report.timestamps} />
            <MetadataGroup title="Identity & Comments" icon={UserCircle2} entries={report.other_pii} />
          </div>

          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
              Risk Reasons
            </p>
            <div className="flex flex-wrap gap-2">
              {report.risk_reasons.length ? (
                report.risk_reasons.map((reason) => (
                  <span
                    key={reason}
                    className="rounded-full border border-neon-red/30 bg-neon-red/10 px-3 py-1 text-xs text-neon-red"
                  >
                    {reason}
                  </span>
                ))
              ) : (
                <span className="rounded-full border border-neon-green/30 bg-neon-green/10 px-3 py-1 text-xs text-neon-green">
                  No elevated risks detected
                </span>
              )}
            </div>
          </div>

          {report.sensitive_findings.length ? (
            <div className="space-y-4 pt-2">
              <Button
                onClick={() => setShowDetailedView((current) => !current)}
                variant="outline"
                className="border-border bg-background/40 hover:border-neon-blue hover:text-neon-blue"
              >
                {showDetailedView ? "Hide Detailed View" : "Detailed View"}
              </Button>

              {showDetailedView ? (
                <div className="space-y-4">
                  {report.sensitive_findings.map((finding) => (
                    <DetailCard
                      key={`${finding.ifd_name}-${finding.label}-${finding.value}`}
                      finding={finding}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="glass-panel space-y-5 rounded-xl p-6">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-neon-red" />
            <h3 className="text-lg font-semibold text-foreground">How An Attacker Can Use This</h3>
          </div>

          {attackInsights.length ? (
            <div className="space-y-4">
              {attackInsights.map((finding) => {
                const Icon = getFindingIcon(finding.label)

                return (
                  <div
                    key={`${finding.label}-${finding.attacker_use}`}
                    className="space-y-3 rounded-xl border border-neon-red/20 bg-neon-red/5 p-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="rounded-xl bg-neon-red/15 p-2">
                        <Icon className="h-4 w-4 text-neon-red" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-neon-red">{finding.label}</p>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-[0.2em] ${riskBadgeClasses[finding.danger_level]}`}
                          >
                            {finding.danger_level}
                          </span>
                        </div>
                        <p className="text-sm text-foreground">{finding.attacker_use}</p>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">{finding.danger_to_user}</p>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-neon-green/25 bg-neon-green/10 p-4 text-sm text-neon-green">
              No exploitable metadata findings were surfaced from the current scan.
            </div>
          )}

          <div className="rounded-xl border border-neon-blue/20 bg-neon-blue/10 p-4 text-sm text-neon-blue">
            Recommendation: verify the file through Meta-Shield before sharing it externally, even when the exposed metadata looks harmless at first glance.
          </div>
        </section>
      </div>

      {afterReport ? (
        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <section
            className={`
              glass-panel rounded-xl p-6 space-y-5
              ${stripResult?.success ? "neon-glow-green border-neon-green/30" : "border-neon-yellow/30"}
            `}
          >
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-neon-green/15 p-3">
                <CheckCircle2 className="h-6 w-6 text-neon-green" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                  Forensically Clean (After)
                </p>
                <h3 className="text-xl font-semibold text-neon-green">
                  {stripResult?.success ? "Verified Clean Artifact" : "Verification Warning"}
                </h3>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border/80 bg-background/45 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Tags Removed</p>
                <p className="mt-2 text-2xl font-bold text-foreground">{stripResult?.tags_removed ?? 0}</p>
              </div>
              <div className="rounded-xl border border-border/80 bg-background/45 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Duration</p>
                <p className="mt-2 text-2xl font-bold text-foreground">
                  {stripResult?.duration_ms ?? 0} ms
                </p>
              </div>
              <div className="rounded-xl border border-border/80 bg-background/45 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Size Before</p>
                <p className="mt-2 text-sm text-foreground">{stripResult?.size_before_kb ?? 0} KB</p>
              </div>
              <div className="rounded-xl border border-border/80 bg-background/45 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Size After</p>
                <p className="mt-2 text-sm text-foreground">{stripResult?.size_after_kb ?? 0} KB</p>
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-border/80 bg-background/45 p-4 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Sensitive tags remaining</span>
                <span className={afterReport.sensitive_tag_count === 0 ? "text-neon-green" : "text-neon-red"}>
                  {afterReport.sensitive_tag_count}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Embedded thumbnail</span>
                <span className={afterReport.thumbnail_present ? "text-neon-red" : "text-neon-green"}>
                  {afterReport.thumbnail_present ? "STILL PRESENT" : "STRIPPED"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">GPS exposure</span>
                <span className={afterReport.gps ? "text-neon-red" : "text-neon-green"}>
                  {afterReport.gps ? "STILL PRESENT" : "STRIPPED"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Device fingerprint</span>
                <span className={Object.keys(afterReport.device).length ? "text-neon-red" : "text-neon-green"}>
                  {Object.keys(afterReport.device).length ? "STILL PRESENT" : "STRIPPED"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Timestamps</span>
                <span className={Object.keys(afterReport.timestamps).length ? "text-neon-red" : "text-neon-green"}>
                  {Object.keys(afterReport.timestamps).length ? "STILL PRESENT" : "STRIPPED"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Identity / comments</span>
                <span className={Object.keys(afterReport.other_pii).length ? "text-neon-red" : "text-neon-green"}>
                  {Object.keys(afterReport.other_pii).length ? "STILL PRESENT" : "STRIPPED"}
                </span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Cleaned at {stripResult ? formatTimestamp(stripResult.stripped_at) : "N/A"}
            </p>
          </section>

          <section className="glass-panel space-y-4 rounded-xl p-6">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-neon-blue" />
              <h3 className="text-lg font-semibold text-foreground">DLP Interceptor Log</h3>
            </div>

            <div className="space-y-3 rounded-xl border border-border/80 bg-background/45 p-4 font-mono text-sm">
              <div className="flex gap-3 leading-6">
                <span className="shrink-0 font-semibold text-neon-green">[INTERCEPT]</span>
                <span className="break-words text-foreground">
                  File intercepted before leaving the sharing workflow.
                </span>
              </div>
              <div className="flex gap-3 leading-6">
                <span className="shrink-0 font-semibold text-neon-green">[PARSE]</span>
                <span className="break-words text-foreground">
                  {fileType === "image"
                    ? `Binary EXIF payload parsed. ${stripResult?.before.raw_tag_count ?? 0} tags inspected.`
                    : `Document metadata parsed. ${stripResult?.before.raw_tag_count ?? 0} fields inspected.`}
                </span>
              </div>
              <div className="flex gap-3 leading-6">
                <span className="shrink-0 font-semibold text-neon-red">[ALERT]</span>
                <span className="break-words text-foreground">
                  {stripResult?.before.sensitive_tag_count ?? 0} sensitive tags detected ({stripResult?.before.risk_level ?? "LOW"} risk).
                </span>
              </div>
              <div className="flex gap-3 leading-6">
                <span className="shrink-0 font-semibold text-neon-green">[STRIP]</span>
                <span className="break-words text-foreground">
                  {stripResult?.tags_removed ?? 0} tags removed from the outgoing artifact.
                </span>
              </div>
              <div className="flex gap-3 leading-6">
                <span
                  className={`shrink-0 font-semibold ${afterReport.sensitive_tag_count === 0 ? "text-neon-green" : "text-neon-red"}`}
                >
                  [VERIFY]
                </span>
                <span className="break-words text-foreground">
                  Post-strip verification complete. {afterReport.sensitive_tag_count} sensitive tags remaining.
                </span>
              </div>
              <div className="flex gap-3 leading-6">
                <span className="shrink-0 font-semibold text-neon-green">[EXPORT]</span>
                <span className="break-words text-foreground">
                  Clean attachment ready: {firstAttachment?.artifact_output_file ?? stripResult?.clean_file ?? "N/A"}
                </span>
              </div>
              <div className="flex gap-3 leading-6">
                <span className="shrink-0 font-semibold text-neon-green">[EMAIL]</span>
                <span className="break-words text-foreground">
                  Clean email artifact: {String(stripResult?.audit.clean_email_output ?? "N/A")}
                </span>
              </div>
              <div className="flex gap-3 leading-6">
                <span className="shrink-0 font-semibold text-neon-green">[AUDIT]</span>
                <span className="break-words text-foreground">
                  Audit JSON written to: {String(stripResult?.audit.audit_report_output ?? "N/A")}
                </span>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}

function ActionPane({
  report,
  stripResult,
  isCleaning,
  error,
  emailForm,
  isSendingEmail,
  emailError,
  emailResult,
  onEmailFieldChange,
  onSendEmail,
  onClean,
  onDownloadOriginal,
  onDownloadClean,
  onReset,
}: {
  report: MetadataReport
  stripResult: StripResponse | null
  isCleaning: boolean
  error?: string | null
  emailForm: EmailFormState
  isSendingEmail: boolean
  emailError?: string | null
  emailResult: SendEmailResponse | null
  onEmailFieldChange: (field: keyof EmailFormState, value: string) => void
  onSendEmail: () => void | Promise<void>
  onClean: () => void | Promise<void>
  onDownloadOriginal: () => void
  onDownloadClean: () => void
  onReset: () => void
}) {
  const hasSensitiveMetadata =
    report.sensitive_tag_count > 0 ||
    report.thumbnail_present ||
    Boolean(report.gps_warning) ||
    Boolean(report.contains_hidden_data)
  const smtpEnabled = Boolean(stripResult?.smtp_enabled)

  if (stripResult) {
    return (
      <div className="space-y-6">
        <div
          className={`glass-panel rounded-xl p-8 ${stripResult.success ? "neon-glow-green border-neon-green/30" : "border-neon-yellow/30"}`}
        >
          <div className="flex flex-col items-center gap-6 text-center">
            <div className="relative">
              <div className="rounded-full bg-neon-green/20 p-4">
                <CheckCircle2 className="h-12 w-12 text-neon-green" />
              </div>
              <div className="absolute inset-0 animate-pulse rounded-full bg-neon-green/30 blur-xl" />
            </div>

            <div>
              <h3 className="text-2xl font-bold text-neon-green neon-text-green">
                {stripResult.success ? "File Secured" : "Sanitization Completed With Warnings"}
              </h3>
              <p className="mt-2 max-w-2xl text-muted-foreground">
                {stripResult.success
                  ? "The clean artifact has been generated and verified through the Meta-Shield DLP pipeline."
                  : "The artifact was generated, but the verification step still sees some residual metadata. Review the report before sharing."}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
              <Button
                onClick={onDownloadClean}
                className="rounded-xl bg-neon-green px-6 py-6 font-semibold text-background transition-all duration-300 hover:scale-105 hover:bg-neon-green/90"
              >
                <Download className="mr-2 h-5 w-5" />
                Download Clean File
              </Button>
              <Button
                onClick={onDownloadOriginal}
                variant="outline"
                className="rounded-xl border-border bg-background/40 px-6 py-6 transition-all duration-300 hover:border-neon-blue hover:text-neon-blue"
              >
                <Download className="mr-2 h-5 w-5" />
                Download Original
              </Button>
              <Button
                onClick={onReset}
                variant="outline"
                className="rounded-xl border-border bg-background/40 px-6 py-6 transition-all duration-300 hover:border-neon-blue hover:text-neon-blue"
              >
                <RotateCcw className="mr-2 h-5 w-5" />
                Scan Another
              </Button>
            </div>
          </div>
        </div>

        <div className="glass-panel rounded-xl p-6 space-y-5">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-neon-blue" />
            <h3 className="text-lg font-semibold text-foreground">
              Send Sanitized Email
            </h3>
          </div>

          {smtpEnabled ? (
            <>
              <p className="text-sm text-muted-foreground">
                Meta-Shield will send the sanitized attachment through the configured SMTP
                server. The original uploaded file never leaves the app unchanged.
              </p>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Sender
                  </span>
                  <input
                    type="email"
                    value={emailForm.sender}
                    onChange={(event) => onEmailFieldChange("sender", event.target.value)}
                    placeholder="sender@example.com"
                    className="w-full rounded-xl border border-border bg-background/40 px-4 py-3 text-sm text-foreground outline-none transition-colors focus:border-neon-blue"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Recipients
                  </span>
                  <input
                    type="text"
                    value={emailForm.recipients}
                    onChange={(event) => onEmailFieldChange("recipients", event.target.value)}
                    placeholder="alice@example.com, bob@example.com"
                    className="w-full rounded-xl border border-border bg-background/40 px-4 py-3 text-sm text-foreground outline-none transition-colors focus:border-neon-blue"
                  />
                </label>
              </div>

              <label className="space-y-2 block">
                <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Subject
                </span>
                <input
                  type="text"
                  value={emailForm.subject}
                  onChange={(event) => onEmailFieldChange("subject", event.target.value)}
                  placeholder="Sanitized file from Meta-Shield"
                  className="w-full rounded-xl border border-border bg-background/40 px-4 py-3 text-sm text-foreground outline-none transition-colors focus:border-neon-blue"
                />
              </label>

              <label className="space-y-2 block">
                <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Body
                </span>
                <textarea
                  value={emailForm.body}
                  onChange={(event) => onEmailFieldChange("body", event.target.value)}
                  rows={5}
                  placeholder="This attachment was sanitized by Meta-Shield before being shared."
                  className="w-full rounded-xl border border-border bg-background/40 px-4 py-3 text-sm text-foreground outline-none transition-colors focus:border-neon-blue"
                />
              </label>

              <div className="flex flex-wrap items-center gap-4">
                <Button
                  onClick={() => void onSendEmail()}
                  disabled={isSendingEmail}
                  className="rounded-xl bg-gradient-to-r from-neon-blue to-neon-green px-6 py-6 font-semibold text-background transition-all duration-300 hover:scale-[1.01] hover:from-neon-blue/90 hover:to-neon-green/90"
                >
                  {isSendingEmail ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Sending Sanitized Email...
                    </>
                  ) : (
                    <>
                      <SendHorizontal className="mr-2 h-5 w-5" />
                      Send Sanitized Email
                    </>
                  )}
                </Button>

                {stripResult.smtp_default_sender ? (
                  <span className="text-xs text-muted-foreground">
                    Default sender from backend: {stripResult.smtp_default_sender}
                  </span>
                ) : null}
              </div>

              {emailError ? (
                <div className="rounded-xl border border-neon-red/30 bg-neon-red/10 p-4 text-sm text-neon-red">
                  {emailError}
                </div>
              ) : null}

              {emailResult ? (
                <div className="space-y-2 rounded-xl border border-neon-green/30 bg-neon-green/10 p-4 text-sm">
                  <p className="font-semibold text-neon-green">{emailResult.message}</p>
                  <p className="text-foreground">Sender: {emailResult.sender}</p>
                  <p className="text-foreground">
                    Recipients: {emailResult.recipients.join(", ")}
                  </p>
                  <p className="text-foreground">
                    Duration: {emailResult.duration_ms} ms
                  </p>
                  <p className="text-foreground break-words">
                    Clean email artifact: {emailResult.clean_email_output ?? "N/A"}
                  </p>
                </div>
              ) : null}
            </>
          ) : (
            <div className="rounded-xl border border-neon-yellow/30 bg-neon-yellow/10 p-4 text-sm text-foreground">
              SMTP is not configured on the backend yet. Set `SMTP_HOST` and restart the
              Flask server to enable in-app sending.
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="glass-panel space-y-4 rounded-xl p-6">
      <div className="flex flex-col items-center gap-4 lg:flex-row">
        <Button
          onClick={() => void onClean()}
          disabled={isCleaning}
          className={`
            flex-1 w-full rounded-xl px-8 py-6 text-base font-semibold text-background transition-all duration-300
            ${isCleaning
              ? "bg-neon-blue/80"
              : "bg-gradient-to-r from-neon-green to-neon-blue hover:scale-[1.01] hover:from-neon-green/90 hover:to-neon-blue/90"
            }
          `}
        >
          {isCleaning ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Removing Metadata...
            </>
          ) : (
            <>
              <ShieldCheck className="mr-2 h-5 w-5" />
              {hasSensitiveMetadata
                ? "Remove Sensitive Metadata & Secure File"
                : "Generate Verified Clean Copy"}
            </>
          )}
        </Button>

        <Button
          onClick={onDownloadOriginal}
          variant="outline"
          disabled={isCleaning}
          className="w-full rounded-xl border-border bg-background/40 px-8 py-6 text-base font-semibold transition-all duration-300 hover:border-neon-blue hover:text-neon-blue lg:w-auto"
        >
          <Download className="mr-2 h-5 w-5" />
          Download Original
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        {hasSensitiveMetadata
          ? "Meta-Shield will sanitize the file, verify the output, and keep a clean artifact ready for download."
          : "No obvious sensitive metadata was found, but you can still create a verified clean copy before sharing the file."}
      </p>

      {error ? (
        <div className="rounded-xl border border-neon-red/30 bg-neon-red/10 p-4 text-sm text-neon-red">
          {error}
        </div>
      ) : null}
    </div>
  )
}

export default function OpaquePage() {
  const [stage, setStage] = useState<Stage>("upload")
  const [sourceFileName, setSourceFileName] = useState<string | null>(null)
  const [uploadedFilename, setUploadedFilename] = useState<string | null>(null)
  const [scanReport, setScanReport] = useState<MetadataReport | null>(null)
  const [stripResult, setStripResult] = useState<StripResponse | null>(null)
  const [scanLogs, setScanLogs] = useState<ScanLogEntry[]>([])
  const [scanProgress, setScanProgress] = useState(0)
  const [scanError, setScanError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isCleaning, setIsCleaning] = useState(false)
  const [emailForm, setEmailForm] = useState<EmailFormState>({
    sender: "",
    recipients: "",
    subject: "",
    body: "",
  })
  const [isSendingEmail, setIsSendingEmail] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [emailResult, setEmailResult] = useState<SendEmailResponse | null>(null)

  const appendScanLog = (message: string, status: ScanLogEntry["status"]) => {
    setScanLogs((current) => [...current, buildLogEntry(message, status)])
  }

  const resetWorkflow = () => {
    setStage("upload")
    setSourceFileName(null)
    setUploadedFilename(null)
    setScanReport(null)
    setStripResult(null)
    setScanLogs([])
    setScanProgress(0)
    setScanError(null)
    setActionError(null)
    setIsCleaning(false)
    setEmailForm({
      sender: "",
      recipients: "",
      subject: "",
      body: "",
    })
    setIsSendingEmail(false)
    setEmailError(null)
    setEmailResult(null)
  }

  const handleFileUpload = async (file: File) => {
    setStage("scanning")
    setSourceFileName(file.name)
    setUploadedFilename(null)
    setScanReport(null)
    setStripResult(null)
    setScanLogs([])
    setScanProgress(5)
    setScanError(null)
    setActionError(null)

    appendScanLog(`Preparing secure upload queue for ${file.name}`, "info")

    try {
      const formData = new FormData()
      formData.append("file", file)

      const upload = await parseJsonResponse<UploadResponse>(
        await fetch(`${BACKEND_BASE}/upload`, {
          method: "POST",
          body: formData,
        }),
      )

      setUploadedFilename(upload.filename)
      setScanProgress(35)
      appendScanLog(`Upload stored as ${upload.filename}`, "success")
      appendScanLog("Extracting metadata from the uploaded file", "info")

      const report = await parseJsonResponse<MetadataReport>(
        await fetch(`${BACKEND_BASE}/scan`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: upload.filename }),
        }),
      )

      setScanProgress(70)

      if (report.error) {
        appendScanLog(report.error, "info")
      }

      if (report.gps) {
        appendScanLog(
          `GPS coordinates exposed at ${report.gps.latitude}, ${report.gps.longitude}`,
          "error",
        )
      } else if (report.gps_warning) {
        appendScanLog(report.gps_warning, "info")
      } else if (getEffectiveFileType(report) === "image") {
        appendScanLog("No GPS coordinates were present in the uploaded file.", "success")
      }

      if (report.thumbnail_present) {
        appendScanLog(
          `Embedded thumbnail detected (${(report.thumbnail_size_bytes / 1024).toFixed(1)} KB).`,
          "error",
        )
      }

      const deviceFingerprint = Object.values(report.device).filter(Boolean).join(" / ")
      if (deviceFingerprint) {
        appendScanLog(`Device fingerprint found: ${deviceFingerprint}`, "error")
      }

      if (Object.keys(report.timestamps).length) {
        appendScanLog("Timestamp metadata detected in the uploaded file.", "error")
      }

      if (report.contains_hidden_data) {
        appendScanLog("Hidden document content was detected in the uploaded file.", "error")
      }

      if (report.sensitive_findings.length) {
        appendScanLog(
          `Threat assessment complete: ${report.sensitive_findings.length} findings prepared for review (${report.risk_level} risk).`,
          "error",
        )
      } else {
        appendScanLog("Threat assessment complete: no sensitive findings detected.", "success")
      }

      setScanProgress(100)
      setScanReport(report)

      await new Promise((resolve) => window.setTimeout(resolve, 350))
      startTransition(() => setStage("results"))
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The Meta-Shield scan failed unexpectedly."

      appendScanLog(message, "error")
      setScanProgress(100)
      setScanError(message)
    }
  }

  const handleStrip = async () => {
    if (!uploadedFilename) {
      setActionError("No uploaded file is available to clean.")
      return
    }

    setIsCleaning(true)
    setActionError(null)

    try {
      const result = await parseJsonResponse<StripResponse>(
        await fetch(`${BACKEND_BASE}/strip`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: uploadedFilename }),
        }),
      )

      setStripResult(result)
      setEmailError(null)
      setEmailResult(null)
      setEmailForm((current) => ({
        sender: current.sender || result.smtp_default_sender || "",
        recipients: current.recipients,
        subject:
          current.subject ||
          `Sanitized file from Meta-Shield: ${sourceFileName ?? uploadedFilename}`,
        body:
          current.body ||
          "This attachment was sanitized by Meta-Shield before being shared.",
      }))
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to generate a clean artifact."
      setActionError(message)
    } finally {
      setIsCleaning(false)
    }
  }

  const handleEmailFieldChange = (field: keyof EmailFormState, value: string) => {
    setEmailForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  const handleSendEmail = async () => {
    if (!uploadedFilename) {
      setEmailError("No uploaded file is available to send.")
      return
    }

    setIsSendingEmail(true)
    setEmailError(null)
    setEmailResult(null)

    try {
      const result = await parseJsonResponse<SendEmailResponse>(
        await fetch(`${BACKEND_BASE}/send_email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: uploadedFilename,
            sender: emailForm.sender,
            recipients: emailForm.recipients,
            subject: emailForm.subject,
            body: emailForm.body,
          }),
        }),
      )

      setEmailResult(result)
      setEmailForm((current) => ({
        ...current,
        sender: result.sender || current.sender,
      }))
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to send the sanitized email."
      setEmailError(message)
    } finally {
      setIsSendingEmail(false)
    }
  }

  const handleDownloadOriginal = () => {
    if (!uploadedFilename) {
      return
    }

    window.location.assign(
      `${BACKEND_BASE}/download_original?filename=${encodeURIComponent(uploadedFilename)}`,
    )
  }

  const handleDownloadClean = () => {
    window.location.assign(`${BACKEND_BASE}/download_clean`)
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background tech-grid">
      <div className="fixed left-1/4 top-0 h-96 w-96 rounded-full bg-neon-green/10 blur-3xl pointer-events-none" />
      <div className="fixed bottom-0 right-1/4 h-96 w-96 rounded-full bg-neon-blue/10 blur-3xl pointer-events-none" />

      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute h-px w-full animate-scan-line bg-gradient-to-r from-transparent via-neon-green/30 to-transparent" />
      </div>

      <div className="relative z-10 mx-auto max-w-6xl space-y-8 px-4 py-8">
        <Header />

        {stage === "upload" ? (
          <div className="animate-in fade-in duration-500">
            <UploadPane onFileUpload={handleFileUpload} error={scanError ?? actionError} />
          </div>
        ) : null}

        {stage === "scanning" ? (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <ScanPane
              fileName={sourceFileName}
              logs={scanLogs}
              progress={scanProgress}
              error={scanError}
              onReset={resetWorkflow}
            />
          </div>
        ) : null}

        {stage === "results" && scanReport ? (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <ResultsPane
              sourceFileName={sourceFileName}
              uploadedFilename={uploadedFilename}
              report={scanReport}
              stripResult={stripResult}
            />
            <ActionPane
              report={scanReport}
              stripResult={stripResult}
              isCleaning={isCleaning}
              error={actionError}
              emailForm={emailForm}
              isSendingEmail={isSendingEmail}
              emailError={emailError}
              emailResult={emailResult}
              onEmailFieldChange={handleEmailFieldChange}
              onSendEmail={handleSendEmail}
              onClean={handleStrip}
              onDownloadOriginal={handleDownloadOriginal}
              onDownloadClean={handleDownloadClean}
              onReset={resetWorkflow}
            />
          </div>
        ) : null}

        <footer className="pt-8 text-center text-xs text-muted-foreground">
          <p>Opaque Zero Trust Scanner | Powered by the Meta-Shield Flask backend</p>
        </footer>
      </div>
    </div>
  )
}
