import { getColor } from '../hooks/useRounds'

export function getColor2(num) { return getColor(num) }

// Todas as rodadas (histórico completo) — para pilares estatísticos
function getAllRounds(rounds) {
  return rounds
}

// Só rodadas de hoje — para pilares de horário
function getTodayRounds(rounds) {
  const t = new Date()
  return rounds.filter(r => {
    const d = new Date(r.time)
    return d.getDate() === t.getDate() &&
           d.getMonth() === t.getMonth() &&
           d.getFullYear() === t.getFullYear()
  })
}

export function analyze(rounds, signals, aiEnabled) {
  if (!aiEnabled) return { shouldSend: false, reason: 'IA desativada', pillars: {} }

  const all   = getAllRounds(rounds)   // histórico completo
  const today = getTodayRounds(rounds) // só hoje

  if (all.length < 20)   return { shouldSend: false, reason: 'Analisando padrões...', pillars: {} }
  if (today.length < 10) return { shouldSend: false, reason: 'Analisando padrões...', pillars: {} }

  // Pilares estatísticos usam histórico completo
  const p1 = pillar1(all)
  const p4 = pillar4(all)

  if (!p1.valid) return { shouldSend: false, reason: 'Analisando padrões...', pillars: { p1:false,p2:false,p3:false,p4:p4.detected,p5:false } }

  const lastNum    = today.length ? today[today.length - 1].num : null
  const triggerHit = p1.numbers.find(x => x.num === lastNum)
  const p2         = triggerHit ? pillar2(all, lastNum) : { valid: false, avg: 0 }

  // Pilares de horário usam só hoje
  const now         = new Date()
  const estimateMin = p2.avg || 5
  const targetMin   = (now.getMinutes() + estimateMin) % 60
  const p3          = pillar3(today)
  const isHotMin    = p3.minutes.some(x => Math.abs(x.min - targetMin) <= 2)
  const p5          = pillar5(today, targetMin)

  const activePillars = {
    p1: p1.valid && !!triggerHit,
    p2: p2.valid,
    p3: isHotMin,
    p4: p4.detected,
    p5: p5.detected
  }
  const count = Object.values(activePillars).filter(Boolean).length
  if (count < 4) return { shouldSend: false, reason: 'Analisando padrões...', pillars: activePillars }

  const target  = new Date(now.getTime() + estimateMin * 60000)
  const timeStr = `${String(target.getHours()).padStart(2,'0')}:${String(target.getMinutes()).padStart(2,'0')}`
  return {
    shouldSend: true,
    time: timeStr,
    confidence: Math.min(60 + count*5 + p5.boost, 98),
    pillars: activePillars,
    activeCount: count,
    reason: `🔥 SINAL: Branco ${timeStr}`,
    trigger: lastNum,
    estimateMin
  }
}

export function getRiskStreak(rounds) {
  const today = getTodayRounds(rounds)
  if (today.length < 10) return { streak:0, historicalMax:0, isRisk:false }
  let streak = 0
  for (let i = today.length - 1; i >= 0; i--) { if (today[i].color === 'white') break; streak++ }
  let max = 0, cur = 0
  for (const r of today) { if (r.color !== 'white') cur++; else { if (cur > max) max = cur; cur = 0 } }
  if (cur > max) max = cur
  return { streak, historicalMax: max, isRisk: streak >= Math.max(8, Math.floor(max * 0.8)) && streak >= 6 }
}

export function getStats(rounds, signals) {
  const today  = getTodayRounds(rounds)
  const all    = getAllRounds(rounds)
  const whites = today.filter(r => r.color === 'white')
  const byHour = {}
  whites.forEach(r => { const h = new Date(r.time).getHours(); byHour[h] = (byHour[h]||0)+1 })
  const hours  = Object.keys(byHour).length || 1
  const counts = {}
  for (let i = 1; i < all.length; i++) { if (all[i].color==='white') { const p=all[i-1].num; counts[p]=(counts[p]||0)+1 } }
  const top = Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]
  const w   = signals.filter(s=>s.status==='win').length
  const l   = signals.filter(s=>s.status==='loss').length
  return {
    total: today.length,
    whites: whites.length,
    avgPerHour: (whites.length/hours).toFixed(1),
    topTrigger: top ? `${top[0]} (${top[1]}x)` : '—',
    stopWhites: getDynamicStopWhites(today),
    stopSignals: getDynamicStopSignals(today),
    wins: w, losses: l,
    rate: w+l>0 ? Math.round(w/(w+l)*100) : 0,
    totalSignals: signals.length
  }
}

// ── Internals ─────────────────────────────────────────────────────
function getDynamicStopWhites(today) {
  const byH = {}; today.filter(r=>r.color==='white').forEach(r=>{const h=new Date(r.time).getHours();byH[h]=(byH[h]||0)+1})
  const v = Object.values(byH); return v.length ? Math.max(4, Math.ceil(v.reduce((a,b)=>a+b,0)/v.length*1.5)) : 8
}
function getDynamicStopSignals(today) { return Math.max(3, getDynamicStopWhites(today)+1) }

// Pilar 1 — usa histórico completo
function pillar1(all) {
  const counts={}
  for(let i=1;i<all.length;i++){if(all[i].color==='white'){const p=all[i-1].num;counts[p]=(counts[p]||0)+1}}
  if(!Object.keys(counts).length) return {numbers:[],valid:false}
  const max=Math.max(...Object.values(counts))
  const sorted=Object.entries(counts).filter(([,c])=>c>=Math.max(2,Math.floor(max*0.5))).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([n,c])=>({num:parseInt(n),count:c}))
  return {numbers:sorted,valid:sorted.length>0}
}

