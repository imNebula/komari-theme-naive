import type { NodeData } from '@/stores/nodes'

export type SupportedCurrency = 'CNY' | 'USD' | 'HKD' | 'EUR' | 'GBP' | 'JPY'

export const DEFAULT_EXCHANGE_RATES: Record<SupportedCurrency, number> = {
  CNY: 1,
  USD: 0.142536,
  HKD: 1.108377,
  EUR: 0.12102,
  GBP: 0.105581,
  JPY: 22.231552,
}

const CURRENCY_ALIASES: Record<string, SupportedCurrency> = {
  'CNY': 'CNY',
  '￥': 'CNY',
  '¥': 'CNY',
  'RMB': 'CNY',
  'USD': 'USD',
  '$': 'USD',
  'HKD': 'HKD',
  'HK$': 'HKD',
  'EUR': 'EUR',
  '€': 'EUR',
  'GBP': 'GBP',
  '£': 'GBP',
  'JPY': 'JPY',
}

export function normalizeCurrency(currency: string | null | undefined): SupportedCurrency {
  if (!currency)
    return 'CNY'

  const normalized = currency.trim().toUpperCase()
  return CURRENCY_ALIASES[normalized] ?? CURRENCY_ALIASES[currency.trim()] ?? 'CNY'
}

export function getCurrencySymbol(currency: SupportedCurrency): string {
  const symbols: Record<SupportedCurrency, string> = {
    CNY: '¥',
    USD: '$',
    HKD: 'HK$',
    EUR: '€',
    GBP: '£',
    JPY: '¥',
  }
  return symbols[currency]
}

export function isLongTermNode(expiredAt: string | null | undefined, now = new Date()): boolean {
  if (!expiredAt)
    return false

  const expiresAt = new Date(expiredAt)
  if (Number.isNaN(expiresAt.getTime()))
    return false

  const diffYears = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 365)
  return diffYears > 100
}

export function convertNodePriceToCny(price: number, currency: string | null | undefined, rates: Record<SupportedCurrency, number>): number {
  if (!Number.isFinite(price) || price <= 0)
    return 0

  const normalized = normalizeCurrency(currency)
  const rate = rates[normalized] || 1

  if (normalized === 'CNY')
    return price

  return price / rate
}

export function calculateMonthlyPriceCny(node: NodeData, rates: Record<SupportedCurrency, number>): number {
  const priceCny = convertNodePriceToCny(node.price, node.currency, rates)
  if (priceCny <= 0 || !Number.isFinite(node.billing_cycle) || node.billing_cycle <= 0)
    return 0

  return priceCny / (node.billing_cycle / 30)
}

export function calculateRemainingValueCny(node: NodeData, rates: Record<SupportedCurrency, number>, now = new Date()): number {
  const priceCny = convertNodePriceToCny(node.price, node.currency, rates)
  if (priceCny <= 0)
    return 0

  if (isLongTermNode(node.expired_at, now))
    return priceCny

  if (!node.expired_at || !Number.isFinite(node.billing_cycle) || node.billing_cycle <= 0)
    return 0

  const expiresAt = new Date(node.expired_at)
  if (Number.isNaN(expiresAt.getTime()))
    return 0

  const remainingMs = expiresAt.getTime() - now.getTime()
  if (remainingMs <= 0)
    return 0

  const billingCycleMs = node.billing_cycle * 24 * 60 * 60 * 1000
  return priceCny * (remainingMs / billingCycleMs)
}

export function convertCnyToCurrency(amountCny: number, currency: SupportedCurrency, rates: Record<SupportedCurrency, number>): number {
  const rate = rates[currency] || 1
  return amountCny * rate
}
