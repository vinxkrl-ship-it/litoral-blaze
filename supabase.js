import { useState, useEffect } from 'react'
import { supabase, signUp, signIn, signOut, getProfile } from '../lib/supabase'

export default function useAuth() {
  const [user,    setUser]    = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Fix 3: try/finally garante que loading SEMPRE termina
    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          setUser(session.user)
          try {
            const p = await getProfile(session.user.id)
            setProfile(p)
          } catch { /* perfil pode nao existir ainda */ }
        }
      } catch (e) {
        console.warn('Auth init error:', e.message)
      } finally {
        setLoading(false) // SEMPRE desbloqueia, nunca trava
      }
    }
    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        setUser(session.user)
        try {
          const p = await getProfile(session.user.id)
          setProfile(p)
        } catch { }
      } else {
        setUser(null)
        setProfile(null)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const refreshProfile = async () => {
    if (!user) return null
    try { const p = await getProfile(user.id); setProfile(p); return p } catch { return null }
  }

  const login = async (email, password) => {
    try {
      const res = await signIn(email, password)
      if (res.ok) { try { const p = await getProfile(res.user.id); setProfile(p) } catch { } }
      return res
    } catch (e) { return { ok: false, error: e.message } }
  }

  const register = async (email, password, username) => {
    try { return await signUp(email, password, username) }
    catch (e) { return { ok: false, error: e.message } }
  }

  const logout = async () => {
    try { await signOut() } catch { }
    setUser(null); setProfile(null)
  }

  const isAdmin = profile?.role === 'admin'
  const isPaid  = profile?.status === 'active' || isAdmin

  return { user, profile, loading, isAdmin, isPaid, login, register, logout, refreshProfile }
}
