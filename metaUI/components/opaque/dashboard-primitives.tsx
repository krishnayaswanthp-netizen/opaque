"use client"

import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import {
  AlertCircle,
  Clock3,
  Eye,
  MapPin,
  Smartphone,
  UserCircle2,
} from "lucide-react"

import { cn } from "@/lib/utils"
import type { MetadataReport, RiskLevel, ScanLogEntry, SensitiveFinding } from "@/lib/metashield-types"

type PanelAccent = RiskLevel | "neutral" | "success"
type MetricTone = "neutral" | "success" | "warning" | "danger" | "info"
type CalloutTone = "neutral" | "success" | "warning" | "danger" | "info"

export const riskBadgeClasses: Record<RiskLevel, string> = {
  CRITICAL: "border border-neon-red/40 bg-neon-red/15 text-neon-red",
  HIGH: "border border-neon-yellow/40 bg-neon-yellow/15 text-neon-yellow",
  MEDIUM: "border border-neon-blue/40 bg-neon-blue/15 text-neon-blue",
  LOW: "border border-neon-green/40 bg-neon-green/15 text-neon-green",
}

const panelAccentClasses: Record<PanelAccent, string> = {
  neutral: "border-border/70",
  success: "border-neon-green/25",
  LOW: "border-neon-green/25",
  MEDIUM: "border-neon-blue/25",
  HIGH: "border-neon-yellow/25",
  CRITICAL: "border-neon-red/25",
}

const metricToneClasses: Record<MetricTone, string> = {
  neutral: "text-foreground",
  success: "text-neon-green",
  warning: "text-neon-yellow",
  danger: "text-neon-red",
  info: "text-neon-blue",
}

const calloutToneClasses: Record<CalloutTone, string> = {
  neutral: "border-border/80 bg-background/40 text-foreground",
  success: "border-neon-green/30 bg-neon-green/10 text-neon-green",
  warning: "border-neon-yellow/30 bg-neon-yellow/10 text-neon-yellow",
  danger: "border-neon-red/30 bg-neon-red/10 text-neon-red",
  info: "border-neon-blue/30 bg-neon-blue/10 text-neon-blue",
}

