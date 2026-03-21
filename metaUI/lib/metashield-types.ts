export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"

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
  file_size_kb: number
  gps: GPSInfo | null
  gps_warning: string | null
  thumbnail_present: boolean
  thumbnail_size_bytes: number
  sensitive_findings: SensitiveFinding[]
  device: Record<string, string>
  timestamps: Record<string, string>
  other_pii: Record<string, string>
  safe_metadata: Record<string, string>
  raw_tag_count: number
  sensitive_tag_count: number
  risk_level: RiskLevel
  risk_reasons: string[]
  error?: string
}

export interface UploadResponse {
  filename: string
  path: string
}

export interface AuditAttachmentReport {
  file?: string
  type?: string
  action?: string
  input_file?: string
  output_file?: string
  artifact_output_file?: string
  tags_removed?: number
  before?: MetadataReport
  after?: MetadataReport
}

export interface AuditReport {
  attachment_reports: AuditAttachmentReport[]
  clean_email_output?: string | null
  audit_report_output?: string | null
  duration_ms?: number
  [key: string]: unknown
}

export interface StripResponse {
  input_file: string
  output_file: string
  artifact_output_file?: string
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
}
