import { useState, useEffect } from 'react'
import { supabase, supabaseAdmin } from '../lib/supabase'
import { getStats, analyze, analyzeDebug } from '../lib/ai'
import { toast } from './Toast'

export default function AdminApp({ rounds, online, signals, onLogout, onCreateSignal, onUpdateSignal, onDeleteSignal, onResetSignals, onRefetch }) {
  const [users,      setUsers]      = useState([])
  const [aiEnabled,  setAiEnabled]  = useState(true)
  const [search,     setSearch]     = useState('')
  const [openLog,    setOpenLog]    = useState(null)
  const [aTime,      setATime]      = useState('')
  const [aProt,      setAProt]      = useState('6')
  const [aConf,      setAConf]      = useState('85')

  const stats    = getStats(rounds, signals)
  // Fix 10: passa signals para analyzeDebug
  const debug    = analyzeDebug(rounds, signals)
  const aiResult = analyze(rounds, signals, aiEnabled)

  useEffect(() => { fetchUsers(); fetchSettings() }, [])

  useEffect(() => {
    const sub = supabase.channel('profiles-changes')
      .on('postgres_changes', { event:'*', schema:'public', table:'profiles' }, () => fetchUsers())
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [])

  // Fix 8: fetchUsers robusto — usa supabaseAdmin (bypassa RLS) com fallback
  async function fetchUsers() {
    try {
      // Tenta via supabaseAdmin (service key) que bypassa RLS
      const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
      if (!error && data) { setUsers(data); return }
      // Fallback: anon key (pode não ver todos se RLS restrito)
      const { data: d2 } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
      setUsers(d2 || [])
    } catch (e) {
      console.warn('fetchUsers error:', e.message)
      setUsers([])
    }
  }

  async function fetchSettings() {
    const { data } = await supabase.from('settings').select('value').eq('key','ai_enabled').single()
    if (data) setAiEnabled(data.value === 'true')
  }

  async function toggleAI() {
    const next = !aiEnabled
    setAiEnabled(next)
    await supabase.from('settings').upsert({ key:'ai_enabled', value: String(next) })
    toast(next ? 'IA ATIVADA 🤖' : 'IA DESATIVADA', 'info')
  }

  async function approveUser(id) {
    await supabaseAdmin.from('profiles').update({ status:'active', approved_at: new Date().toISOString() }).eq('id', id)
    await fetchUsers()
    toast('✅ Pagamento aprovado! Acesso liberado.', 'success')
  }

  async function revokeUser(id, username) {
    if (!confirm(`Revogar acesso de ${username}?`)) return
    await supabaseAdmin.from('profiles').update({ status:'free', approved_at: null }).eq('id', id)
    await fetchUsers()
    toast(`${username} teve acesso revogado`, 'info')
  }

  // Fix 5: deleta do auth.users via supabaseAdmin (service key) + profiles
  async function deleteUser(id, username) {
    if (!confirm(`Deletar ${username}? Esta ação é irreversível.`)) return
    try {
      // Deleta perfil
      await supabaseAdmin.from('profiles').delete().eq('id', id)
      // Deleta do auth (só funciona com service key configurada)
      const { error } = await supabaseAdmin.auth.admin.deleteUser(id)
      if (error) console.warn('deleteUser auth error:', error.message)
      await fetchUsers()
      toast('Usuário removido completamente', 'info')
    } catch (e) {
      // Se não tiver service key, deleta só o perfil
      await supabase.from('profiles').delete().eq('id', id)
      await fetchUsers()
      toast('Perfil removido (auth requer service key)', 'info')
    }
  }

  async function handleCreateSig(e) {
    e.preventDefault()
    if (!aTime) { toast('Defina o horário', 'error'); return }
    const res = await onCreateSignal({ time_str: aTime, protection: parseInt(aProt), confidence: parseInt(aConf), note: 'Manual', is_ai: false })
    if (res.ok) { setATime(''); toast('🔥 Sinal enviado!', 'success') }
    else toast(res.error || 'Erro ao criar sinal', 'error')
  }

  // Fix 6: botão sync realmente busca dados novos
  async function handleSync() {
    toast('Sincronizando...', 'info')
    await fetchUsers()
    if (onRefetch) await onRefetch()
    toast('Sincronizado!', 'success')
  }

  const filtered     = search
    ? users.filter(u => u.username?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase()))
    : users
  const activeCount  = signals.filter(s => s.status === 'active').length

  return (
    <div className="admin visible">
      <header className="header">
        <div className="h-logo">
          <img src="/logo.png" alt="Logo" onError={e=>e.target.style.display='none'} />
          <div className="t">ADMIN <span>PANEL</span></div>
        </div>
        <div className="h-right">
          <div className={`h-live ${online?'':'offline'}`}>
            <div className="dot"></div>
            <span>{online?'AO VIVO':'OFFLINE'}</span>
          </div>
          <button className="btn-icon" onClick={onLogout}><i className="fas fa-sign-out-alt"></i></button>
        </div>
      </header>

      <div className="admin-wrap">
        {/* Connection */}
        <div className={`conn-bar ${online?'ok':'err'}`}>
          <div className={`conn-dot ${online?'on':'off'}`}></div>
          <div style={{flex:1}}>
            <strong style={{fontSize:'.85rem',display:'block'}}>{online?'Sistema conectado':'Sem conexão'}</strong>
            <small style={{color:'var(--text-3)',fontSize:'.7rem'}}>{rounds.length} rodadas · {users.length} usuários · {activeCount} sinais ativos</small>
          </div>
          {/* Fix 6: sync de verdade */}
          <button className="btn btn-s" onClick={handleSync}><i className="fas fa-sync"></i></button>
        </div>

        {/* AI Toggle */}
        <div style={{background:'var(--bg-2)',border:'1px solid var(--border)',borderRadius:'10px',padding:'.9rem 1.2rem',marginBottom:'1rem',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:'.7rem'}}>
          <div style={{display:'flex',alignItems:'center',gap:'8px',fontWeight:600,fontSize:'.85rem'}}>
            <i className="fas fa-brain" style={{color:'var(--red)'}}></i>
            {/* Fix 7: título correto conforme pilares reais */}
            IA Automática (6 Pilares + P7 Veto)
          </div>
          <div className={`toggle ${aiEnabled?'on':''}`} onClick={toggleAI}></div>
        </div>

        {/* AI Info */}
        <div className="ai-info-grid">
          {[['Rodadas Hoje', stats.total],['Brancos Hoje', stats.whites],['Média/Hora', stats.avgPerHour],['Top Gatilho', stats.topTrigger],['Limite Brancos/h', stats.stopWhites ?? '—'],['Limite Sinais/h', stats.stopSignals ?? '—']].map(([l,v])=>(
            <div key={l} className="ai-card"><div className="l">{l}</div><div className="v">{v}</div></div>
          ))}
        </div>

        {/* Stats */}
        <div className="stats">
          <div className="stat w"><div className="stat-lbl"><i className="fas fa-trophy"></i> WINS</div><div className="stat-val">{stats.wins}</div></div>
          <div className="stat l"><div className="stat-lbl"><i className="fas fa-times"></i> LOSSES</div><div className="stat-val">{stats.losses}</div></div>
          <div className="stat r"><div className="stat-lbl"><i className="fas fa-percentage"></i> WIN RATE</div><div className="stat-val">{stats.rate}%</div></div>
          <div className="stat t"><div className="stat-lbl"><i className="fas fa-users"></i> USUÁRIOS</div><div className="stat-val">{users.length}</div></div>
        </div>

        <div className="admin-grid">
          {/* Sinal Manual */}
          <div className="card">
            <div className="card-h"><div className="card-t"><i className="fas fa-plus-circle"></i> Sinal Manual</div></div>
            <div className="card-b">
              <form onSubmit={handleCreateSig}>
                <div className="form-group"><label>Horário</label><input type="time" value={aTime} onChange={e=>setATime(e.target.value)} /></div>
                <div className="form-group"><label>Proteção</label>
                  <select value={aProt} onChange={e=>setAProt(e.target.value)}>
                    <option value="3">3 rodadas</option>
                    <option value="6">6 rodadas</option>
                    <option value="9">9 rodadas</option>
                  </select>
                </div>
                <div className="form-group"><label>Confiança (%)</label><input type="number" value={aConf} onChange={e=>setAConf(e.target.value)} min="50" max="100" /></div>
                <button className="btn btn-p" type="submit"><i className="fas fa-bolt"></i> ENVIAR SINAL</button>
              </form>
            </div>
          </div>

          {/* Lista de Sinais */}
          <div className="card">
            <div className="card-h"><div className="card-t"><i className="fas fa-list"></i> Sinais ({signals.length})</div></div>
            <div className="card-b" style={{maxHeight:300,overflowY:'auto'}}>
              {signals.length === 0 ? (
                <p style={{color:'var(--text-3)',textAlign:'center',padding:'1.5rem',fontSize:'.82rem'}}>Nenhum sinal</p>
              ) : signals.slice(0,30).map(sig => {
                let tagEl = null
                if(sig.status==='active')tagEl=<span className="sig-tag pending">ATIVO</span>
                else if(sig.status==='win')tagEl=<span className="sig-tag win">WIN</span>
                else if(sig.status==='loss')tagEl=<span className="sig-tag loss">LOSS</span>
                else tagEl=<span className="sig-tag" style={{opacity:.4}}>EXP</span>
                const canMark = sig.status==='active'||sig.status==='pending'
                return (
                  <div key={sig.id} style={{marginBottom:'6px'}}>
                    <div className="aitem" style={{marginBottom:openLog===sig.id?'0':undefined,borderBottomLeftRadius:openLog===sig.id?0:undefined,borderBottomRightRadius:openLog===sig.id?0:undefined}}>
                      <div className="aitem-left">
                        <div className="sig-chip" style={{width:28,height:28,fontSize:'.5rem'}}>14X</div>
                        <div>
                          <strong style={{fontSize:'.82rem'}}>{sig.time_str}{sig.is_ai?' [IA]':''}</strong>
                          <br/><small style={{color:'var(--text-3)',fontSize:'.68rem'}}>{sig.confidence}%</small>
                        </div>
                      </div>
                      <div className="aitem-acts">
                        {tagEl}
                        {/* Fix 11: botão LOG aparece se ai_log existir (agora que a coluna existe) */}
                        {sig.ai_log && (
                          <button
                            className="btn btn-s"
                            title="Ver log da IA"
                            style={{fontSize:'.65rem',padding:'3px 7px',background:'rgba(234,179,8,.15)',borderColor:'rgba(234,179,8,.4)',color:'#e4b800'}}
                            onClick={()=>setOpenLog(openLog===sig.id?null:sig.id)}
                          >LOG</button>
                        )}
                        {canMark && <>
                          <button className="btn btn-s" onClick={async()=>{await onUpdateSignal(sig.id,{status:'win',result_time:new Date().toISOString()});toast('WIN!','success')}}>W</button>
                          <button className="btn btn-d" onClick={async()=>{await onUpdateSignal(sig.id,{status:'loss',result_time:new Date().toISOString()});toast('LOSS','error')}}>L</button>
                        </>}
                        <button className="btn btn-d" onClick={async()=>{await onDeleteSignal(sig.id);toast('Removido','info')}}><i className="fas fa-trash"></i></button>
                      </div>
                    </div>
                    {openLog===sig.id && sig.ai_log && (
                      <div style={{background:'rgba(0,0,0,.4)',border:'1px solid var(--border)',borderTop:'none',borderBottomLeftRadius:'8px',borderBottomRightRadius:'8px',padding:'.7rem .9rem'}}>
                        <div style={{fontSize:'.68rem',fontWeight:700,color:'#e4b800',marginBottom:'6px'}}>LOG DA IA — POR QUE ESTE SINAL FOI ENVIADO</div>
                        <pre style={{margin:0,fontSize:'.65rem',color:'var(--text-2)',lineHeight:1.6,whiteSpace:'pre-wrap',wordBreak:'break-word',fontFamily:'monospace'}}>{sig.ai_log}</pre>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Usuários */}
          <div className="card" style={{gridColumn:'1/-1'}}>
            <div className="card-h"><div className="card-t"><i className="fas fa-users-cog"></i> Gerenciar Usuários ({users.length})</div></div>
            <div className="card-b">
              <div className="search-wrap">
                <i className="fas fa-search"></i>
                <input className="search-input" placeholder="Buscar por usuário ou email..." value={search} onChange={e=>setSearch(e.target.value)} />
              </div>
              {filtered.length === 0 ? (
                <p style={{color:'var(--text-3)',fontSize:'.75rem',textAlign:'center',padding:'.8rem'}}>Nenhum usuário encontrado</p>
              ) : filtered.map(u => (
                <div key={u.id} className="aitem">
                  <div className="aitem-left">
                    <div style={{width:28,height:28,borderRadius:'50%',background:'linear-gradient(135deg,var(--red),#ff6b7e)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'.68rem',fontWeight:700,flexShrink:0}}>
                      {(u.username||'?').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <strong style={{fontSize:'.82rem'}}>{u.username}</strong>
                      <br/><small style={{color:'var(--text-3)',fontSize:'.65rem'}}>{u.email} · {u.created_at?new Date(u.created_at).toLocaleDateString('pt-BR'):'—'}</small>
                    </div>
                  </div>
                  <div className="aitem-acts">
                    <span className={`user-badge ${u.status==='active'?'active':'pending'}`}>{u.status==='active'?'ATIVO':'PENDENTE'}</span>
                    {u.status!=='active'
                      ? <button className="btn btn-s" onClick={()=>approveUser(u.id)} title="Aprovar pagamento"><i className="fas fa-check"></i></button>
                      : <button className="btn btn-d" onClick={()=>revokeUser(u.id,u.username)} title="Revogar"><i className="fas fa-ban"></i></button>
                    }
                    <button className="btn btn-d" onClick={()=>deleteUser(u.id,u.username)}><i className="fas fa-user-minus"></i></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RAIO-X DA IA */}
        <div style={{background:'var(--bg-2)',border:'1px solid var(--border)',borderRadius:'12px',padding:'1rem 1.2rem',marginBottom:'1rem'}}>
          <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'1rem',fontWeight:700,fontSize:'.88rem'}}>
            <i className="fas fa-brain" style={{color:'var(--red)'}}></i>
            {/* Fix 7: título correto */}
            RAIO-X DA IA — O QUE ELA ESTÁ PENSANDO (6 Pilares + P7 Veto)
            <span style={{marginLeft:'auto',fontSize:'.72rem',padding:'3px 10px',borderRadius:'20px',
              background: aiResult.shouldSend ? 'rgba(34,197,94,.15)' : 'rgba(255,59,59,.1)',
              color: aiResult.shouldSend ? 'var(--green)' : 'var(--text-3)',
              border: `1px solid ${aiResult.shouldSend ? 'var(--green)' : 'var(--border)'}`, fontWeight:600}}>
              {aiResult.shouldSend ? `🔥 SINAL PRONTO — ${aiResult.time}` : 'Analisando padrões...'}
            </span>
          </div>

          {!debug ? (
            <p style={{color:'var(--text-3)',fontSize:'.8rem',textAlign:'center',padding:'.5rem'}}>Aguardando pelo menos 20 rodadas para análise...</p>
          ) : (
            <>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:'8px',marginBottom:'1rem'}}>
                {[debug.p1, debug.p2, debug.p3, debug.p4, debug.p5, debug.p6].filter(Boolean).map((p, i) => (
                  <div key={i} style={{
                    background: p.active ? 'rgba(34,197,94,.08)' : 'rgba(255,255,255,.03)',
                    border: `1px solid ${p.active ? 'rgba(34,197,94,.3)' : 'var(--border)'}`,
                    borderRadius:'8px', padding:'.7rem .9rem'
                  }}>
                    <div style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'4px'}}>
                      <div style={{width:'22px',height:'22px',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'.7rem',fontWeight:700,flexShrink:0,
                        background: p.active ? 'var(--green)' : 'var(--bg-3)',
                        color: p.active ? '#000' : 'var(--text-3)',
                        border: `1px solid ${p.active ? 'var(--green)' : 'var(--border)'}`}}>{i+1}</div>
                      <span style={{fontSize:'.78rem',fontWeight:700,color: p.active ? 'var(--green)' : 'var(--text-2)'}}>
                        {p.desc} {p.active ? '✅' : '⏳'}
                      </span>
                    </div>
                    <p style={{fontSize:'.72rem',color:'var(--text-3)',margin:0,lineHeight:1.4}}>{p.detail}</p>
                  </div>
                ))}
              </div>

              {/* P7 — Zona Morta */}
              {debug.p7 && (
                <div style={{
                  background: debug.p7.blocking ? 'rgba(255,59,59,.12)' : debug.p7.active ? 'rgba(34,197,94,.08)' : 'rgba(255,255,255,.03)',
                  border: `1px solid ${debug.p7.blocking ? 'rgba(255,59,59,.5)' : debug.p7.active ? 'rgba(34,197,94,.3)' : 'var(--border)'}`,
                  borderRadius:'8px', padding:'.7rem .9rem', marginBottom:'8px'
                }}>
                  <div style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'4px'}}>
                    <div style={{width:'22px',height:'22px',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'.7rem',fontWeight:700,flexShrink:0,
                      background: debug.p7.blocking ? 'var(--red)' : debug.p7.active ? 'var(--green)' : 'var(--bg-3)',
                      color: debug.p7.blocking || debug.p7.active ? '#fff' : 'var(--text-3)'}}>7</div>
                    <span style={{fontSize:'.78rem',fontWeight:700,color: debug.p7.blocking ? 'var(--red)' : debug.p7.active ? 'var(--green)' : 'var(--text-2)'}}>
                      {debug.p7.desc} {debug.p7.blocking ? '🚫 VETANDO' : debug.p7.active ? '✅ Zona Segura' : '⏳'}
                    </span>
                    {debug.p7.similarity > 0 && (
                      <span style={{marginLeft:'auto',fontSize:'.7rem',padding:'2px 8px',borderRadius:'20px',
                        background: debug.p7.blocking ? 'rgba(255,59,59,.2)' : 'rgba(255,193,7,.15)',
                        color: debug.p7.blocking ? 'var(--red)' : '#e4b800', border:'1px solid currentColor'}}>
                        {debug.p7.similarity}% similar
                      </span>
                    )}
                  </div>
                  <p style={{fontSize:'.72rem',color:'var(--text-3)',margin:0,lineHeight:1.4}}>{debug.p7.detail}</p>
                </div>
              )}

              <div style={{display:'flex',gap:'1rem',flexWrap:'wrap',fontSize:'.75rem',color:'var(--text-3)',borderTop:'1px solid var(--border)',paddingTop:'.7rem'}}>
                <span>📊 Rodadas hoje: <strong style={{color:'var(--text)'}}>{debug.totalRodadas}</strong></span>
                <span>🎯 Último número: <strong style={{color:'var(--text)'}}>#{debug.lastNum ?? '—'}</strong></span>
                <span>⏱ Estimativa: <strong style={{color:'var(--text)'}}>{debug.estimateMin} min</strong></span>
                <span>🕐 Minuto alvo: <strong style={{color:'var(--text)'}}>{String(debug.targetMin ?? 0).padStart(2,'0')}min</strong></span>
                {aiResult.shouldSend && <span>💪 Confiança: <strong style={{color:'var(--green)'}}>{aiResult.confidence}%</strong></span>}
                {/* Fix 10: mostra quota real */}
                {debug.quotaOk !== undefined && (
                  <span>📈 Cota: <strong style={{color: debug.quotaOk ? 'var(--green)' : 'var(--red)'}}>{debug.sentLastHour}/{debug.quota} sinais/h</strong></span>
                )}
              </div>
            </>
          )}
        </div>

        {/* Danger Zone */}
        <div className="danger-zone">
          <div className="card-h"><div className="card-t" style={{color:'var(--red)'}}><i className="fas fa-exclamation-triangle"></i> Zona de Perigo</div></div>
          {/* Fix 4: .then() agora funciona pois resetSignals retorna Promise */}
          <div className="card-b" style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <button className="btn btn-d" onClick={()=>onResetSignals('s').then(()=>toast('Sinais limpos','info'))}><i className="fas fa-trash"></i> Limpar Sinais</button>
            <button className="btn btn-d" onClick={()=>onResetSignals('stats').then(()=>toast('Stats resetadas','info'))}><i className="fas fa-chart-bar"></i> Resetar Stats</button>
            <button className="btn btn-d" onClick={()=>{ if(confirm('RESET TOTAL?')) onResetSignals('all').then(()=>toast('Reset total feito','info')) }}><i className="fas fa-bomb"></i> RESET TOTAL</button>
          </div>
        </div>

        <div className="footer">
          <img src="/logo.png" alt="" onError={e=>e.target.style.display='none'}/>
          <p>⚡ <span style={{color:'var(--red)',fontWeight:600}}>LITORAL BLAZE 14X</span> · ADMIN</p>
        </div>
      </div>
    </div>
  )
}