export function DashboardPanel({
  children,
  className,
  accent = "neutral",
}: {
  children: ReactNode
  className?: string
  accent?: PanelAccent
}) {
  return (
    <section
      className={cn(
        "glass-panel group relative overflow-hidden rounded-[1.75rem] border px-5 py-5 shadow-[0_24px_80px_rgba(0,0,0,0.18)] transition-transform duration-300 hover:-translate-y-0.5 sm:px-6 sm:py-6",
        panelAccentClasses[accent],
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="pointer-events-none absolute right-0 top-0 h-28 w-28 rounded-full bg-white/5 blur-3xl opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
      {children}
    </section>
  )
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  icon: Icon,
  action,
  className,
}: {
  eyebrow?: string
  title: string
  description?: string
  icon?: LucideIcon
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="space-y-2">
        {eyebrow ? (
          <p className="text-[11px] uppercase tracking-[0.32em] text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        <div className="flex items-center gap-3">
          {Icon ? (
            <span className="rounded-2xl border border-white/10 bg-background/60 p-2.5 text-neon-blue shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
              <Icon className="h-4 w-4" />
            </span>
          ) : null}
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {title}
            </h2>
            {description ? (
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

export function RiskBadge({ level }: { level: RiskLevel }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.28em]",
        riskBadgeClasses[level],
      )}
    >
      {level}
    </span>
  )
}

export function MetricCard({
  label,
  value,
  hint,
  tone = "neutral",
  icon: Icon,
  className,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: MetricTone
  icon?: LucideIcon
  className?: string
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border/70 bg-background/45 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.26em] text-muted-foreground">
            {label}
          </p>
          <div className={cn("text-2xl font-semibold tracking-tight", metricToneClasses[tone])}>
            {value}
          </div>
        </div>
        {Icon ? (
          <span className="rounded-2xl border border-white/10 bg-background/60 p-2 text-neon-blue">
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
      </div>
      {hint ? <p className="mt-3 text-sm leading-6 text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

export function Callout({
  title,
  icon: Icon,
  tone = "neutral",
  children,
  className,
}: {
  title: string
  icon?: LucideIcon
  tone?: CalloutTone
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
        calloutToneClasses[tone],
        className,
      )}
    >
      <div className="flex items-start gap-3">
        {Icon ? <Icon className="mt-0.5 h-4 w-4 shrink-0" /> : null}
        <div className="space-y-1">
          <p className="font-medium">{title}</p>
          <div className="text-sm leading-6 text-current/90">{children}</div>
        </div>
      </div>
    </div>
  )
}

export function MetadataGroup({
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
    <div className="space-y-4 rounded-2xl border border-border/70 bg-background/40 p-4">
      <div className="flex items-center gap-2">
        <span className="rounded-xl border border-white/10 bg-background/60 p-2 text-neon-blue">
          <Icon className="h-4 w-4" />
        </span>
        <h3 className="text-sm font-semibold tracking-wide text-foreground">{title}</h3>
      </div>

      <div className="space-y-4">
        {rows.map(([key, value]) => (
          <div key={key} className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
              {formatKeyLabel(key)}
            </p>
            <p className="break-words text-sm leading-6 text-foreground">{value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export function FindingCard({
  finding,
  index = 0,
}: {
  finding: SensitiveFinding
  index?: number
}) {
  const Icon = getFindingIcon(finding.label)

  return (
    <article
      className="fade-in-up rounded-2xl border border-border/70 bg-background/45 p-4"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="rounded-2xl border border-white/10 bg-background/70 p-2 text-neon-blue">
              <Icon className="h-4 w-4" />
            </span>
            <div>
              <p className="font-semibold text-foreground">{finding.label}</p>
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                {finding.ifd_name} block
              </p>
            </div>
          </div>
          <RiskBadge level={finding.danger_level} />
        </div>

        <div className="grid gap-3 text-sm lg:grid-cols-2">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              Found Value
            </p>
            <p className="mt-1 break-words font-mono text-neon-blue">{finding.value}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              What It Is
            </p>
            <p className="mt-1 leading-6 text-foreground">{finding.description}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              Attacker Use
            </p>
            <p className="mt-1 leading-6 text-foreground">{finding.attacker_use}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              Danger To User
            </p>
            <p className="mt-1 leading-6 text-foreground">{finding.danger_to_user}</p>
          </div>
        </div>
      </div>
    </article>
  )
}

export function formatKeyLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

export function formatTimestamp(value: string) {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString()
}

export function formatThumbnailSize(bytes: number) {
  return `${(bytes / 1024).toFixed(1)} KB`
}

export function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return `${(bytes / 1024).toFixed(1)} KB`
}

export function getEffectiveFileType(report: MetadataReport) {
  return report.file_type ?? "image"
}

export function getFindingIcon(label: string): LucideIcon {
  if (label.startsWith("GPS") || label.includes("Location")) {
    return MapPin
  }

  if (label.includes("Date") || label.includes("Time") || label.includes("Timestamp")) {
    return Clock3
  }

  if (
    label.includes("Camera") ||
    label.includes("Device") ||
    label.includes("Lens") ||
    label.includes("Software") ||
    label.includes("Encoder") ||
    label.includes("Maker")
  ) {
    return Smartphone
  }

  if (label.includes("Thumbnail") || label.includes("Embedded")) {
    return Eye
  }

  if (label.includes("Artist") || label.includes("Owner") || label.includes("Host")) {
    return UserCircle2
  }

  return AlertCircle
}

export function buildAttackerInsights(findings: SensitiveFinding[]) {
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

export function buildScanLogEntry(
  message: string,
  status: ScanLogEntry["status"],
): ScanLogEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    message,
    status,
  }
}
