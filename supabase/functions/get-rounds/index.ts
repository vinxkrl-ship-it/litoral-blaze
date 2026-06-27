import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function getColor(num: number): string {
  if (num === 0) return 'white'
  if (num >= 1 && num <= 7) return 'red'
  return 'black'
}

function parseRounds(html: string) {
  const rounds: Array<{id:string, num:number, color:string, time:string, display:string}> = []
  const seen = new Set<string>()
  const today = new Date().toISOString().slice(0, 10)
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
  const regex = /\b([0-9]|1[0-4])\s+(\d{2}:\d{2}:\d{2})\b/g
  let match
  while ((match = regex.exec(text)) !== null) {
    const num = parseInt(match[1])
    const timeStr = match[2]
    if (isNaN(num) || num < 0 || num > 14) continue
    const [h, m, s] = timeStr.split(':').map(Number)
    if (h > 23 || m > 59 || s > 59) continue
    const id = `${today}_${timeStr.replace(/:/g,'')}_${num}`
    if (!seen.has(id)) {
      seen.add(id)
      rounds.push({
        id,
        num,
        color: getColor(num),
        time: `${today}T${timeStr}`,
        display: `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
      })
    }
  }
  return rounds.sort((a, b) => a.time.localeCompare(b.time))
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const res = await fetch('https://www.bestblaze.com.br/doubleRodadasDia', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        'Referer': 'https://www.bestblaze.com.br/',
        'Cache-Control': 'no-cache',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    })
    const html = await res.text()
    if (!res.ok) return new Response(JSON.stringify({ ok: false, error: `HTTP ${res.status}`, rounds: [] }), { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } })
    const rounds = parseRounds(html)
    if (rounds.length === 0) return new Response(JSON.stringify({ ok: false, error: 'Nenhuma rodada encontrada.', rounds: [] }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
    return new Response(JSON.stringify({ ok: true, rounds, count: rounds.length, ts: Date.now() }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ ok: false, error: msg, rounds: [] }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
})
