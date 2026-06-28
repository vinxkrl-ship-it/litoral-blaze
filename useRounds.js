import { useState, useEffect, useRef } from 'react'
import { analyze, computePillars, getRiskStreak, getStats, getSigWindow } from '../lib/ai'
import { toast } from './Toast'
import { PayBox } from './LoginPage'
import { supabase } from '../lib/supabase'
import usePushNotify from '../hooks/usePushNotify'

export default function UserApp({ profile, rounds, online, signals, onLogout, onUpdateSignal }) {
  const [showPaywall, setShowPaywall] = useState(false)
  const [freeUsed,    setFreeUsed]    = useState(false)
  const [aiEnabled,   setAiEnabled]   = useState(true)
  const [notifyOn,    setNotifyOn]    = useState(false)
  const processingRef = useRef(new Set())
  const isPaid = profile?.status === 'active'
  const { notify, requestPermission } = usePushNotify()

  useEffect(() => {
    supabase.from('settings').select('value').eq('key','ai_enabled').single()
      .then(({data}) => { if (data) setAiEnabled(data.value === 'true') })
  }, [])

  useEffect(() => {
    if (isPaid || freeUsed) return
    const resolved = signals.filter(s => s.status === 'win' || s.status === 'loss')
    if (resolved.length >= 1) { setFreeUsed(true); setTimeout(() => setShowPaywall(true), 3000) }
  }, [signals, isPaid, freeUsed])

  function speakSignal() {
    try {
      const msg = new SpeechSynthesisUtterance('Um branco foi detectado. Atenção ao sinal!')
      msg.lang = 'pt-BR'; msg.rate = 0.95; msg.pitch = 1.05
      window.speechSynthesis.cancel(); window.speechSynthesis.speak(msg)
    } catch (_) {}
  }

  function speakResult(isWin) {
    try {
      const msg = new SpeechSynthesisUtterance(isWin ? 'Sinal encerrado. Win!' : 'Sinal encerrado. Loss!')
      msg.lang = 'pt-BR'; msg.rate = 0.95; msg.pitch = 1.05
      window.speechSynthesis.cancel(); window.speechSynthesis.speak(msg)
    } catch (_) {}
  }

  // Auto win/loss — aguarda 2 rounds após janela
  useEffect(() => {
    if (!rounds.length || !signals.length) return
    const run = async () => {
      for (const sig of signals) {
        if (sig.status !== 'active') continue
        if (processingRef.current.has(sig.id)) continue
        const { startW, endW } = getSigWindow(sig.time_str)
        const white = rounds.find(r => { const t = new Date(r.time); return t >= startW && t <= endW && r.color === 'white' })
        if (white) {
          processingRef.current.add(sig.id)
          await onUpdateSignal(sig.id, { status: 'win', result_time: white.time })
          toast('✅ SINAL ENCERRADO. WIN', 'success'); speakResult(true); continue
        }
        const now = new Date()
        if (now > endW) {
          const after = rounds.filter(r => new Date(r.time) > endW)
          if (after.length >= 2) {
            processingRef.current.add(sig.id)
            await onUpdateSignal(sig.id, { status: 'loss', result_time: now.toISOString() })
            toast('❌ SINAL ENCERRADO. LOSS', 'error'); speakResult(false)
          }
        }
      }
    }
    run()
  }, [rounds])

  // IA — gera sinais
  useEffect(() => {
    if (!aiEnabled || !rounds.length) return
    const now = new Date()
    const ativos = signals.filter(s => s.status === 'active' || s.status === 'pending')
    const dentroDaJanela = ativos.some(s => { const { startW, endW } = getSigWindow(s.time_str); return now >= startW && now <= endW })
    if (dentroDaJanela) return
    const r = analyze(rounds, signals, aiEnabled)
    if (!r.shouldSend) return
    const dup = signals.find(s => (s.status === 'active' || s.status === 'pending') && s.time_str === r.time)
    if (dup) return
    supabase.from('signals').insert({
      time_str: r.time, protection: 6, confidence: r.confidence,
      note: `${r.activeCount}/7 pilares · gatilho:${r.trigger}`,
      is_ai: true, ai_log: r.ai_log || null, status: 'active'
    }).then(() => {
      toast(`🤖 IA: BRANCO ${r.time} (${r.confidence}%)`, 'success')
      speakSignal()
      if (notifyOn) notify(r.time, r.confidence)
    })
  }, [rounds])

  async function toggleNotify() {
    if (notifyOn) { setNotifyOn(false); return }
    const ok = await requestPermission()
    if (ok) { setNotifyOn(true); toast('🔔 Notificações ativadas!', 'success') }
    else toast('Permissão de notificação negada', 'error')
  }

  const aiResult = analyze(rounds, signals, aiEnabled)
  const pillars  = computePillars(rounds, signals)
  const risk     = getRiskStreak(rounds)
  const stats    = getStats(rounds, signals)
  const actives  = signals.filter(s => s.status === 'active' || s.status === 'pending')
  const lastRound = rounds[rounds.length - 1]
  const last30   = rounds.slice(-30)
  const circ     = 2 * Math.PI * 52
  const fillArc  = (stats.rate / 100) * circ
  const rateColor = stats.rate >= 70 ? 'var(--green)' : stats.rate >= 40 ? 'var(--gold)' : 'var(--red)'

  const now = new Date()
  const barHours = Array.from({length:12}, (_,i) => (now.getHours() - 11 + i + 24) % 24)
  const barData  = barHours.map(h => {
    const today = new Date(); today.setHours(h,0,0,0)
    return rounds.filter(r => {
      const t = new Date(r.time)
      return t.getHours() === h && t.getDate() === today.getDate() && r.color === 'white'
    }).length
  })
  const barMax = Math.max(...barData, 1)

  const pillarIcons = {1:'fire',2:'chart-line',3:'snowflake',4:'brain',5:'shield-alt',6:'layer-group',7:'lock'}

  return (
    <div className="app visible">

      {/* HEADER */}
      <header className="header">
        <div className="h-logo">
          <img src="/logo.png" alt="Logo" onError={e=>e.target.style.display='none'} />
          <div className="t">LITORAL <span>BLAZE</span> 14X</div>
        </div>
        <div className="h-right">
          <div className={`h-live ${online?'':'offline'}`}>
            <div className="dot"></div>
            <span>{online ? 'AO VIVO' : 'OFFLINE'}</span>
          </div>
          <button className="btn-icon" onClick={toggleNotify} title={notifyOn?'Desativar notificações':'Ativar notificações'} style={{color:notifyOn?'var(--gold)':'var(--text-3)'}}>
            <i className={`fas fa-bell${notifyOn?'':'-slash'}`}></i>
          </button>
          <div className="h-user">
            <div className="av">{(profile?.username||'U').charAt(0).toUpperCase()}</div>
            <div className="n">{profile?.username}</div>
            <span className={`h-badge ${isPaid?'vip':'free'}`}>{isPaid?'VIP':'FREE'}</span>
          </div>
          <button className="btn-icon" onClick={onLogout}><i className="fas fa-sign-out-alt"></i></button>
        </div>
      </header>

      {/* SHELL */}
      <div className="app-shell">

        {/* SIDEBAR */}
        <nav className="sidebar">
          {[
            {icon:'signal',label:'Sinais',active:true},
            {icon:'chess',label:'Estratég.'},
            {icon:'history',label:'Histórico'},
            {icon:'calendar-check',label:'Análise'},
            {icon:'users',label:'VIP'},
          ].map(({icon,label,active})=>(
            <div key={icon} className={`sidebar-item${active?' active':''}`}>
              <i className={`fas fa-${icon}`}></i>
              <span>{label}</span>
            </div>
          ))}
        </nav>

        {/* MAIN */}
        <main className="main-with-sidebar">

          {/* RISK BANNER */}
          {risk.isRisk && (
            <div className="risk-banner">
              <div className="risk-icon">⚠️</div>
              <div className="risk-text">
                <strong>ALERTA DE RISCO — MUITAS RODADAS SEM BRANCO</strong>
                <span>{risk.streak} rodadas sem branco (máx histórico: {risk.historicalMax}). Aguarde.</span>
              </div>
            </div>
          )}

          {/* TWO-COLUMN LAYOUT */}
          <div className="main-columns">

            {/* LEFT — GAUGE */}
            <div className="gauge-card">
              <svg width="0" height="0">
                <defs>
                  <linearGradient id="gaugeGradIdle" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#3a3a4a"/>
                    <stop offset="100%" stopColor="#5a5a6a"/>
                  </linearGradient>
                  <linearGradient id="gaugeGradActive" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#e63946"/>
                    <stop offset="100%" stopColor="#ff6b7e"/>
                  </linearGradient>
                </defs>
              </svg>

              {actives.length === 0 ? (
                <>
                  <div className="gauge-svg-wrap">
                    <svg className="gauge-svg" viewBox="0 0 220 220">
                      <circle className="track" cx="110" cy="110" r="90"
                        strokeDasharray={`${(260/360)*2*Math.PI*90} ${2*Math.PI*90}`}
                        strokeDashoffset={`${-(100/360)*2*Math.PI*90}`}
                      />
                      <circle className="fill idle" cx="110" cy="110" r="90"
                        strokeDasharray={`${(stats.rate/100)*(260/360)*2*Math.PI*90} ${2*Math.PI*90}`}
                        strokeDashoffset={`${-(100/360)*2*Math.PI*90}`}
                      />
                    </svg>
                    <div className="gauge-center">
                      <div className="gauge-time">{lastRound ? lastRound.display : '--:--'}</div>
                      <div className="gauge-status"><span className="gauge-live-dot"></span>AO VIVO</div>
                    </div>
                  </div>
                  <div className="gauge-label-top">AGUARDANDO O PRÓXIMO SINAL....</div>
                  <div className="gauge-signal-desc">IA ANALISANDO PADRÕES...<br/>(ESTRATÉGIA LITORAL)</div>
                  <div className="gauge-builds">{aiResult.reason || 'builds up'}</div>
                </>
              ) : (
                (!isPaid && showPaywall) ? null : actives.map(sig => (
                  <div key={sig.id}>
                    <div className="gauge-svg-wrap">
                      <svg className="gauge-svg" viewBox="0 0 220 220">
                        <circle className="track" cx="110" cy="110" r="90"
                          strokeDasharray={`${(260/360)*2*Math.PI*90} ${2*Math.PI*90}`}
                          strokeDashoffset={`${-(100/360)*2*Math.PI*90}`}
                        />
                        <circle className="fill active" cx="110" cy="110" r="90"
                          strokeDasharray={`${(sig.confidence/100)*(260/360)*2*Math.PI*90} ${2*Math.PI*90}`}
                          strokeDashoffset={`${-(100/360)*2*Math.PI*90}`}
                        />
                      </svg>
                      <div className="gauge-center">
                        <div className="gauge-time active">{sig.time_str}</div>
                        <div className="gauge-status" style={{color:'var(--red)'}}>
                          <span className="gauge-live-dot"></span>SINAL ATIVO
                        </div>
                      </div>
                    </div>
                    <div className="gauge-label-top">⚪ BRANCO — {sig.time_str}{sig.is_ai?' 🤖':''}</div>
                    <div className="gauge-signal-desc">{sig.note || 'Entrada com proteção'}</div>
                    <div className="gauge-builds active-sig">{sig.confidence}% CONFIANÇA · {sig.protection} rodadas</div>
                  </div>
                ))
              )}

              {/* PILARES */}
              <div className="gauge-pillars">
                <div className="gauge-pillar-title">7 PILARES DINÂMICOS</div>
                {[1,2,3,4,5,6,7].map(n => {
                  const isOn = pillars[`p${n}`]
                  const cls = n === 7 ? (isOn ? 'on' : 'veto') : (isOn ? 'on' : 'off')
                  return (
                    <div key={n} className={`gp ${cls}`} title={`Pilar ${n}`}>
                      <i className={`fas fa-${pillarIcons[n]}`}></i>
                      <span>{n}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* RIGHT — ROUNDS + CHART */}
            <div className="right-col">

              {/* ROUNDS */}
              <div className="rounds-panel">
                <div className="rounds-panel-head">
                  <div className="rounds-panel-title"><i className="fas fa-circle-notch"></i> Últimas Rodadas Double</div>
                  <div className="rounds-panel-counter">Total: <span>{rounds.length}</span></div>
                </div>
                <div className="rounds-row">
                  {last30.map((r,i) => (
                    <div key={r.id} className={`rd ${r.color}${i===last30.length-1?' latest':''}`}>{r.num}</div>
                  ))}
                </div>
              </div>

              {/* MÉDIA DE BRANCOS */}
              <div className="whites-chart">
                <div className="whites-chart-head">
                  <div className="whites-chart-title"><i className="fas fa-clock"></i> Média de Brancos</div>
                </div>
                {(() => {
                  const byHour = {}
                  rounds.forEach(r => {
                    if (r.color === 'white') {
                      const brt = new Date(new Date(r.time).getTime() - 3 * 60 * 60 * 1000)
                      const h = brt.getUTCHours()
                      byHour[h] = (byHour[h] || 0) + 1
                    }
                  })
                  const entries = Object.entries(byHour).sort((a,b) => Number(a[0]) - Number(b[0]))
                  if (!entries.length) return <p style={{color:'var(--text-3)',textAlign:'center',padding:'1rem',fontSize:'.82rem'}}>Aguardando dados...</p>
                  const maxVal = Math.max(...entries.map(([,v])=>v), 1)
                  return (
                    <div style={{display:'flex',flexDirection:'column',gap:'6px'}}>
                      {entries.map(([h, count]) => (
                        <div key={h} style={{display:'flex',alignItems:'center',gap:'8px'}}>
                          <span style={{width:'32px',fontSize:'.75rem',color:'var(--text-2)',fontWeight:600,flexShrink:0}}>{String(h).padStart(2,'0')}h</span>
                          <div style={{flex:1,background:'var(--bg-3)',borderRadius:'4px',height:'14px',overflow:'hidden'}}>
                            <div style={{width:`${(count/maxVal)*100}%`,height:'100%',background:'linear-gradient(90deg,var(--red),var(--red-2))',borderRadius:'4px',transition:'width .3s'}}/>
                          </div>
                          <span style={{width:'20px',fontSize:'.75rem',color:'var(--text-1)',fontWeight:700,textAlign:'right',flexShrink:0}}>{count}</span>
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </div>

            </div>
          </div>

          {/* PAYWALL */}
          {showPaywall && !isPaid && (
            <div className="paywall">
              <img src="/logo.png" alt="" onError={e=>e.target.style.display='none'} />
              <h2>SINAL <span>REVELADO!</span></h2>
              <p>Você viu seu sinal gratuito. Para acesso ilimitado 24h, faça o pagamento agora!</p>
              <PayBox />
            </div>
          )}

          {/* STATS */}
          <div className="stats">
            <div className="stat w"><div className="stat-lbl"><i className="fas fa-trophy"></i> WINS</div><div className="stat-val">{stats.wins}</div></div>
            <div className="stat l"><div className="stat-lbl"><i className="fas fa-times"></i> LOSSES</div><div className="stat-val">{stats.losses}</div></div>
            <div className="stat r"><div className="stat-lbl"><i className="fas fa-percentage"></i> WIN RATE</div><div className="stat-val">{stats.rate}%</div></div>
            <div className="stat t"><div className="stat-lbl"><i className="fas fa-signal"></i> SINAIS</div><div className="stat-val">{stats.totalSignals}</div></div>
          </div>

          {/* GRID */}
          <div className="grid2">
            <div className="card">
              <div className="card-h"><div className="card-t"><i className="fas fa-history"></i> Histórico de Sinais</div></div>
              <div className="card-b">
                {signals.length === 0 ? (
                  <p style={{color:'var(--text-3)',textAlign:'center',padding:'2rem',fontSize:'.82rem'}}>Aguardando sinais...</p>
                ) : [...signals].slice(0,30).map(sig => {
                  let tag='⏳ AGUARDANDO', cls='pending'
                  if (sig.status==='win')    { tag='✅ WIN';    cls='win'  }
                  if (sig.status==='loss')   { tag='❌ LOSS';   cls='loss' }
                  if (sig.status==='active') { tag='🔴 ATIVO'; cls='pending' }
                  return (
                    <div key={sig.id} className="sig">
                      <div className="sig-chip">14X</div>
                      <div className="sig-info">
                        <h4>Branco 14X — {sig.time_str}{sig.is_ai?' 🤖':''}</h4>
                        <span>{sig.note||'Proteção'} · {sig.confidence}%</span>
                      </div>
                      <span className={`sig-tag ${cls}`}>{tag}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="card">
              <div className="card-h"><div className="card-t"><i className="fas fa-chart-pie"></i> Taxa de Acerto</div></div>
              <div className="card-b">
                <div className="donut-w">
                  <div className="donut">
                    <svg viewBox="0 0 120 120">
                      <circle className="bg" cx="60" cy="60" r="52"/>
                      <circle className="fl" cx="60" cy="60" r="52" style={{stroke:rateColor,strokeDasharray:`${fillArc} ${circ}`}}/>
                    </svg>
                    <div className="donut-c">
                      <div className="donut-v" style={{color:rateColor}}>{stats.rate}%</div>
                      <div className="donut-l">WIN RATE</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* BARS */}
          <div className="card" style={{marginBottom:'1.2rem'}}>
            <div className="card-h"><div className="card-t"><i className="fas fa-chart-bar"></i> Brancos por Hora (Hoje)</div></div>
            <div className="card-b">
              <div className="bars-wrap">
                <div className="bars">
                  {barData.map((v,i) => (
                    <div key={i} className={`bar ${v===0?'empty':v>=stats.stopWhites?'danger':'normal'}`}
                      style={{height:`${(v/barMax)*100}%`}} title={`${v} brancos`}></div>
                  ))}
                </div>
                <div className="bar-lbls">
                  {barHours.map((h,i) => <div key={i} className="bar-l">{String(h).padStart(2,'0')}h</div>)}
                </div>
              </div>
            </div>
          </div>

          <div className="footer">
            <img src="/logo.png" alt="" onError={e=>e.target.style.display='none'}/>
            <p>🔥 <span style={{color:'var(--red)',fontWeight:600}}>LITORAL BLAZE 14X</span> · SIGNALS</p>
            <p>Jogue com responsabilidade · +18</p>
          </div>

        </main>
      </div>
    </div>
  )
}
