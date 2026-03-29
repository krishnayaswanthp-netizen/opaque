"use client"

import { Activity, Shield, Workflow } from "lucide-react"

import { DashboardPanel, MetricCard } from "@/components/opaque/dashboard-primitives"
import type { Stage } from "@/lib/metashield-types"

const stageCopy: Record<Stage, { label: string; hint: string }> = {
  upload: {
    label: "Intake Ready",
    hint: "Select a single file for deep review or queue a full batch.",
  },
  scanning: {
    label: "Inspecting",
    hint: "Live metadata analysis and threat scoring are in progress.",
  },
  results: {
    label: "Threat Review",
    hint: "Review exposures, sanitize the artifact, and verify the clean copy.",
  },
  batch: {
    label: "Batch Delivery",
    hint: "Prepare one clean ZIP or send one sanitized email for the whole queue.",
  },
}

export function Header({ stage }: { stage: Stage }) {
  const currentStage = stageCopy[stage]

  return (
    <DashboardPanel className="overflow-hidden px-6 py-6 sm:px-8 sm:py-8">
      <div className="pointer-events-none absolute -left-16 top-0 h-48 w-48 rounded-full bg-neon-green/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-10 bottom-0 h-44 w-44 rounded-full bg-neon-blue/10 blur-3xl" />

      <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4 sm:gap-5">
          <div className="float-slow relative rounded-[1.75rem] border border-neon-green/30 bg-background/60 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_18px_60px_rgba(43,255,159,0.12)]">
            <Shield className="h-8 w-8 text-neon-green sm:h-9 sm:w-9" />
            <div className="pointer-events-none absolute inset-0 rounded-[1.75rem] border border-white/10" />
          </div>

          <div className="max-w-2xl space-y-3">
            <p className="text-[11px] uppercase tracking-[0.38em] text-muted-foreground">
              Meta-Shield Dashboard
            </p>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Opaque Zero-Trust Sanitizer
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
                Scan uploaded files for metadata exposure, generate verified clean copies, and
                deliver sanitized outputs without leaving the same workflow.
              </p>
            </div>

            <div className="flex flex-wrap gap-3 pt-1 text-xs uppercase tracking-[0.24em] text-muted-foreground">
              <span className="rounded-full border border-white/10 bg-background/40 px-3 py-1.5">
                Images
              </span>
              <span className="rounded-full border border-white/10 bg-background/40 px-3 py-1.5">
                Documents
              </span>
              <span className="rounded-full border border-white/10 bg-background/40 px-3 py-1.5">
                Audio & Video
              </span>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:min-w-[360px]">
          <MetricCard
            label="Workflow Stage"
            value={currentStage.label}
            hint={currentStage.hint}
            tone="info"
            icon={Workflow}
          />
          <MetricCard
            label="Pipeline State"
            value={
              <span className="inline-flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="signal-dot absolute inline-flex h-full w-full rounded-full bg-neon-green opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-neon-green" />
                </span>
                Backend Online
              </span>
            }
            hint="Flask scan, clean, audit, and delivery routes are wired into the dashboard."
            tone="success"
            icon={Activity}
          />
        </div>
      </div>
    </DashboardPanel>
  )
}
