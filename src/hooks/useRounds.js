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

  // Busca histórico completo do Supabase
  const loadHistory = useCallback(async () => {
    try {
      const { data, error: dbErr } = await supabase
        .from('rounds')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(5000)

      if (dbErr) throw new Error(dbErr.message)
      if (!data?.length) return

      const formatted = data.map(r => {
        const date = new Date(r.created_at)
        const brt = new Date(date.getTime() - 3 * 60 * 60 * 1000)
        const h = String(brt.getUTCHours()).padStart(2, '0')
        const m = String(brt.getUTCMinutes()).padStart(2, '0')
        const s = String(brt.getUTCSeconds()).padStart(2, '0')
        return {
          id: r.blaze_id || String(r.id),
          num: r.roll,
          color: r.color,
          time: r.created_at,
          display: `${h}:${m}`,
          displayFull: `${h}:${m}:${s}`,
        }
      })

      setRounds(formatted)
      setOnline(true)
      setError(null)
      failCountRef.current = 0
      lastIdRef.current = formatted[formatted.length - 1]?.id
    } catch (err) {
      failCountRef.current++
      if (failCountRef.current >= 3) {
        setOnline(false)
        setError(err.message)
      }
    }
  }, [])

  // Busca novas rodadas do KitBlaze e salva no Supabase
  const fetchNew = useCallback(async () => {
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('get-rounds')
      if (fnErr || !data?.ok) return
      // Após salvar novas rodadas, recarrega o histórico completo
      await loadHistory()
    } catch (err) {
      console.error('Erro ao buscar novas rodadas:', err)
    }
  }, [loadHistory])

  useEffect(() => {
    // Carrega histórico completo primeiro
    loadHistory()
    // Depois busca novas rodadas a cada 30s
    fetchNew()
    timerRef.current = setInterval(fetchNew, 30000)
    return () => clearInterval(timerRef.current)
  }, [loadHistory, fetchNew])

  return { rounds, online, error, refetch: fetchNew }
}