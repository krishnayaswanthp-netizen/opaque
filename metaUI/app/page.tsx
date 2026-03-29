"use client"

import { startTransition, useState } from "react"

import { ActionPanel } from "@/components/opaque/action-panel"
import { BatchPanel } from "@/components/opaque/batch-panel"
import { buildScanLogEntry } from "@/components/opaque/dashboard-primitives"
import { Header } from "@/components/opaque/header"
import { ResultsPanel } from "@/components/opaque/results-panel"
import { ScanLogs } from "@/components/opaque/scan-logs"
import { UploadBox } from "@/components/opaque/upload-box"
import {
  ApiPayloadError,
  getBatchDownloadUrl,
  getCleanDownloadUrl,
  getOriginalDownloadUrl,
  prepareBatchClean,
  scanFile,
  sendBatchEmail,
  sendSanitizedEmail,
  stripFile,
  uploadFile,
} from "@/lib/metashield-client"
import type {
  BatchMailResponse,
  EmailFormState,
  ScanLogEntry,
  SendEmailResponse,
  Stage,
  StripResponse,
  MetadataReport,
} from "@/lib/metashield-types"

function createEmptyEmailForm(): EmailFormState {
  return {
    sender: "",
    recipients: "",
    subject: "",
    body: "",
  }
}

function isBatchMailResponse(value: unknown): value is BatchMailResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "total_files" in value &&
    "processed" in value &&
    "failed" in value &&
    "details" in value
  )
}

function sleep(durationMs: number) {
  return new Promise((resolve) => window.setTimeout(resolve, durationMs))
}

