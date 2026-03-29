export type Stage = "upload" | "scanning" | "results" | "batch"
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
export type FileType = "image" | "document" | "media"
export type MediaType = "video" | "audio" | "media"
export type ScanLogStatus = "info" | "success" | "error"

export const ACCEPTED_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".tif",
  ".tiff",
  ".pdf",
  ".docx",
  ".mp4",
  ".mov",
  ".mkv",
  ".mp3",
  ".wav",
  ".aac",
] as const

export interface GPSInfo {
  latitude: number
  longitude: number
  altitude_m: number | null
  maps_url: string
}

export interface SensitiveFinding {
  label: string
  value: string
  ifd_name: string
  description: string
  attacker_use: string
  danger_to_user: string
  danger_level: RiskLevel
}

export interface MetadataReport {
  file: string
  file_type?: FileType
  document_type?: string | null
  media_type?: MediaType | null
  file_size_kb: number
  gps: GPSInfo | null
  gps_warning: string | null
  thumbnail_present: boolean
  thumbnail_size_bytes: number
  sensitive_findings: SensitiveFinding[]
  device: Record<string, string>
  timestamps: Record<string, string>
  other_pii: Record<string, string>
  safe_metadata?: Record<string, unknown>
  raw_tag_count: number
  sensitive_tag_count: number
  risk_level: RiskLevel
  risk_reasons: string[]
  score?: number
  contains_hidden_data?: boolean
  recommendations?: string[]
  error?: string
}

export interface AuditAttachmentReport {
  artifact_output_file?: string
  before?: MetadataReport
}

export interface AuditReport {
  attachment_reports: AuditAttachmentReport[]
  clean_email_output?: string | null
  audit_report_output?: string | null
}

export interface StripResponse {
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

export interface UploadResponse {
  filename: string
  path?: string
}

export interface EmailFormState {
  sender: string
  recipients: string
  subject: string
  body: string
}

export interface SendEmailResponse {
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

export interface BatchMailDetail {
  filename: string
  status: "success" | "failed"
  reason?: string | null
  file_type?: FileType | null
  risk_level?: RiskLevel | null
  contains_hidden_data?: boolean | null
  tags_removed?: number | null
  output_filename?: string | null
}

export interface BatchMailResponse {
  message?: string
  error?: string
  total_files: number
  processed: number
  failed: number
  details: BatchMailDetail[]
  risk_summary?: {
    safe_files: number
    risky_files: number
  }
  zip_output?: boolean
  sender?: string
  recipients?: string[]
  subject?: string
  attachment_count?: number
  archive_name?: string | null
  download_url?: string | null
  download_artifact?: string | null
}

export interface ScanLogEntry {
  id: string
  message: string
  status: ScanLogStatus
}

export interface SendEmailPayload {
  filename: string
  sender: string
  recipients: string
  subject: string
  body: string
}

export interface SendBatchPayload {
  files: File[]
  sender: string
  recipients: string
  subject: string
  body: string
  zipOutput: boolean
}
