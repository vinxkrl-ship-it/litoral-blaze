export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET')

  try {
    const response = await fetch(
      'https://blaze.bet.br/api/singleplayer-originals/originals/roulette_games/recent/100',
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'pt-BR,pt;q=0.9',
          'Origin': 'https://blaze.bet.br',
          'Referer': 'https://blaze.bet.br/pt/games/double',
        },
      }
    )

    const text = await response.text()

    if (!response.ok) {
      return res.status(502).json({ ok: false, error: `Blaze HTTP ${response.status}`, rounds: [] })
    }

    const data = JSON.parse(text)
    const records = Array.isArray(data) ? data : (data.records || data.data || [])

    if (!records.length) {
      return res.status(500).json({ ok: false, error: 'Sem rodadas', rounds: [] })
    }

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

    return res.status(200).json({ ok: true, rounds, count: rounds.length })

  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message, rounds: [] })
  }
}

function getColor(num) {
  if (num === 0) return 'white'
  if (num >= 1 && num <= 7) return 'red'
  return 'black'
}