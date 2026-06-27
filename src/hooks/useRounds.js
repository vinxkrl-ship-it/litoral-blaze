import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function getColor(num) {
  if (num === 0) return 'white'
  if (num >= 1 && num <= 7) return 'red'
  return 'black'
}

export default function useRounds() {
  const [rounds,     setRounds]  = useState([])
  const [online,     setOnline]  = useState(false)
  const [error,      setError]   = useState(null)
  const lastIdRef                = useRef(null)
  const timerRef                 = useRef(null)
  const failCountRef             = useRef(0)

  const fetchRounds = useCallback(async () => {
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('get-rounds')
      if (fnErr) throw new Error(`Edge Function: ${fnErr.message}`)
      if (!data) throw new Error('Resposta vazia')
      if (!data.ok || !Array.isArray(data.rounds) || data.rounds.length === 0) {
        failCountRef.current++
        if (failCountRef.current >= 3) { setOnline(false); setError(data?.error || 'Sem rodadas') }
        return
      }
      failCountRef.current = 0
      setError(null)
      const newLastId = data.rounds[data.rounds.length - 1]?.id
      if (newLastId !== lastIdRef.current) {
        lastIdRef.current = newLastId
        setRounds(data.rounds)
      }
      setOnline(true)
    } catch (err) {
      failCountRef.current++
      if (failCountRef.current >= 3) { setOnline(false); setError(err?.message || 'Erro') }
    }
  }, [])

  useEffect(() => {
    fetchRounds()
    timerRef.current = setInterval(fetchRounds, 30000)
    return () => clearInterval(timerRef.current)
  }, [fetchRounds])

  return { rounds, online, error, refetch: fetchRounds }
}