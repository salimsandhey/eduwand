import { useCallback, useEffect, useState } from 'react'
import { getContentPage } from './api'
import type { ContentPage } from './api'

export function useContentPage(key: string) {
  const [page, setPage] = useState<ContentPage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    getContentPage(key)
      .then((result) => {
        if (!cancelled) {
          setPage(result)
          setError(null)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load this page')
      })
    return () => {
      cancelled = true
    }
  }, [key, attempt])

  const retry = useCallback(() => {
    setError(null)
    setAttempt((n) => n + 1)
  }, [])

  return { page, error, loading: !page && !error, retry }
}
