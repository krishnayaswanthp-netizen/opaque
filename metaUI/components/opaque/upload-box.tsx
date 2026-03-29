"use client"

import { useRef, useState } from "react"
import { Files, FileText, Mail, ShieldCheck, Upload } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Callout, DashboardPanel, SectionHeading } from "@/components/opaque/dashboard-primitives"
import { ACCEPTED_EXTENSIONS } from "@/lib/metashield-types"

const capabilityCards = [
  {
    icon: ShieldCheck,
    title: "Deep single-file review",
    description: "Inspect one upload in detail, review the threat model, and generate a verified clean copy.",
  },
  {
    icon: Mail,
    title: "One-step clean delivery",
    description: "Sanitize the file first, then hand off the cleaned artifact through the same dashboard.",
  },
  {
    icon: Files,
    title: "Batch-ready uploads",
    description: "Drop multiple files together when you want one ZIP or one sanitized outbound email.",
  },
]

export function UploadBox({
  onFilesSelected,
  error,
}: {
  onFilesSelected: (files: File[]) => void | Promise<void>
  error?: string | null
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [localMessage, setLocalMessage] = useState<string | null>(null)

  const submitFiles = (incoming: FileList | File[] | null) => {
    const files = Array.from(incoming ?? [])
    if (!files.length) {
      return
    }

    const supportedFiles = files.filter((file) => {
      const extension = file.name.includes(".")
        ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase()
        : ""
      return ACCEPTED_EXTENSIONS.includes(extension as (typeof ACCEPTED_EXTENSIONS)[number])
    })

    if (!supportedFiles.length) {
      setLocalMessage(`Unsupported file type. Upload one of: ${ACCEPTED_EXTENSIONS.join(", ")}`)
      return
    }

    if (supportedFiles.length !== files.length) {
      setLocalMessage(
        `${files.length - supportedFiles.length} file(s) were skipped because they are not supported.`,
      )
    } else {
      setLocalMessage(null)
    }

    void onFilesSelected(supportedFiles)
  }

  const activeMessage = error || localMessage

  return (
    <div className="space-y-6">
      <DashboardPanel className="space-y-6 overflow-hidden">
        <SectionHeading
          eyebrow="Intake"
          title="Bring the file into the secure workflow"
          description="The dashboard accepts user-supplied images, documents, audio, and video. One file opens a deep review; multiple files open the batch delivery flow."
          icon={Upload}
        />

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                fileInputRef.current?.click()
              }
            }}
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
              submitFiles(event.dataTransfer.files)
            }}
            className={`group relative rounded-[1.75rem] border-2 border-dashed px-6 py-10 text-left transition-all duration-300 sm:px-8 sm:py-12 ${
              isDragOver
                ? "border-neon-green bg-neon-green/8 shadow-[0_0_0_1px_rgba(43,255,159,0.12),0_24px_80px_rgba(43,255,159,0.12)]"
                : "border-border/80 bg-background/35 hover:-translate-y-0.5 hover:border-neon-blue/50 hover:bg-background/50"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPTED_EXTENSIONS.join(",")}
              onChange={(event) => {
                submitFiles(event.target.files)
                event.target.value = ""
              }}
              className="hidden"
            />

            <div className="pointer-events-none absolute inset-0 rounded-[1.75rem] border border-white/6" />
            <div className="pointer-events-none absolute left-6 top-6 h-16 w-16 rounded-full bg-neon-blue/10 blur-2xl transition-opacity duration-300 group-hover:opacity-100" />

            <div className="space-y-8">
              <div className="flex items-center gap-4">
                <div
                  className={`relative rounded-[1.25rem] border border-white/10 bg-background/70 p-4 transition-all duration-300 ${
                    isDragOver ? "scale-105 text-neon-green" : "text-neon-blue"
                  }`}
                >
                  <Upload className="h-8 w-8" />
                  <div className="pointer-events-none absolute inset-0 rounded-[1.25rem] bg-white/5 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.32em] text-muted-foreground">
                    Secure Ingestion
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                    Drop files here or browse your device
                  </h3>
                </div>
              </div>

              <div className="space-y-3">
                <p className="max-w-xl text-sm leading-7 text-muted-foreground sm:text-base">
                  Single uploads open a rich threat review. Multi-select uploads move directly into
                  the batch clean-and-deliver flow.
                </p>
                <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <FileText className="h-4 w-4 text-neon-blue" />
                  Supports PNG, JPG, JPEG, TIF, TIFF, PDF, DOCX, MP4, MOV, MKV, MP3, WAV, and AAC
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  className="rounded-2xl bg-gradient-to-r from-neon-green via-neon-blue to-neon-blue px-5 py-6 text-background hover:scale-[1.01] hover:opacity-95"
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Browse Files
                </Button>
                <span className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
                  Ctrl / Shift works for batch selection
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-4">
            {capabilityCards.map((card, index) => (
              <div
                key={card.title}
                className="fade-in-up rounded-[1.5rem] border border-border/70 bg-background/40 p-4"
                style={{ animationDelay: `${index * 90}ms` }}
              >
                <div className="flex items-start gap-3">
                  <span className="rounded-2xl border border-white/10 bg-background/65 p-2.5 text-neon-blue">
                    <card.icon className="h-4 w-4" />
                  </span>
                  <div className="space-y-2">
                    <p className="font-medium text-foreground">{card.title}</p>
                    <p className="text-sm leading-6 text-muted-foreground">{card.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </DashboardPanel>

      {activeMessage ? (
        <Callout title="Upload guidance" tone={error ? "danger" : "warning"}>
          {activeMessage}
        </Callout>
      ) : null}
    </div>
  )
}
