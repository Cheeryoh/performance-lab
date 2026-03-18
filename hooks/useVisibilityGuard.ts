'use client'

import { useEffect, useRef, useState } from 'react'

interface VisibilityGuardOptions {
  attemptId: string
  onViolation?: (count: number) => void
}

export function useVisibilityGuard({ attemptId, onViolation }: VisibilityGuardOptions) {
  const [violations, setViolations] = useState(0)
  const [showWarning, setShowWarning] = useState(false)
  const violationRef = useRef(0)

  useEffect(() => {
    async function recordViolation() {
      violationRef.current += 1
      setViolations(violationRef.current)
      setShowWarning(true)
      onViolation?.(violationRef.current)

      // Write violation to server
      try {
        await fetch('/api/exam/violation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ attemptId, violations: violationRef.current }),
        })
      } catch {
        // Non-critical — continue
      }
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        recordViolation()
      }
    }

    function handleBlur() {
      // Only count window blur if tab is also hidden
      if (document.hidden) return
      recordViolation()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('blur', handleBlur)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('blur', handleBlur)
    }
  }, [attemptId, onViolation])

  function dismissWarning() {
    setShowWarning(false)
  }

  return { violations, showWarning, dismissWarning }
}
