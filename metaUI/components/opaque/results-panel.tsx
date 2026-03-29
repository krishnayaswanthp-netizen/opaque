"use client"

import { useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Eye,
  FileWarning,
  MapPin,
  ShieldCheck,
  Smartphone,
  UserCircle2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  buildAttackerInsights,
  Callout,
  DashboardPanel,
  FindingCard,
  formatFileSize,
  formatThumbnailSize,
  formatTimestamp,
  getEffectiveFileType,
  MetadataGroup,
  MetricCard,
  RiskBadge,
  SectionHeading,
} from "@/components/opaque/dashboard-primitives"
import type { MetadataReport, StripResponse } from "@/lib/metashield-types"

export function ResultsPanel({
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
  const attackerInsights = buildAttackerInsights(report.sensitive_findings).slice(0, 4)
  const afterReport = stripResult?.after ?? null
  const verificationReady = Boolean(stripResult?.success)
  const visibleFindings = showDetailedView
    ? report.sensitive_findings
    : report.sensitive_findings.slice(0, 4)

  return (
    <div className="space-y-6">
      <DashboardPanel accent={totalFindings ? report.risk_level : "LOW"} className="space-y-6">
        <SectionHeading
          eyebrow="Threat Snapshot"
          title={
            totalFindings
              ? `${report.risk_level} exposure detected`
              : "No elevated metadata findings"
          }
          description={
            report.risk_reasons[0] ??
            "Meta-Shield finished the initial review and summarized the uploaded file below."
          }
          icon={totalFindings ? AlertTriangle : ShieldCheck}
          action={<RiskBadge level={report.risk_level} />}
        />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Source File"
            value={sourceFileName ?? "Uploaded file"}
            hint={uploadedFilename ? `Stored as ${uploadedFilename}` : "Awaiting backend storage"}
          />
          <MetricCard
            label="Sensitive Findings"
            value={totalFindings}
            hint={`${report.raw_tag_count} total metadata tags inspected`}
            tone={totalFindings ? "danger" : "success"}
          />
          <MetricCard
            label="File Size"
            value={formatFileSize(report.file_size_kb * 1024)}
            hint={fileType === "media" ? "Large media files stay in the same sanitization pipeline." : "Safe copies are generated in project-local outputs."}
            tone="info"
          />
          <MetricCard
            label={fileType === "image" ? "GPS / Hidden Data" : "Container Risk"}
            value={
              fileType === "image"
                ? report.gps
                  ? "Coordinates found"
                  : report.gps_warning
                    ? "GPS block present"
                    : "No GPS data"
                : report.contains_hidden_data
                  ? "Hidden content present"
                  : "No hidden payloads"
            }
            tone={
              report.gps || report.contains_hidden_data
                ? "danger"
                : report.gps_warning
                  ? "warning"
                  : "success"
            }
            hint={
              fileType === "image"
                ? report.thumbnail_present
                  ? `Thumbnail leakage: ${formatThumbnailSize(report.thumbnail_size_bytes)}`
                  : "No embedded thumbnail detected"
                : report.media_type
                  ? `${report.media_type} container`
                  : report.document_type ?? "Document container"
            }
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {report.gps ? (
            <Callout title="Precise coordinates are exposed" tone="danger" icon={MapPin}>
              <p>Latitude: {report.gps.latitude}</p>
              <p>Longitude: {report.gps.longitude}</p>
              <p>Altitude: {report.gps.altitude_m ?? "N/A"} m</p>
              <a
                href={report.gps.maps_url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex text-neon-red underline underline-offset-4"
              >
                Open in Google Maps
              </a>
            </Callout>
          ) : null}

          {!report.gps && report.gps_warning ? (
            <Callout title="GPS metadata block detected" tone="warning" icon={AlertTriangle}>
              {report.gps_warning}
            </Callout>
          ) : null}

          {report.thumbnail_present ? (
            <Callout title="Embedded thumbnail leakage" tone="warning" icon={Eye}>
              A preview image is still embedded in the file and may reveal content before the full
              asset is opened.
            </Callout>
          ) : null}

          {report.contains_hidden_data ? (
            <Callout title="Hidden content or side data detected" tone="danger" icon={FileWarning}>
              Comments, tracked revisions, cover art, attachment streams, or embedded objects can
              survive even when the visible file looks harmless.
            </Callout>
          ) : null}

          {report.error ? (
            <Callout title="Scanner note" tone="info" icon={AlertTriangle}>
              {report.error}
            </Callout>
          ) : null}
        </div>
      </DashboardPanel>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <DashboardPanel className="space-y-5">
          <SectionHeading
            eyebrow="Exposure Surface"
            title="Metadata exposed before sanitization"
            description="The grouped view below keeps the raw findings readable while still showing the exact fields that create risk."
            icon={FileWarning}
          />

          <div className="grid gap-4 md:grid-cols-3">
            <MetadataGroup title="Device Fingerprint" icon={Smartphone} entries={report.device} />
            <MetadataGroup title="Timestamps" icon={Clock3} entries={report.timestamps} />
            <MetadataGroup title="Identity & Comments" icon={UserCircle2} entries={report.other_pii} />
          </div>

          {!report.device || (!Object.keys(report.device).length &&
            !Object.keys(report.timestamps).length &&
            !Object.keys(report.other_pii).length) ? (
            <Callout title="No grouped metadata surfaced" tone="success" icon={CheckCircle2}>
              Meta-Shield did not detect a grouped set of identity, time, or device fields in this file.
            </Callout>
          ) : null}
        </DashboardPanel>

        <div className="space-y-6">
          <DashboardPanel className="space-y-5">
            <SectionHeading
              eyebrow="Threat Model"
              title="How this data can be abused"
              description="We deduplicate the attacker perspective so you get concise, scenario-oriented risk explanations instead of a noisy list."
              icon={AlertTriangle}
            />

            <div className="flex flex-wrap gap-2">
              {report.risk_reasons.length ? (
                report.risk_reasons.map((reason) => (
                  <span
                    key={reason}
                    className="rounded-full border border-white/10 bg-background/45 px-3 py-1.5 text-xs text-muted-foreground"
                  >
                    {reason}
                  </span>
                ))
              ) : (
                <span className="rounded-full border border-neon-green/30 bg-neon-green/10 px-3 py-1.5 text-xs text-neon-green">
                  No elevated risk reasons detected
                </span>
              )}
            </div>

            <div className="space-y-3">
              {attackerInsights.length ? (
                attackerInsights.map((insight, index) => (
                  <div
                    key={`${insight.attacker_use}-${index}`}
                    className="fade-in-up rounded-2xl border border-border/70 bg-background/40 p-4"
                    style={{ animationDelay: `${index * 70}ms` }}
                  >
                    <p className="font-medium text-foreground">{insight.attacker_use}</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {insight.danger_to_user}
                    </p>
                  </div>
                ))
              ) : (
                <Callout title="Low observed exposure" tone="success" icon={CheckCircle2}>
                  The scan did not surface attacker-use patterns worth escalating for this file.
                </Callout>
              )}
            </div>

            {report.recommendations?.length ? (
              <div className="rounded-2xl border border-neon-blue/20 bg-neon-blue/10 p-4">
                <p className="text-[11px] uppercase tracking-[0.26em] text-neon-blue">
                  Recommendations
                </p>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-foreground">
                  {report.recommendations.map((recommendation) => (
                    <li key={recommendation}>• {recommendation}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </DashboardPanel>

          <DashboardPanel className="space-y-5">
            <SectionHeading
              eyebrow="Detailed View"
              title="Sensitive findings"
              description="Each item explains the exposed value, why it matters, and how an attacker could turn it into a practical risk."
              icon={AlertTriangle}
              action={
                report.sensitive_findings.length ? (
                  <Button
                    onClick={() => setShowDetailedView((current) => !current)}
                    variant="outline"
                    className="rounded-2xl border-border/80 bg-background/40 hover:border-neon-blue hover:text-neon-blue"
                  >
                    {showDetailedView ? "Show Less" : "Show All"}
                  </Button>
                ) : null
              }
            />

            {visibleFindings.length ? (
              <div className="space-y-4">
                {visibleFindings.map((finding, index) => (
                  <FindingCard
                    key={`${finding.ifd_name}-${finding.label}-${finding.value}`}
                    finding={finding}
                    index={index}
                  />
                ))}
              </div>
            ) : (
              <Callout title="No sensitive findings" tone="success" icon={CheckCircle2}>
                This file did not expose any high-signal metadata in the current scan.
              </Callout>
            )}
          </DashboardPanel>

          {afterReport ? (
            <DashboardPanel accent={verificationReady ? "success" : report.risk_level} className="space-y-5">
              <SectionHeading
                eyebrow="Verification"
                title={verificationReady ? "Clean copy is ready" : "Sanitized copy still needs review"}
                description="Meta-Shield rescanned the generated output and stored audit artifacts so you can verify the cleaned file before sharing it."
                icon={verificationReady ? ShieldCheck : AlertTriangle}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <MetricCard
                  label="Tags Removed"
                  value={stripResult.tags_removed}
                  tone={stripResult.tags_removed > 0 ? "success" : "warning"}
                  hint={`${stripResult.duration_ms} ms end-to-end clean and verification`}
                />
                <MetricCard
                  label="Post-clean Findings"
                  value={afterReport.sensitive_tag_count}
                  tone={afterReport.sensitive_tag_count ? "danger" : "success"}
                  hint={verificationReady ? "No sensitive findings remain" : "Re-review before external sharing"}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Callout title="Clean artifact" tone={verificationReady ? "success" : "warning"} icon={CheckCircle2}>
                  {stripResult.clean_file}
                </Callout>
                <Callout title="Audit exports" tone="info" icon={ShieldCheck}>
                  <p>{stripResult.audit.clean_email_output ?? "No clean email artifact yet"}</p>
                  <p>{stripResult.audit.audit_report_output ?? "Audit JSON path unavailable"}</p>
                </Callout>
              </div>

              <p className="text-sm leading-6 text-muted-foreground">
                Sanitized at {formatTimestamp(stripResult.stripped_at)}. Size changed from{" "}
                {formatFileSize(stripResult.size_before_kb * 1024)} to{" "}
                {formatFileSize(stripResult.size_after_kb * 1024)}.
              </p>
            </DashboardPanel>
          ) : null}
        </div>
      </div>
    </div>
  )
}
