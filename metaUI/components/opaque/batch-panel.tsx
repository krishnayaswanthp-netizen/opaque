"use client"

import { Download, FileWarning, Loader2, Mail, RotateCcw, SendHorizontal, ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Callout, DashboardPanel, formatFileSize, MetricCard, RiskBadge, SectionHeading } from "@/components/opaque/dashboard-primitives"
import type { BatchMailResponse, EmailFormState } from "@/lib/metashield-types"

function QueueItem({ file, index }: { file: File; index: number }) {
  return (
    <div
      className="fade-in-up rounded-2xl border border-border/70 bg-background/40 p-4"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{file.name}</p>
          <p className="mt-1 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            {file.name.split(".").pop()?.toUpperCase() ?? "FILE"}
          </p>
        </div>
        <p className="shrink-0 text-sm text-muted-foreground">{formatFileSize(file.size)}</p>
      </div>
    </div>
  )
}

function BatchResultSummary({ result }: { result: BatchMailResponse }) {
  return (
    <div className="space-y-4 rounded-[1.5rem] border border-neon-green/20 bg-neon-green/8 p-4">
      <p className="font-semibold text-neon-green">{result.message ?? "Batch completed"}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <MetricCard label="Processed" value={result.processed} tone="success" />
        <MetricCard label="Failed" value={result.failed} tone={result.failed ? "danger" : "success"} />
        <MetricCard
          label="Risky Files"
          value={result.risk_summary?.risky_files ?? 0}
          tone={(result.risk_summary?.risky_files ?? 0) > 0 ? "warning" : "success"}
        />
        <MetricCard label="Safe Files" value={result.risk_summary?.safe_files ?? 0} tone="info" />
      </div>

      {result.archive_name ? (
        <Callout title="Prepared archive" tone="info" icon={ShieldCheck}>
          {result.archive_name}
        </Callout>
      ) : null}

      <div className="space-y-3">
        {result.details.map((detail, index) => (
          <div
            key={`${detail.filename}-${index}`}
            className="rounded-2xl border border-border/60 bg-background/30 p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-medium text-foreground">{detail.filename}</p>
              {detail.risk_level ? <RiskBadge level={detail.risk_level} /> : null}
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {detail.status === "success"
                ? `${detail.file_type ?? "file"} processed successfully. ${detail.tags_removed ?? 0} tags removed.`
                : detail.reason ?? "Unable to process this file."}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

export function BatchPanel({
  files,
  emailForm,
  zipOutput,
  isPreparing,
  isSending,
  error,
  result,
  onEmailFieldChange,
  onZipOutputChange,
  onPrepare,
  onSend,
  onDownloadPrepared,
  onReset,
}: {
  files: File[]
  emailForm: EmailFormState
  zipOutput: boolean
  isPreparing: boolean
  isSending: boolean
  error?: string | null
  result: BatchMailResponse | null
  onEmailFieldChange: (field: keyof EmailFormState, value: string) => void
  onZipOutputChange: (checked: boolean) => void
  onPrepare: () => void | Promise<void>
  onSend: () => void | Promise<void>
  onDownloadPrepared: () => void
  onReset: () => void
}) {
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0)

  return (
    <div className="space-y-6">
      <DashboardPanel className="space-y-6">
        <SectionHeading
          eyebrow="Batch Delivery"
          title={`${files.length} files queued for one secure handoff`}
          description="The dashboard will sanitize each supported file, continue past per-file failures, and then prepare one ZIP or one outbound email."
          icon={Mail}
        />

        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard label="Selected Files" value={files.length} tone="info" />
          <MetricCard label="Queue Size" value={formatFileSize(totalBytes)} tone="neutral" />
          <MetricCard
            label="Packaging"
            value={zipOutput ? "ZIP bundle" : "Direct attachments"}
            tone={zipOutput ? "success" : "warning"}
          />
        </div>
      </DashboardPanel>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <DashboardPanel className="space-y-5">
          <SectionHeading
            eyebrow="Queue"
            title="Files in the current batch"
            description="Use batch mode when you want one clean ZIP or one outbound email for the entire selection."
            icon={FileWarning}
          />

          <div className="space-y-3">
            {files.map((file, index) => (
              <QueueItem key={`${file.name}-${index}-${file.size}`} file={file} index={index} />
            ))}
          </div>
        </DashboardPanel>

        <DashboardPanel className="space-y-5">
          <SectionHeading
            eyebrow="Delivery Form"
            title="Prepare or send the sanitized batch"
            description="Prepare Clean ZIP works even without SMTP, which makes it the safest first step for local verification."
            icon={ShieldCheck}
          />

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Sender</span>
              <Input
                type="email"
                value={emailForm.sender}
                onChange={(event) => onEmailFieldChange("sender", event.target.value)}
                placeholder="sender@example.com"
                className="rounded-2xl border-border/80 bg-background/45"
              />
            </label>
            <label className="space-y-2">
              <span className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Recipients</span>
              <Input
                type="text"
                value={emailForm.recipients}
                onChange={(event) => onEmailFieldChange("recipients", event.target.value)}
                placeholder="alice@example.com, bob@example.com"
                className="rounded-2xl border-border/80 bg-background/45"
              />
            </label>
          </div>

          <label className="space-y-2 block">
            <span className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Subject</span>
            <Input
              type="text"
              value={emailForm.subject}
              onChange={(event) => onEmailFieldChange("subject", event.target.value)}
              placeholder="Sanitized batch from Meta-Shield"
              className="rounded-2xl border-border/80 bg-background/45"
            />
          </label>

          <label className="space-y-2 block">
            <span className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Body</span>
            <Textarea
              value={emailForm.body}
              onChange={(event) => onEmailFieldChange("body", event.target.value)}
              rows={5}
              placeholder="These files were sanitized by Meta-Shield before being shared."
              className="rounded-2xl border-border/80 bg-background/45"
            />
          </label>

          <label className="flex items-start gap-3 rounded-2xl border border-border/70 bg-background/40 p-4">
            <Checkbox checked={zipOutput} onCheckedChange={(checked) => onZipOutputChange(Boolean(checked))} />
            <div className="space-y-1">
              <p className="font-medium text-foreground">Package cleaned files as one ZIP</p>
              <p className="text-sm leading-6 text-muted-foreground">
                Recommended for large or mixed-format batches and cleaner email delivery.
              </p>
            </div>
          </label>

          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => void onPrepare()}
              disabled={isPreparing}
              variant="outline"
              className="rounded-2xl border-border/80 bg-background/40 px-6 py-6 hover:border-neon-green hover:text-neon-green"
            >
              {isPreparing ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Preparing ZIP...
                </>
              ) : (
                <>
                  <ShieldCheck className="mr-2 h-5 w-5" />
                  Prepare Clean ZIP
                </>
              )}
            </Button>

            <Button
              onClick={() => void onSend()}
              disabled={isSending || isPreparing}
              className="rounded-2xl bg-gradient-to-r from-neon-blue to-neon-green px-6 py-6 text-background hover:scale-[1.01] hover:opacity-95"
            >
              {isSending ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Sending Batch...
                </>
              ) : (
                <>
                  <SendHorizontal className="mr-2 h-5 w-5" />
                  Send One Sanitized Email
                </>
              )}
            </Button>

            {result?.download_url ? (
              <Button
                onClick={onDownloadPrepared}
                variant="outline"
                className="rounded-2xl border-border/80 bg-background/40 px-6 py-6 hover:border-neon-blue hover:text-neon-blue"
              >
                <Download className="mr-2 h-5 w-5" />
                Download Clean ZIP
              </Button>
            ) : null}

            <Button
              onClick={onReset}
              variant="outline"
              className="rounded-2xl border-border/80 bg-background/35 hover:border-neon-blue hover:text-neon-blue"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset
            </Button>
          </div>

          {error ? (
            <Callout title="Batch error" tone="danger">
              {error}
            </Callout>
          ) : null}

          {result ? <BatchResultSummary result={result} /> : null}
        </DashboardPanel>
      </div>
    </div>
  )
}
