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
      const res = await fetch(
        'https://blaze.bet.br/api/singleplayer-originals/originals/roulette_games/recent/100',
        {
          headers: {
            'Accept': 'application/json',
            'Accept-Language': 'pt-BR,pt;q=0.9',
          },
          credentials: 'include',
        }
      )

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const data = await res.json()
      const records = Array.isArray(data) ? data : (data.records || data.data || [])

      if (!records.length) throw new Error('Sem rodadas')

      const rounds = records.map((r) => {
        const date = new Date(r.created_at)
        const brt = new Date(date.getTime() - 3 * 60 * 60 * 1000)
        const h = String(brt.getUTCHours()).padStart(2, '0')
        const m = String(brt.getUTCMinutes()).padStart(2, '0')
        const s = String(brt.getUTCSeconds()).padStart(2, '0')
        return {
          id: String(r.id),
          num: r.roll,
          color: r.color || getColor(r.roll),
          time: r.created_at,
          display: `${h}:${m}`,
          displayFull: `${h}:${m}:${s}`,
        }
      }).reverse()

      const newLastId = rounds[rounds.length - 1]?.id
      if (newLastId !== lastIdRef.current) {
        lastIdRef.current = newLastId
        setRounds(rounds)
      }

      failCountRef.current = 0
      setOnline(true)
      setError(null)

    } catch (err) {
      failCountRef.current++
      if (failCountRef.current >= 3) {
        setOnline(false)
        setError(err?.message || 'Erro ao buscar rodadas')
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