// Pilar 2 — usa histórico completo
function pillar2(all, triggerNum) {
  const ws=Math.min(50,Math.max(10,Math.floor(all.length*0.1))); const intervals=[]
  for(let i=0;i<all.length-1;i++){if(all[i].num===triggerNum){for(let j=i+1;j<Math.min(i+ws,all.length);j++){if(all[j].color==='white'){intervals.push((new Date(all[j].time)-new Date(all[i].time))/60000);break;}}}}
  if(intervals.length<2) return {avg:0,consistency:0,valid:false}
  const avg=intervals.reduce((a,b)=>a+b,0)/intervals.length
  const within=intervals.filter(x=>Math.abs(x-avg)<=2).length
  return {avg:Math.max(1,Math.round(avg)),consistency:Math.round(within/intervals.length*100),valid:within/intervals.length>=0.6}
}

// Pilar 3 — usa só hoje
function pillar3(today) {
  const m={}; today.forEach(r=>{if(r.color==='white'){const mn=new Date(r.time).getMinutes();m[mn]=(m[mn]||0)+1}})
  if(!Object.keys(m).length) return {minutes:[],valid:false}
  const max=Math.max(...Object.values(m))
  const hot=Object.entries(m).filter(([,c])=>c>=Math.max(2,Math.floor(max*0.4))).sort((a,b)=>b[1]-a[1]).map(([mn,c])=>({min:parseInt(mn),count:c}))
  return {minutes:hot,valid:hot.length>0}
}

// Pilar 4 — usa histórico completo
function pillar4(all) {
  const whites=all.filter(r=>r.color==='white').slice(-20)
  if(whites.length<3) return {detected:false}
  const gaps=[]; for(let i=1;i<whites.length;i++) gaps.push((new Date(whites[i].time)-new Date(whites[i-1].time))/60000)
  const avg=gaps.slice(-5).reduce((a,b)=>a+b,0)/Math.min(5,gaps.length)
  return avg>=7&&avg<=15 ? {detected:true,gap:Math.round(avg)} : {detected:false}
}

// Pilar 5 — usa só hoje
function pillar5(today, targetMin) {
  const now=new Date(); const pv=new Date(now); pv.setHours(now.getHours()-1); pv.setMinutes(targetMin)
  const w=today.filter(r=>Math.abs(new Date(r.time)-pv)<180000)
  const hasFalse=w.some(r=>r.num===4||r.num===11)
  return {detected:hasFalse,boost:hasFalse?15:0}
}

// WIN window: ±1 min
export function getSigWindow(timeStr) {
  const [h,m] = timeStr.split(':').map(Number)
  const base  = new Date(); base.setHours(h,m,0,0)
  return { startW: new Date(base.getTime()-60000), endW: new Date(base.getTime()+60000) }
}

export function analyzeDebug(rounds) {
  const all   = getAllRounds(rounds)
  const today = getTodayRounds(rounds)
  if (all.length < 20) return null

  const lastNum    = today.length ? today[today.length - 1].num : null
  const p1         = pillar1(all)
  const triggerHit = p1.numbers.find(x => x.num === lastNum)
  const p2         = triggerHit ? pillar2(all, lastNum) : { valid: false, avg: 0, consistency: 0 }
  const p3         = pillar3(today)
  const p4         = pillar4(all)
  const now        = new Date()
  const estimateMin = p2.avg || 5
  const targetMin   = (now.getMinutes() + estimateMin) % 60
  const isHotMin    = p3.minutes.some(x => Math.abs(x.min - targetMin) <= 2)
  const p5          = pillar5(today, targetMin)

  return {
    totalRodadas: all.length,
    totalHoje: today.length,
    lastNum,
    p1: { active: p1.valid && !!triggerHit, desc: 'Gatilhos Frequentes', detail: p1.valid ? `Gatilhos: ${p1.numbers.map(x=>`#${x.num}(${x.count}x)`).join(', ')} | Último: #${lastNum} ${triggerHit?'✅ MATCH':'❌ sem match'}` : 'Sem padrão de gatilhos ainda' },
    p2: { active: p2.valid, desc: 'Intervalo Consistente', detail: p2.valid ? `Média: ${p2.avg} min após gatilho | Consistência: ${p2.consistency}%` : `Consistência insuficiente (${p2.consistency||0}%) — mín 60%` },
    p3: { active: isHotMin, desc: 'Minutos Quentes (hoje)', detail: p3.minutes.length ? `Minutos com mais brancos hoje: ${p3.minutes.slice(0,5).map(x=>`${String(x.min).padStart(2,'0')}min(${x.count}x)`).join(', ')} | Alvo: ${String(targetMin).padStart(2,'0')}min ${isHotMin?'✅':'❌'}` : 'Sem minutos quentes hoje' },
    p4: { active: p4.detected, desc: 'Ritmo de Brancos (histórico)', detail: p4.detected ? `Gap médio entre brancos: ${p4.gap} min (ideal 7-15 min) ✅` : 'Gap entre brancos fora do intervalo ideal (7-15 min)' },
    p5: { active: p5.detected, desc: 'Confirmação Histórica (hoje)', detail: p5.detected ? `Padrão confirmado na hora anterior (+${p5.boost}% confiança) ✅` : 'Sem confirmação histórica na hora anterior' },
    targetMin,
    estimateMin,
  }
}