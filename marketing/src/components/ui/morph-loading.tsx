"use client"

import { cn } from "@/lib/utils"

interface UniqueLoadingProps {
  variant?: "morph"
  size?: "sm" | "md" | "lg" | "xl" | "2xl"
  scale?: number
  className?: string
}

export default function UniqueLoading({
  variant = "morph",
  size = "md",
  scale,
  className,
}: UniqueLoadingProps) {
  const containerSizes: Record<string, string> = {
    sm: "w-16 h-16",
    md: "w-24 h-24",
    lg: "w-32 h-32",
    xl: "w-40 h-40",
    "2xl": "w-48 h-48",
  }

  const defaultScales: Record<string, number> = {
    sm: 0.85,
    md: 1.15,
    lg: 1.35,
    xl: 1.55,
    "2xl": 1.75,
  }

  const activeScale = scale ?? defaultScales[size] ?? 1.15

  if (variant === "morph") {
    return (
      <div className={cn("relative flex items-center justify-center", containerSizes[size], className)}>
        <div
          className="relative flex items-center justify-center"
          style={{ transform: `scale(${activeScale})`, transformOrigin: "center center" }}
        >
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="absolute w-4 h-4 rounded-sm bg-white"
              style={{
                animation: `morph-${i} 2.2s infinite ease-in-out`,
                animationDelay: `${i * 0.22}s`,
              }}
            />
          ))}
        </div>
      </div>
    )
  }

  return null
}
