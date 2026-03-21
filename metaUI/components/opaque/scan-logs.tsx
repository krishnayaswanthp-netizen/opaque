"use client"

import { useState, useEffect } from "react"
import { Terminal, CheckCircle2, Loader2 } from "lucide-react"

interface ScanLogsProps {
  onScanComplete: () => void
}

const SCAN_STEPS = [
  { message: "Initializing secure scanner...", duration: 600 },
  { message: "Extracting metadata...", duration: 800 },
  { message: "Analyzing EXIF data...", duration: 700 },
  { message: "Detecting GPS coordinates...", duration: 900 },
  { message: "Scanning for device information...", duration: 600 },
  { message: "Checking for sensitive timestamps...", duration: 500 },
  { message: "Analyzing embedded thumbnails...", duration: 700 },
  { message: "Scanning for hidden payloads...", duration: 800 },
  { message: "Generating threat assessment...", duration: 600 },
]

export function ScanLogs({ onScanComplete }: ScanLogsProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [completedSteps, setCompletedSteps] = useState<number[]>([])
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (currentStep >= SCAN_STEPS.length) {
      setTimeout(onScanComplete, 500)
      return
    }

    const step = SCAN_STEPS[currentStep]
    const timer = setTimeout(() => {
      setCompletedSteps(prev => [...prev, currentStep])
      setCurrentStep(prev => prev + 1)
    }, step.duration)

    return () => clearTimeout(timer)
  }, [currentStep, onScanComplete])

  useEffect(() => {
    const targetProgress = ((currentStep) / SCAN_STEPS.length) * 100
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= targetProgress) {
          clearInterval(interval)
          return targetProgress
        }
        return prev + 1
      })
    }, 20)

    return () => clearInterval(interval)
  }, [currentStep])

  return (
    <div className="glass-panel rounded-xl p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <Terminal className="w-5 h-5 text-neon-blue" />
          <div className="absolute inset-0 blur-sm bg-neon-blue/50" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">Scan Progress</h2>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Analyzing file...</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="h-2 bg-secondary rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-neon-blue to-neon-green rounded-full transition-all duration-300 relative"
            style={{ width: `${progress}%` }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse" />
          </div>
        </div>
      </div>

      {/* Terminal Logs */}
      <div className="bg-background/50 rounded-lg p-4 font-mono text-sm space-y-2 max-h-64 overflow-y-auto">
        {SCAN_STEPS.map((step, index) => {
          const isCompleted = completedSteps.includes(index)
          const isCurrent = currentStep === index && !isCompleted
          const isPending = index > currentStep

          return (
            <div 
              key={index}
              className={`
                flex items-center gap-3 transition-all duration-300
                ${isPending ? "opacity-30" : "opacity-100"}
              `}
            >
              {isCompleted ? (
                <CheckCircle2 className="w-4 h-4 text-neon-green shrink-0" />
              ) : isCurrent ? (
                <Loader2 className="w-4 h-4 text-neon-blue animate-spin shrink-0" />
              ) : (
                <div className="w-4 h-4 rounded-full border border-muted-foreground/30 shrink-0" />
              )}
              <span className={`
                ${isCompleted ? "text-neon-green" : ""}
                ${isCurrent ? "text-neon-blue" : ""}
                ${isPending ? "text-muted-foreground" : ""}
              `}>
                <span className="text-muted-foreground mr-2">{">"}</span>
                {step.message}
              </span>
            </div>
          )
        })}
      </div>

      {/* Scanning Animation */}
      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <div 
              key={i}
              className="w-2 h-2 rounded-full bg-neon-blue animate-pulse"
              style={{ animationDelay: `${i * 200}ms` }}
            />
          ))}
        </div>
        <span>Deep scan in progress</span>
      </div>
    </div>
  )
}
