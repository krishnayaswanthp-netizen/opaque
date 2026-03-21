"use client"

import { useState, useCallback } from "react"
import { Upload, FileImage } from "lucide-react"

interface UploadBoxProps {
  onFileUpload: () => void
}

export function UploadBox({ onFileUpload }: UploadBoxProps) {
  const [isDragOver, setIsDragOver] = useState(false)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    onFileUpload()
  }, [onFileUpload])

  const handleClick = useCallback(() => {
    onFileUpload()
  }, [onFileUpload])

  return (
    <div
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        relative cursor-pointer rounded-xl p-12 
        border-2 border-dashed transition-all duration-300
        ${isDragOver 
          ? "border-neon-green bg-neon-green/5 neon-glow-green" 
          : "border-border hover:border-neon-blue hover:bg-neon-blue/5"
        }
        group
      `}
    >
      {/* Animated corner accents */}
      <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-neon-green rounded-tl-lg" />
      <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-neon-green rounded-tr-lg" />
      <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-neon-green rounded-bl-lg" />
      <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-neon-green rounded-br-lg" />

      <div className="flex flex-col items-center gap-6">
        <div className={`
          relative p-6 rounded-full glass-panel
          transition-all duration-300
          ${isDragOver ? "neon-glow-green" : "group-hover:neon-glow-blue"}
        `}>
          <Upload className={`
            w-12 h-12 transition-colors duration-300
            ${isDragOver ? "text-neon-green" : "text-muted-foreground group-hover:text-neon-blue"}
          `} />
          <div className={`
            absolute inset-0 rounded-full blur-xl transition-opacity duration-300
            ${isDragOver ? "bg-neon-green/20 opacity-100" : "bg-neon-blue/20 opacity-0 group-hover:opacity-100"}
          `} />
        </div>

        <div className="text-center space-y-2">
          <p className={`
            text-lg font-medium transition-colors duration-300
            ${isDragOver ? "text-neon-green neon-text-green" : "text-foreground"}
          `}>
            Drop file to scan for hidden threats
          </p>
          <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
            <FileImage className="w-4 h-4" />
            Supports PNG, JPG, JPEG, WEBP, TIFF
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="h-px w-12 bg-gradient-to-r from-transparent to-border" />
          <span className="text-xs text-muted-foreground uppercase tracking-wider">or click to browse</span>
          <div className="h-px w-12 bg-gradient-to-l from-transparent to-border" />
        </div>
      </div>
    </div>
  )
}
