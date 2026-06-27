import { useState, useEffect, useRef, useCallback } from 'react'

export function getColor(num) {
  if (num === 0) return 'white'
  if (num >= 1 && num <= 7) return 'red'
  return 'black'
}

export default function useRounds() {
  const [rounds,    setRounds]  = useState([])
  const [online,    setOnline]  = useState(false)
  const [error,     setError]   = useState(null)
  const lastIdRef               = useRef(null)
  const timerRef                = useRef(null)
  const failCountRef            = useRef(0)

  const fetchRounds = useCallback(async () => {
    try {
      const res = await fetch('/api/rounds')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (!data.ok || !data.rounds?.length) throw new Error(data.error || 'Sem rodadas')

      const newLastId = data.rounds[data.rounds.length - 1]?.id
      if (newLastId !== lastIdRef.current) {
        lastIdRef.current = newLastId
        setRounds(data.rounds)
      }

      failCountRef.current = 0
      setOnline(true)
      setError(null)

    } catch (err) {
      failCountRef.current++
      if (failCountRef.current >= 3) {
        setOnline(false)
        setError(err?.message || 'Erro')
      }
    }
  }, [])

  useEffect(() => {
    fetchRounds()
    timerRef.current = setInterval(fetchRounds, 15000)
    return () => clearInterval(timerRef.current)
  }, [fetchRounds])

  return { rounds, online, error, refetch: fetchRounds }
}