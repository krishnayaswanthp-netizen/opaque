"use client"

import { useState } from "react"
import { ShieldCheck, Download, Loader2, CheckCircle2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"

export function ActionPanel() {
  const [cleaningState, setCleaningState] = useState<"idle" | "cleaning" | "success">("idle")

  const handleClean = () => {
    setCleaningState("cleaning")
    setTimeout(() => {
      setCleaningState("success")
    }, 2000)
  }

  const handleDownload = () => {
    // Simulated download
  }

  const handleReset = () => {
    setCleaningState("idle")
  }

  if (cleaningState === "success") {
    return (
      <div className="glass-panel rounded-xl p-8 neon-glow-green border-neon-green/30">
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="relative">
            <div className="p-4 rounded-full bg-neon-green/20">
              <CheckCircle2 className="w-12 h-12 text-neon-green" />
            </div>
            <div className="absolute inset-0 blur-xl bg-neon-green/30 rounded-full animate-pulse" />
          </div>
          
          <div>
            <h3 className="text-2xl font-bold text-neon-green neon-text-green">
              File Secured
            </h3>
            <p className="text-muted-foreground mt-2">
              All sensitive metadata has been successfully removed
            </p>
          </div>

          <div className="flex items-center gap-4 pt-4">
            <Button 
              onClick={handleDownload}
              className="bg-neon-green hover:bg-neon-green/90 text-background font-semibold px-6 py-6 rounded-xl transition-all duration-300 hover:scale-105"
            >
              <Download className="w-5 h-5 mr-2" />
              Download Clean File
            </Button>
            <Button 
              onClick={handleReset}
              variant="outline"
              className="border-border hover:border-neon-blue hover:text-neon-blue px-6 py-6 rounded-xl transition-all duration-300"
            >
              <Sparkles className="w-5 h-5 mr-2" />
              Scan Another
            </Button>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="w-4 h-4 text-neon-green" />
            <span>Protected by Opaque Zero Trust Scanner</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="glass-panel rounded-xl p-6">
      <div className="flex flex-col sm:flex-row items-center gap-4">
        <Button 
          onClick={handleClean}
          disabled={cleaningState === "cleaning"}
          className={`
            flex-1 w-full sm:w-auto py-6 px-8 rounded-xl font-semibold text-base
            transition-all duration-300
            ${cleaningState === "cleaning" 
              ? "bg-neon-blue/80" 
              : "bg-gradient-to-r from-neon-green to-neon-blue hover:from-neon-green/90 hover:to-neon-blue/90 hover:scale-[1.02]"
            }
            text-background
          `}
        >
          {cleaningState === "cleaning" ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Removing Metadata...
            </>
          ) : (
            <>
              <ShieldCheck className="w-5 h-5 mr-2" />
              Remove Sensitive Metadata & Secure File
            </>
          )}
        </Button>
        
        <Button 
          variant="outline"
          disabled={cleaningState === "cleaning"}
          className="flex-1 w-full sm:w-auto py-6 px-8 rounded-xl font-semibold text-base border-border hover:border-neon-blue hover:text-neon-blue transition-all duration-300"
        >
          <Download className="w-5 h-5 mr-2" />
          Download Original
        </Button>
      </div>

      {cleaningState === "cleaning" && (
        <div className="mt-4 flex items-center justify-center gap-2 text-sm text-neon-blue">
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <div 
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-neon-blue animate-pulse"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </div>
          <span>Securely stripping metadata from file</span>
        </div>
      )}
    </div>
  )
}
