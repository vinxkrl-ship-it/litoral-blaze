import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export default function useSignals() {
  const [signals, setSignals] = useState([])

  const fetchSignals = useCallback(async () => {
    const { data } = await supabase
      .from('signals')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
    if (data) setSignals(data)
  }, [])

  useEffect(() => {
    fetchSignals()
    const sub = supabase
      .channel('signals-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'signals' }, () => fetchSignals())
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [fetchSignals])

  const createSignal = async ({ time_str, protection, confidence, note, is_ai, ai_log }) => {
    const { data, error } = await supabase.from('signals').insert({
      time_str,
      protection: protection || 6,
      confidence: confidence || 85,
      note:       note || '',
      is_ai:      !!is_ai,
      ai_log:     ai_log || null,
      status:     'active'
    }).select().single()
    if (!error) await fetchSignals()
    // Fix 9: retorna error.message (string) em vez do objeto
    return { ok: !error, data, error: error?.message || null }
  }

  const updateSignal = async (id, updates) => {
    const { error } = await supabase.from('signals').update(updates).eq('id', id)
    await fetchSignals()
    return { ok: !error, error: error?.message || null }
  }

  const deleteSignal = async (id) => {
    const { error } = await supabase.from('signals').delete().eq('id', id)
    await fetchSignals()
    return { ok: !error, error: error?.message || null }
  }

  // Fix 4: retorna Promise explícita para que .then() funcione no AdminApp
  const resetSignals = async (type) => {
    try {
      if (type === 'all' || type === 's') {
        await supabase.from('signals').delete().neq('id', 0)
      } else if (type === 'stats') {
        await supabase.from('signals').update({ status: 'expired' }).in('status', ['win', 'loss'])
      }
      await fetchSignals()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  }

  return { signals, refetch: fetchSignals, createSignal, updateSignal, deleteSignal, resetSignals }
}
