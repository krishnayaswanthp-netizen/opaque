"use client"

import { useDeferredValue, useEffect, useRef } from "react"
import { AlertTriangle, CheckCircle2, Loader2, RotateCcw, Terminal } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Callout, DashboardPanel, MetricCard, SectionHeading } from "@/components/opaque/dashboard-primitives"
import type { ScanLogEntry } from "@/lib/metashield-types"

export function ScanLogs({
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
  const deferredLogs = useDeferredValue(logs)
  const logContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = logContainerRef.current
    if (!container) {
      return
    }

    container.scrollTop = container.scrollHeight
  }, [deferredLogs])

  const latestMessage =
    deferredLogs.at(-1)?.message ||
    (fileName ? `Preparing the secure scan pipeline for ${fileName}` : "Initializing secure scan")

  return (
    <DashboardPanel accent={error ? "CRITICAL" : "MEDIUM"} className="space-y-6">
      <SectionHeading
        eyebrow="Live Analysis"
        title={fileName ? `Inspecting ${fileName}` : "Inspecting uploaded file"}
        description="Meta-Shield is streaming its scan state, threat scoring, and verification pipeline as the backend processes the file."
        icon={Terminal}
        action={
          <MetricCard
            label="Progress"
            value={`${Math.round(progress)}%`}
            tone={error ? "danger" : "info"}
            className="min-w-[150px] bg-background/55"
          />
        }
      />

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.24em] text-muted-foreground">
          <span>Current phase</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-background/60">
          <div
            className="relative h-full rounded-full bg-gradient-to-r from-neon-blue via-sky-300 to-neon-green transition-[width] duration-500"
            style={{ width: `${progress}%` }}
          >
            <div className="absolute inset-0 shimmer-strip" />
          </div>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">{latestMessage}</p>
      </div>

      <div
        ref={logContainerRef}
        className="terminal-scroll max-h-[22rem] space-y-2 overflow-y-auto rounded-[1.5rem] border border-border/70 bg-background/55 p-4 font-mono text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
      >
        {deferredLogs.length ? (
          deferredLogs.map((log, index) => {
            const toneClass =
              log.status === "success"
                ? "text-neon-green"
                : log.status === "error"
                  ? "text-neon-red"
                  : "text-neon-blue"

            return (
              <div
                key={log.id}
                className={`fade-in-up flex items-start gap-3 leading-6 ${toneClass}`}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                {log.status === "success" ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                ) : log.status === "error" ? (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
                )}
                <p className="min-w-0">
                  <span className="mr-2 text-muted-foreground">{">"}</span>
                  {log.message}
                </p>
              </div>
            )
          })
        ) : (
          <div className="flex items-center gap-3 text-neon-blue">
            <Loader2 className="h-4 w-4 animate-spin" />
            <p>
              <span className="mr-2 text-muted-foreground">{">"}</span>
              Initializing secure scanner...
            </p>
          </div>
        )}
      </div>

      {error ? (
        <div className="space-y-4">
          <Callout title="Scan interrupted" tone="danger" icon={AlertTriangle}>
            {error}
          </Callout>
          <Button
            onClick={onReset}
            variant="outline"
            className="rounded-2xl border-neon-red/30 bg-transparent text-neon-red hover:bg-neon-red/10 hover:text-neon-red"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset and try another file
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-border/70 bg-background/40 px-4 py-3 text-sm text-muted-foreground">
          <div className="flex gap-1.5">
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className="h-2 w-2 rounded-full bg-neon-blue"
                style={{ animation: `neon-pulse 1.4s ease-in-out ${index * 0.15}s infinite` }}
              />
            ))}
          </div>
          <span>Streaming scan telemetry from the Meta-Shield backend</span>
        </div>
      )}
    </DashboardPanel>
  )
}