export default function OpaquePage() {
  const [stage, setStage] = useState<Stage>("upload")
  const [sourceFileName, setSourceFileName] = useState<string | null>(null)
  const [uploadedFilename, setUploadedFilename] = useState<string | null>(null)
  const [selectedBatchFiles, setSelectedBatchFiles] = useState<File[]>([])
  const [scanReport, setScanReport] = useState<MetadataReport | null>(null)
  const [stripResult, setStripResult] = useState<StripResponse | null>(null)
  const [batchResult, setBatchResult] = useState<BatchMailResponse | null>(null)
  const [scanLogs, setScanLogs] = useState<ScanLogEntry[]>([])
  const [scanProgress, setScanProgress] = useState(0)
  const [scanError, setScanError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [batchError, setBatchError] = useState<string | null>(null)
  const [isCleaning, setIsCleaning] = useState(false)
  const [emailForm, setEmailForm] = useState<EmailFormState>(createEmptyEmailForm)
  const [batchZipOutput, setBatchZipOutput] = useState(true)
  const [isPreparingBatch, setIsPreparingBatch] = useState(false)
  const [isSendingEmail, setIsSendingEmail] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [emailResult, setEmailResult] = useState<SendEmailResponse | null>(null)

  const appendScanLog = (message: string, status: ScanLogEntry["status"]) => {
    setScanLogs((current) => [...current, buildScanLogEntry(message, status)])
  }

  const resetWorkflow = () => {
    startTransition(() => setStage("upload"))
    setSourceFileName(null)
    setUploadedFilename(null)
    setSelectedBatchFiles([])
    setScanReport(null)
    setStripResult(null)
    setBatchResult(null)
    setScanLogs([])
    setScanProgress(0)
    setScanError(null)
    setActionError(null)
    setBatchError(null)
    setIsCleaning(false)
    setEmailForm(createEmptyEmailForm())
    setBatchZipOutput(true)
    setIsPreparingBatch(false)
    setIsSendingEmail(false)
    setEmailError(null)
    setEmailResult(null)
  }

  const handleSingleFileUpload = async (file: File) => {
    startTransition(() => setStage("scanning"))
    setSourceFileName(file.name)
    setUploadedFilename(null)
    setSelectedBatchFiles([])
    setScanReport(null)
    setStripResult(null)
    setBatchResult(null)
    setScanLogs([])
    setScanProgress(5)
    setScanError(null)
    setActionError(null)
    setBatchError(null)
    setEmailError(null)
    setEmailResult(null)

    appendScanLog(`Preparing secure upload queue for ${file.name}`, "info")

    try {
      const upload = await uploadFile(file)
      setUploadedFilename(upload.filename)
      setScanProgress(35)
      appendScanLog(`Upload stored as ${upload.filename}`, "success")
      appendScanLog("Extracting metadata from the uploaded file", "info")

      const report = await scanFile(upload.filename)
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
      } else if ((report.file_type ?? "image") === "image") {
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
        appendScanLog(
          "Hidden content or auxiliary container streams were detected in the uploaded file.",
          "error",
        )
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

      await sleep(280)
      startTransition(() => setStage("results"))
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The Meta-Shield scan failed unexpectedly."

      appendScanLog(message, "error")
      setScanProgress(100)
      setScanError(message)
    }
  }

  const handleBatchSelection = (files: File[]) => {
    startTransition(() => setStage("batch"))
    setSourceFileName(null)
    setUploadedFilename(null)
    setSelectedBatchFiles(files)
    setScanReport(null)
    setStripResult(null)
    setBatchResult(null)
    setScanLogs([])
    setScanProgress(0)
    setScanError(null)
    setActionError(null)
    setBatchError(null)
    setIsCleaning(false)
    setIsSendingEmail(false)
    setEmailError(null)
    setEmailResult(null)
    setBatchZipOutput(true)
    setEmailForm({
      sender: "",
      recipients: "",
      subject: `Sanitized batch from Meta-Shield: ${files.length} files`,
      body: "These attachments were sanitized by Meta-Shield before being shared.",
    })
  }

  const handleFilesSelected = async (files: File[]) => {
    if (files.length <= 1) {
      if (files[0]) {
        await handleSingleFileUpload(files[0])
      }
      return
    }

    handleBatchSelection(files)
  }

  const handleStrip = async () => {
    if (!uploadedFilename) {
      setActionError("No uploaded file is available to clean.")
      return
    }

    setIsCleaning(true)
    setActionError(null)

    try {
      const result = await stripFile(uploadedFilename)
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
      const result = await sendSanitizedEmail({
        filename: uploadedFilename,
        sender: emailForm.sender,
        recipients: emailForm.recipients,
        subject: emailForm.subject,
        body: emailForm.body,
      })

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

  const handleBatchPrepare = async () => {
    if (!selectedBatchFiles.length) {
      setBatchError("No files are queued for clean batch preparation.")
      return
    }

    setIsPreparingBatch(true)
    setBatchError(null)

    try {
      const result = await prepareBatchClean(selectedBatchFiles)
      setBatchResult(result)
    } catch (error) {
      if (error instanceof ApiPayloadError && isBatchMailResponse(error.payload)) {
        setBatchResult(error.payload)
      }

      const message =
        error instanceof Error ? error.message : "Unable to prepare the sanitized batch ZIP."
      setBatchError(message)
    } finally {
      setIsPreparingBatch(false)
    }
  }

  const handleBatchSend = async () => {
    if (!selectedBatchFiles.length) {
      setBatchError("No files are queued for batch delivery.")
      return
    }

    setIsSendingEmail(true)
    setBatchError(null)

    try {
      const result = await sendBatchEmail({
        files: selectedBatchFiles,
        sender: emailForm.sender,
        recipients: emailForm.recipients,
        subject: emailForm.subject,
        body: emailForm.body,
        zipOutput: batchZipOutput,
      })

      setBatchResult((current) => ({
        ...current,
        ...result,
        download_url: result.download_url ?? current?.download_url ?? null,
        download_artifact: result.download_artifact ?? current?.download_artifact ?? null,
      }))
    } catch (error) {
      if (error instanceof ApiPayloadError && isBatchMailResponse(error.payload)) {
        setBatchResult(error.payload)
      }

      const message =
        error instanceof Error ? error.message : "Unable to send the sanitized batch email."
      setBatchError(message)
    } finally {
      setIsSendingEmail(false)
    }
  }

  const handleDownloadOriginal = () => {
    if (!uploadedFilename) {
      return
    }

    window.location.assign(getOriginalDownloadUrl(uploadedFilename))
  }

  const handleDownloadClean = () => {
    window.location.assign(getCleanDownloadUrl())
  }

  const handleDownloadBatchClean = () => {
    if (!batchResult?.download_url) {
      return
    }

    window.location.assign(getBatchDownloadUrl(batchResult.download_url))
  }

  return (
    <div className="tech-grid relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none fixed left-[8%] top-12 h-72 w-72 rounded-full bg-neon-green/10 blur-3xl" />
      <div className="pointer-events-none fixed right-[6%] top-24 h-80 w-80 rounded-full bg-neon-blue/10 blur-3xl" />
      <div className="pointer-events-none fixed bottom-[-5%] left-1/3 h-64 w-64 rounded-full bg-neon-red/6 blur-3xl" />
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="animate-scan-line absolute h-px w-full bg-gradient-to-r from-transparent via-neon-green/30 to-transparent" />
      </div>

      <main className="relative z-10 mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        <Header stage={stage} />

        {stage === "upload" ? (
          <div className="fade-in-up">
            <UploadBox onFilesSelected={handleFilesSelected} error={scanError ?? actionError} />
          </div>
        ) : null}

        {stage === "scanning" ? (
          <div className="fade-in-up">
            <ScanLogs
              fileName={sourceFileName}
              logs={scanLogs}
              progress={scanProgress}
              error={scanError}
              onReset={resetWorkflow}
            />
          </div>
        ) : null}

        {stage === "results" && scanReport ? (
          <div className="space-y-6 fade-in-up">
            <ResultsPanel
              sourceFileName={sourceFileName}
              uploadedFilename={uploadedFilename}
              report={scanReport}
              stripResult={stripResult}
            />
            <ActionPanel
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

        {stage === "batch" ? (
          <div className="fade-in-up">
            <BatchPanel
              files={selectedBatchFiles}
              emailForm={emailForm}
              zipOutput={batchZipOutput}
              isPreparing={isPreparingBatch}
              isSending={isSendingEmail}
              error={batchError}
              result={batchResult}
              onEmailFieldChange={handleEmailFieldChange}
              onZipOutputChange={setBatchZipOutput}
              onPrepare={handleBatchPrepare}
              onSend={handleBatchSend}
              onDownloadPrepared={handleDownloadBatchClean}
              onReset={resetWorkflow}
            />
          </div>
        ) : null}

        <footer className="rounded-[1.5rem] border border-border/70 bg-background/35 px-4 py-4 text-center text-xs uppercase tracking-[0.24em] text-muted-foreground">
          Opaque Zero-Trust Scanner • Powered by the Meta-Shield Flask backend
        </footer>
      </main>
    </div>
  )
}
