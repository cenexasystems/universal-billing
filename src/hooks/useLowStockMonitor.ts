import { useEffect, useRef } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { useAlarmStore, type LowStockItem } from '../store/alarmStore'

export function useLowStockMonitor(enabled: boolean = true, role?: string | null) {
  const setLowStockItems = useAlarmStore((state) => state.setLowStockItems)
  const isCheckingRef = useRef(false)

  const checkStockLevels = async (force: boolean = false) => {
    if (!enabled || (isCheckingRef.current && !force)) return
    isCheckingRef.current = true

    try {
      // 1. Fetch non-variant active products (exclude Unregistered)
      const { data: prods, error: prodErr } = await supabase
        .from('products')
        .select('id, name, stock_quantity, low_stock_alert, barcode, has_variants, category, category_id')
        .eq('is_active', true)
        .eq('has_variants', false)

      if (prodErr) {
        console.warn('Low stock product check warning:', prodErr)
      }

      // 2. Fetch active variants
      const { data: variants, error: varErr } = await supabase
        .from('product_variants')
        .select('id, variant_name, stock, barcode, product_id, is_active, products(name, category, category_id, is_active)')
        .eq('is_active', true)

      if (varErr) {
        console.warn('Low stock variant check warning:', varErr)
      }

      const flagged: LowStockItem[] = []

      // Check standard products
      for (const p of prods || []) {
        if (
          (p.category && p.category.trim().toLowerCase() === 'unregistered') ||
          p.category_id === 4
        ) {
          continue
        }
        const threshold = Number(p.low_stock_alert) > 0 ? Number(p.low_stock_alert) : 5
        const currentStock = Number(p.stock_quantity) || 0

        if (currentStock <= threshold) {
          flagged.push({
            id: `p-${p.id}`,
            name: p.name,
            stock: currentStock,
            alertThreshold: threshold,
            barcode: p.barcode,
            category: p.category,
          })
        }
      }

      // Check product variants
      for (const v of variants || []) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parentProd = v.products as any
        if (parentProd && parentProd.is_active === false) {
          continue
        }
        if (
          (parentProd?.category && parentProd.category.trim().toLowerCase() === 'unregistered') ||
          parentProd?.category_id === 4
        ) {
          continue
        }

        const threshold = 5
        const currentStock = Number(v.stock) || 0

        if (currentStock <= threshold) {
          flagged.push({
            id: `v-${v.id}`,
            name: parentProd?.name ? `${parentProd.name}` : 'Product Variant',
            variantName: v.variant_name,
            stock: currentStock,
            alertThreshold: threshold,
            barcode: v.barcode,
            category: parentProd?.category,
          })
        }
      }

      setLowStockItems(flagged)
    } catch (err) {
      console.warn('Stock monitor error:', err)
    } finally {
      isCheckingRef.current = false
    }
  }

  useEffect(() => {
    if (!enabled) return

    // Run an immediate check on mount / role switch
    isCheckingRef.current = false
    void checkStockLevels(true)

    // Poll every 5 minutes — the alarm only re-fires for genuinely new items
    // (alarmStore.setLowStockItems compares silencedItemIds so already-acknowledged
    //  items never re-trigger the sound even if they stay in the list)
    const interval = setInterval(() => {
      void checkStockLevels()
    }, 300000)

    if (!isSupabaseConfigured) {
      return () => clearInterval(interval)
    }

    // Realtime: re-check immediately when products/variants change in the DB
    const realtimeChannel = supabase
      .channel('low-stock-realtime-monitor')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        void checkStockLevels(true)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_variants' }, () => {
        void checkStockLevels(true)
      })
      .subscribe()

    return () => {
      clearInterval(interval)
      void supabase.removeChannel(realtimeChannel)
    }
  }, [enabled, role])
  // NOTE: The second useEffect that also watched [enabled] was removed — it caused
  // a duplicate check every time the component mounted, making the alarm appear twice.
}
