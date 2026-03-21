"use client"

import { AlertTriangle, MapPin, Smartphone, Clock, Eye, Shield, AlertCircle } from "lucide-react"

const SENSITIVE_DATA = [
  {
    id: 1,
    icon: MapPin,
    title: "GPS Location",
    value: "40.7128° N, 74.0060° W",
    risk: "high",
    explanation: "Reveals exact location where the photo was taken",
  },
  {
    id: 2,
    icon: Smartphone,
    title: "Device Info",
    value: "iPhone 15 Pro Max",
    risk: "medium",
    explanation: "Identifies your device model and operating system",
  },
  {
    id: 3,
    icon: Clock,
    title: "Timestamp",
    value: "2025-03-18 14:32:45 EST",
    risk: "medium",
    explanation: "Shows exactly when the image was created",
  },
  {
    id: 4,
    icon: Eye,
    title: "Camera Settings",
    value: "f/1.8, 1/120s, ISO 100",
    risk: "low",
    explanation: "Reveals technical details about your camera",
  },
]

const EXPLOITATION_INSIGHTS = [
  {
    icon: MapPin,
    threat: "Location Tracking",
    description: "Attackers can track your home, workplace, or frequent locations using GPS metadata embedded in your photos.",
  },
  {
    icon: Smartphone,
    threat: "Targeted Exploits",
    description: "Device information can be used to craft targeted attacks specific to your phone model and OS version.",
  },
  {
    icon: Clock,
    threat: "Behavioral Analysis",
    description: "Timestamps reveal your daily patterns, routines, and can be used for social engineering attacks.",
  },
]

export function ResultsPanel() {
  const riskLevel = "high"

  return (
    <div className="space-y-6">
      {/* Risk Summary Card */}
      <div className={`
        glass-panel rounded-xl p-6 
        ${riskLevel === "high" ? "neon-glow-red border-neon-red/30" : ""}
      `}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`
              p-3 rounded-xl 
              ${riskLevel === "high" ? "bg-neon-red/20" : "bg-neon-green/20"}
            `}>
              {riskLevel === "high" ? (
                <AlertTriangle className="w-8 h-8 text-neon-red" />
              ) : (
                <Shield className="w-8 h-8 text-neon-green" />
              )}
            </div>
            <div>
              <p className="text-sm text-muted-foreground uppercase tracking-wider">Threat Level</p>
              <h3 className={`
                text-2xl font-bold uppercase tracking-wide
                ${riskLevel === "high" ? "text-neon-red" : "text-neon-green"}
              `}>
                {riskLevel === "high" ? "High Risk" : riskLevel === "medium" ? "Medium Risk" : "Safe"}
              </h3>
            </div>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-neon-red">4</p>
            <p className="text-xs text-muted-foreground">Issues Found</p>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Sensitive Data List */}
        <div className="glass-panel rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-neon-blue" />
            <h3 className="text-lg font-semibold text-foreground">Detected Metadata</h3>
          </div>
          
          <div className="space-y-3">
            {SENSITIVE_DATA.map((item) => (
              <div 
                key={item.id}
                className={`
                  p-4 rounded-lg bg-background/50 border transition-all duration-300
                  hover:bg-background/80
                  ${item.risk === "high" ? "border-neon-red/30 hover:border-neon-red/50" : ""}
                  ${item.risk === "medium" ? "border-neon-yellow/30 hover:border-neon-yellow/50" : ""}
                  ${item.risk === "low" ? "border-border hover:border-neon-blue/30" : ""}
                `}
              >
                <div className="flex items-start gap-3">
                  <div className={`
                    p-2 rounded-lg shrink-0
                    ${item.risk === "high" ? "bg-neon-red/20" : ""}
                    ${item.risk === "medium" ? "bg-neon-yellow/20" : ""}
                    ${item.risk === "low" ? "bg-secondary" : ""}
                  `}>
                    <item.icon className={`
                      w-4 h-4
                      ${item.risk === "high" ? "text-neon-red" : ""}
                      ${item.risk === "medium" ? "text-neon-yellow" : ""}
                      ${item.risk === "low" ? "text-muted-foreground" : ""}
                    `} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-foreground">{item.title}</p>
                      <span className={`
                        text-xs px-2 py-0.5 rounded-full uppercase tracking-wider
                        ${item.risk === "high" ? "bg-neon-red/20 text-neon-red" : ""}
                        ${item.risk === "medium" ? "bg-neon-yellow/20 text-neon-yellow" : ""}
                        ${item.risk === "low" ? "bg-secondary text-muted-foreground" : ""}
                      `}>
                        {item.risk}
                      </span>
                    </div>
                    <p className="text-sm text-neon-blue font-mono mt-1">{item.value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{item.explanation}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Exploitation Insight Panel */}
        <div className="glass-panel rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-neon-red" />
            <h3 className="text-lg font-semibold text-foreground">Exploitation Risks</h3>
          </div>
          
          <div className="space-y-4">
            {EXPLOITATION_INSIGHTS.map((insight, index) => (
              <div 
                key={index}
                className="p-4 rounded-lg bg-neon-red/5 border border-neon-red/20"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-neon-red/20 shrink-0">
                    <insight.icon className="w-4 h-4 text-neon-red" />
                  </div>
                  <div>
                    <p className="font-medium text-neon-red">{insight.threat}</p>
                    <p className="text-sm text-muted-foreground mt-1">{insight.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 rounded-lg bg-neon-blue/5 border border-neon-blue/20">
            <p className="text-sm text-neon-blue font-medium">
              Recommendation: Remove all sensitive metadata before sharing this file publicly.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
