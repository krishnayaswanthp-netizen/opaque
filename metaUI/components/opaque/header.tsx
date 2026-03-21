"use client"

import { Shield } from "lucide-react"

export function Header() {
  return (
    <header className="glass-panel rounded-xl p-6 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="relative">
          <Shield className="w-10 h-10 text-neon-green animate-neon-pulse" />
          <div className="absolute inset-0 blur-md bg-neon-green/30 rounded-full" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground neon-text-green">
            Opaque
          </h1>
          <p className="text-sm text-muted-foreground">
            Zero Trust File Scanner
          </p>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <div className="relative flex items-center gap-2 px-3 py-1.5 rounded-full glass-panel">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neon-green opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-neon-green" />
          </span>
          <span className="text-xs font-medium text-neon-green uppercase tracking-wider">
            Online
          </span>
        </div>
      </div>
    </header>
  )
}
