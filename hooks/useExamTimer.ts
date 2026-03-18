'use client'

import { useEffect, useRef, useState } from 'react'

interface ExamTimerOptions {
  durationSeconds: number
  onExpire?: () => void
}

export function useExamTimer({ durationSeconds, onExpire }: ExamTimerOptions) {
  const [secondsLeft, setSecondsLeft] = useState(durationSeconds)
  const onExpireRef = useRef(onExpire)
  onExpireRef.current = onExpire

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          onExpireRef.current?.()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  const minutes = Math.floor(secondsLeft / 60)
  const seconds = secondsLeft % 60
  const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  const isUrgent = secondsLeft <= 120 // last 2 minutes
  const isExpired = secondsLeft === 0

  return { secondsLeft, formatted, isUrgent, isExpired }
}
