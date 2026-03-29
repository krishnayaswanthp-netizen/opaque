"use client"

import type { ReactNode } from "react"
import {
  Download,
  Loader2,
  Mail,
  RotateCcw,
  SendHorizontal,
  ShieldCheck,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Callout, DashboardPanel, MetricCard, SectionHeading } from "@/components/opaque/dashboard-primitives"
import type { EmailFormState, MetadataReport, SendEmailResponse, StripResponse } from "@/lib/metashield-types"

function EmailField({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="space-y-2">
      <span className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

export function ActionPanel({
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
  const hasSensitiveMetadata = report.sensitive_findings.length > 0

  return (
    <DashboardPanel accent={stripResult ? "success" : report.risk_level} className="space-y-6">
      <SectionHeading
        eyebrow="Actions"
        title={stripResult ? "Deliver the clean artifact" : "Sanitize and verify"}
        description={
          stripResult
            ? "The clean copy is ready. Download it, verify the audit artifacts, or send the sanitized file without leaving the dashboard."
            : "Generate a verified clean copy first. Meta-Shield will sanitize the file and immediately rescan the output."
        }
        icon={stripResult ? Mail : ShieldCheck}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <MetricCard
              label="Current Status"
              value={stripResult ? "Clean artifact ready" : "Source pending clean pass"}
              tone={stripResult ? "success" : hasSensitiveMetadata ? "warning" : "info"}
              hint={
                stripResult
                  ? `${stripResult.tags_removed} tags removed and verified`
                  : hasSensitiveMetadata
                    ? "Sensitive metadata is still present in the uploaded source file."
                    : "You can still generate a verified clean copy before sharing."
              }
            />
            <MetricCard
              label="Next Step"
              value={stripResult ? "Deliver or archive" : "Run sanitization"}
              tone={stripResult ? "info" : "neutral"}
              hint={
                stripResult
                  ? "Download or send the sanitized output."
                  : "Meta-Shield will create a cleaned artifact in the outputs pipeline."
              }
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => void onClean()}
              disabled={isCleaning}
              className="rounded-2xl bg-gradient-to-r from-neon-green to-neon-blue px-6 py-6 text-base font-semibold text-background hover:scale-[1.01] hover:opacity-95"
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
                    ? "Remove Sensitive Metadata"
                    : "Generate Verified Clean Copy"}
                </>
              )}
            </Button>

            <Button
              onClick={onDownloadOriginal}
              variant="outline"
              disabled={isCleaning}
              className="rounded-2xl border-border/80 bg-background/40 px-6 py-6 text-base hover:border-neon-blue hover:text-neon-blue"
            >
              <Download className="mr-2 h-5 w-5" />
              Download Original
            </Button>

            {stripResult ? (
              <Button
                onClick={onDownloadClean}
                variant="outline"
                className="rounded-2xl border-border/80 bg-background/40 px-6 py-6 text-base hover:border-neon-green hover:text-neon-green"
              >
                <Download className="mr-2 h-5 w-5" />
                Download Clean Copy
              </Button>
            ) : null}
          </div>

          {isCleaning ? (
            <Callout title="Sanitization in progress" tone="info" icon={Loader2}>
              Meta-Shield is cleaning the uploaded file, writing a clean artifact, and rescanning it before making the result available.
            </Callout>
          ) : null}

          {error ? (
            <Callout title="Action error" tone="danger">
              {error}
            </Callout>
          ) : null}

          <Button
            onClick={onReset}
            variant="outline"
            className="rounded-2xl border-border/80 bg-background/35 hover:border-neon-blue hover:text-neon-blue"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Start another review
          </Button>
        </div>

        <div className="space-y-4 rounded-[1.75rem] border border-border/70 bg-background/35 p-5">
          <SectionHeading
            eyebrow="Delivery"
            title="Send the sanitized file"
            description="The message body and addressing stay in the dashboard, while SMTP transport remains configured on the backend."
            icon={Mail}
          />

          {!stripResult ? (
            <Callout title="Generate the clean copy first" tone="warning">
              The send flow is unlocked after the file has been sanitized and verified.
            </Callout>
          ) : null}

          {stripResult && !stripResult.smtp_enabled ? (
            <Callout title="SMTP is not configured yet" tone="warning">
              Configure `SMTP_HOST` on the backend to enable in-app delivery. The clean file can
              still be downloaded locally right now.
            </Callout>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <EmailField label="Sender">
              <Input
                type="email"
                value={emailForm.sender}
                onChange={(event) => onEmailFieldChange("sender", event.target.value)}
                placeholder="sender@example.com"
                disabled={!stripResult || isSendingEmail}
                className="rounded-2xl border-border/80 bg-background/45"
              />
            </EmailField>
            <EmailField label="Recipients">
              <Input
                type="text"
                value={emailForm.recipients}
                onChange={(event) => onEmailFieldChange("recipients", event.target.value)}
                placeholder="alice@example.com, bob@example.com"
                disabled={!stripResult || isSendingEmail}
                className="rounded-2xl border-border/80 bg-background/45"
              />
            </EmailField>
          </div>

          <EmailField label="Subject">
            <Input
              type="text"
              value={emailForm.subject}
              onChange={(event) => onEmailFieldChange("subject", event.target.value)}
              placeholder="Sanitized file from Meta-Shield"
              disabled={!stripResult || isSendingEmail}
              className="rounded-2xl border-border/80 bg-background/45"
            />
          </EmailField>

          <EmailField label="Body">
            <Textarea
              value={emailForm.body}
              onChange={(event) => onEmailFieldChange("body", event.target.value)}
              rows={5}
              placeholder="This attachment was sanitized by Meta-Shield before being shared."
              disabled={!stripResult || isSendingEmail}
              className="rounded-2xl border-border/80 bg-background/45"
            />
          </EmailField>

          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => void onSendEmail()}
              disabled={!stripResult || isSendingEmail}
              className="rounded-2xl bg-gradient-to-r from-neon-blue to-neon-green px-6 py-6 text-base font-semibold text-background hover:scale-[1.01] hover:opacity-95"
            >
              {isSendingEmail ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Sending Email...
                </>
              ) : (
                <>
                  <SendHorizontal className="mr-2 h-5 w-5" />
                  Send Sanitized Email
                </>
              )}
            </Button>
          </div>

          {emailError ? (
            <Callout title="Delivery error" tone="danger">
              {emailError}
            </Callout>
          ) : null}

          {emailResult ? (
            <Callout title="Delivery completed" tone="success" icon={ShieldCheck}>
              <p>{emailResult.message}</p>
              <p>Subject: {emailResult.subject}</p>
              <p>Recipients: {emailResult.recipients.join(", ")}</p>
            </Callout>
          ) : null}
        </div>
      </div>
    </DashboardPanel>
  )
}
