import { useEffect, useRef } from 'react'

// Registra o Service Worker e expõe a função de notificação
export default function usePushNotify() {
  const swRef = useRef(null)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').then(reg => {
      swRef.current = reg
    }).catch(() => {})
  }, [])

  async function requestPermission() {
    if (!('Notification' in window)) return false
    if (Notification.permission === 'granted') return true
    const perm = await Notification.requestPermission()
    return perm === 'granted'
  }

  async function notify(time, confidence) {
    const granted = await requestPermission()
    if (!granted) return

    // Tenta via Service Worker (funciona com app minimizado)
    if (swRef.current?.active) {
      swRef.current.active.postMessage({ type: 'SIGNAL_NOTIFY', time, confidence })
      return
    }

    // Fallback: notificação direta (só funciona com app aberto)
    if (Notification.permission === 'granted') {
      new Notification('🔥 LITORAL BLAZE — SINAL!', {
        body: `Branco previsto às ${time} | Confiança: ${confidence}%`,
        icon: '/logo.png',
        tag: 'signal',
      })
    }
  }

  return { notify, requestPermission }
}
