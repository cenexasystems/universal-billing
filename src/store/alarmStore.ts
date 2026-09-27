import { create } from 'zustand'
import { alarmSound } from '../lib/alarmAudio'

export interface LowStockItem {
  id: string | number
  name: string
  variantName?: string
  stock: number
  alertThreshold: number
  barcode?: string
  category?: string
}

interface AlarmState {
  lowStockItems: LowStockItem[]
  isAlarmActive: boolean
  silencedItemIds: Set<string | number>
  // IDs seen during the current session (to avoid re-triggering sound for known items)
  seenItemIds: Set<string | number>
  setLowStockItems: (items: LowStockItem[]) => void
  silenceAlarm: () => void
  resetSilencedState: () => void
}

export const useAlarmStore = create<AlarmState>((set, get) => ({
  lowStockItems: [],
  isAlarmActive: false,
  silencedItemIds: new Set<string | number>(),
  seenItemIds: new Set<string | number>(),

  setLowStockItems: (items) => {
    const { silencedItemIds, seenItemIds } = get()
    const currentItemIds = new Set(items.map(i => String(i.id)))

    // Clean up memory: remove items from silenced/seen sets if they are no longer low-stock
    const nextSilenced = new Set([...silencedItemIds].filter(id => currentItemIds.has(String(id))))
    const nextSeen = new Set([...seenItemIds].filter(id => currentItemIds.has(String(id))))

    // Unsilenced items that have NOT been shown to the user yet this session
    const trulyNewItems = items.filter(
      (item) => !nextSilenced.has(String(item.id)) && !nextSeen.has(String(item.id))
    )

    // Any unsilenced low-stock item (for showing the modal)
    const hasUnsilenced = items.some(
      (item) => !nextSilenced.has(String(item.id))
    )

    if (items.length > 0 && hasUnsilenced) {
      // Only (re)start the audible alarm when there are genuinely NEW items not yet seen
      if (trulyNewItems.length > 0) {
        alarmSound.startAlert()
      }

      // Mark all current items as seen so the next poll doesn't re-sound them
      items.forEach((i) => {
        nextSeen.add(String(i.id))
      })

      set({ 
        lowStockItems: items, 
        isAlarmActive: true, 
        seenItemIds: nextSeen,
        silencedItemIds: nextSilenced
      })
    } else {
      alarmSound.stopAlert()
      set({ lowStockItems: items, isAlarmActive: false })
      if (items.length === 0) {
        // All clear — reset everything so future stock issues are treated as new
        set({ silencedItemIds: new Set(), seenItemIds: new Set() })
      }
    }
  },

  silenceAlarm: () => {
    const currentItemIds = get().lowStockItems.map((i) => String(i.id))
    alarmSound.stopAlert()
    set({
      isAlarmActive: false,
      silencedItemIds: new Set(currentItemIds),
    })
  },

  resetSilencedState: () => {
    set({ silencedItemIds: new Set(), seenItemIds: new Set() })
  },
}))
