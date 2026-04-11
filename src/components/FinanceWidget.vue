<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { NodeData } from '@/stores/nodes'
import type { SupportedCurrency } from '@/utils/finance'
import { useStorage } from '@vueuse/core'
import { NModal, NSelect, NTooltip, useThemeVars } from 'naive-ui'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import {
  calculateMonthlyPriceCny,
  calculateRemainingValueCny,
  convertCnyToCurrency,
  convertNodePriceToCny,
  DEFAULT_EXCHANGE_RATES,
  getCurrencySymbol,
  isLongTermNode,
} from '@/utils/finance'
import { formatBytesWithConfig } from '@/utils/helper'
import { formatPriceWithCycle } from '@/utils/tagHelper'

type SortMode = 'weight_asc' | 'weight_desc' | 'price_asc' | 'price_desc'

interface FinanceListItem {
  node: NodeData
  remainingValue: number
  note: string
  muted: boolean
}

const SUPPORTED_CURRENCIES: SupportedCurrency[] = ['CNY', 'USD', 'HKD', 'EUR', 'GBP', 'JPY']
const SORT_MODES: SortMode[] = ['weight_asc', 'weight_desc', 'price_asc', 'price_desc']

const appStore = useAppStore()
const nodesStore = useNodesStore()
const themeVars = useThemeVars()

const mounted = ref(false)
const tradeModalVisible = ref(false)
const selectedNodeId = ref<string | null>(null)
const tradeDate = ref('')
const tradeAmount = ref('')
const exchangeRates = ref<Record<SupportedCurrency, number>>({ ...DEFAULT_EXCHANGE_RATES })
const exchangeRateNote = ref('使用默认汇率')
const nowTick = ref(Date.now())

const selectedCurrency = useStorage<SupportedCurrency>('komari-theme-naive.finance.currency', appStore.financeDefaultCurrency)
const sortMode = useStorage<SortMode>('komari-theme-naive.finance.sort', 'weight_asc')
const excludeFree = useStorage<boolean>('komari-theme-naive.finance.excludeFree', true)

let nowTimer: ReturnType<typeof setInterval> | null = null

const panelVisible = computed({
  get: () => appStore.financePanelVisible,
  set: value => value ? appStore.openFinancePanel() : appStore.closeFinancePanel(),
})

const surfaceStyle = computed<CSSProperties>(() => ({
  '--finance-bg': appStore.isDark ? 'rgba(24, 24, 28, 0.88)' : 'rgba(255, 255, 255, 0.86)',
  '--finance-soft-bg': appStore.isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(148, 163, 184, 0.08)',
  '--finance-border': appStore.isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(15, 23, 42, 0.08)',
  '--finance-shadow': appStore.isDark
    ? '0 18px 44px rgba(0, 0, 0, 0.38)'
    : '0 18px 44px rgba(15, 23, 42, 0.14)',
  '--finance-text': themeVars.value.textColor2,
  '--finance-muted': themeVars.value.textColor3,
  '--finance-accent': themeVars.value.primaryColor,
  '--finance-success': themeVars.value.successColor,
  '--finance-error': themeVars.value.errorColor,
  '--finance-number-font': appStore.numberFontFamily,
}))

const currencyOptions = computed(() => SUPPORTED_CURRENCIES.map(currency => ({
  label: `${currency} (${getCurrencySymbol(currency)})`,
  value: currency,
})))

const sortOptions = computed(() => [
  { label: '权重 正序', value: 'weight_asc' },
  { label: '权重 倒序', value: 'weight_desc' },
  { label: '价格 正序', value: 'price_asc' },
  { label: '价格 倒序', value: 'price_desc' },
])

const selectedNode = computed(() => {
  if (!selectedNodeId.value)
    return null
  return nodesStore.nodes.find(node => node.uuid === selectedNodeId.value) ?? null
})

const currencyRateItems = computed(() => {
  return SUPPORTED_CURRENCIES
    .filter(currency => currency !== selectedCurrency.value)
    .map((currency) => {
      const rate = exchangeRates.value[selectedCurrency.value] / exchangeRates.value[currency]
      return {
        label: `1 ${currency}`,
        value: `${getCurrencySymbol(selectedCurrency.value)} ${rate.toFixed(6)}`,
      }
    })
})

const financeData = computed(() => {
  const now = new Date(nowTick.value)
  const sortedNodes = [...nodesStore.nodes].sort((a, b) => {
    const priceA = convertNodePriceToCny(Math.max(a.price, 0), a.currency, exchangeRates.value)
    const priceB = convertNodePriceToCny(Math.max(b.price, 0), b.currency, exchangeRates.value)

    switch (sortMode.value) {
      case 'weight_desc':
        return b.weight - a.weight
      case 'price_asc':
        return priceA - priceB
      case 'price_desc':
        return priceB - priceA
      case 'weight_asc':
      default:
        return a.weight - b.weight
    }
  })

  let totalPriceCny = 0
  let monthlyPriceCny = 0
  let remainingValueCny = 0

  const items: FinanceListItem[] = sortedNodes.map((node) => {
    const whitePiao = typeof node.tags === 'string' && node.tags.includes('白嫖中')
    const specialFree = node.price === -1
    const longTerm = isLongTermNode(node.expired_at, now)
    const muted = excludeFree.value && whitePiao

    const priceCny = convertNodePriceToCny(Math.max(node.price, 0), node.currency, exchangeRates.value)
    const monthlyCny = calculateMonthlyPriceCny(node, exchangeRates.value)
    const nodeRemainingCny = calculateRemainingValueCny(node, exchangeRates.value, now)

    if (!muted) {
      totalPriceCny += priceCny
      monthlyPriceCny += monthlyCny
      remainingValueCny += nodeRemainingCny
    }

    let note = ''
    if (specialFree) {
      note = '免费机器按 0 计入'
    }
    else if (longTerm) {
      note = '长期机器按原价折算'
    }
    else if (whitePiao) {
      note = muted ? '白嫖节点已排除' : '白嫖节点已计入'
    }

    return {
      node,
      remainingValue: convertCnyToCurrency(nodeRemainingCny, selectedCurrency.value, exchangeRates.value),
      note,
      muted,
    }
  })

  return {
    totalCount: nodesStore.nodes.length,
    totalPrice: convertCnyToCurrency(totalPriceCny, selectedCurrency.value, exchangeRates.value),
    monthlyPrice: convertCnyToCurrency(monthlyPriceCny, selectedCurrency.value, exchangeRates.value),
    annualPrice: convertCnyToCurrency(monthlyPriceCny * 12, selectedCurrency.value, exchangeRates.value),
    remainingValue: convertCnyToCurrency(remainingValueCny, selectedCurrency.value, exchangeRates.value),
    items,
  }
})

const tradeDatePoint = computed(() => {
  if (!tradeDate.value)
    return new Date(nowTick.value)

  const [year, month, day] = tradeDate.value.split('-').map(Number)
  if (!year || !month || !day)
    return new Date(nowTick.value)

  return new Date(year, month - 1, day, 12, 0, 0)
})

const tradeAmountValue = computed<number | null>(() => {
  if (!tradeAmount.value.trim())
    return null

  const amount = Number(tradeAmount.value)
  if (!Number.isFinite(amount) || amount < 0)
    return null

  return amount
})

const tradeRemainingValue = computed(() => {
  if (!selectedNode.value)
    return 0

  const remainCny = calculateRemainingValueCny(selectedNode.value, exchangeRates.value, tradeDatePoint.value)
  return convertCnyToCurrency(remainCny, selectedCurrency.value, exchangeRates.value)
})

const tradePremiumValue = computed<number | null>(() => {
  if (tradeAmountValue.value === null)
    return null

  return tradeAmountValue.value - tradeRemainingValue.value
})

const tradePremiumRate = computed<number | null>(() => {
  if (tradeAmountValue.value === null || tradeRemainingValue.value <= 0)
    return null

  return (tradePremiumValue.value! / tradeRemainingValue.value) * 100
})

function isSupportedCurrency(value: string): value is SupportedCurrency {
  return SUPPORTED_CURRENCIES.includes(value as SupportedCurrency)
}

function isSortMode(value: string): value is SortMode {
  return SORT_MODES.includes(value as SortMode)
}

function formatDateInput(date: Date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatCurrency(amount: number) {
  return `${getCurrencySymbol(selectedCurrency.value)} ${amount.toFixed(2)}`
}

function formatTraffic(node: NodeData) {
  if (node.traffic_limit > 0)
    return `${formatBytesWithConfig(node.traffic_limit, appStore.byteDecimals)}/月`
  return '无限制'
}

function formatExpiredDate(value: string) {
  if (!value)
    return '-'

  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return '-'

  return date.toLocaleDateString(appStore.lang === 'zh-CN' ? 'zh-CN' : 'en-US')
}

function getHelpText() {
  return '按剩余账期折算；超过 100 年的长期机器按原价处理；可通过右下角开关排除“白嫖中”节点。'
}

async function fetchJsonWithTimeout(url: string, timeout = 5000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok)
      throw new Error(`HTTP ${response.status}`)
    return await response.json()
  }
  finally {
    clearTimeout(timer)
  }
}

async function refreshExchangeRates() {
  const urls = [
    'https://open.er-api.com/v6/latest/CNY',
    'https://api.exchangerate-api.com/v4/latest/CNY',
  ]

  for (const url of urls) {
    try {
      const data = await fetchJsonWithTimeout(url)
      if (data?.rates) {
        exchangeRates.value = {
          CNY: 1,
          USD: data.rates.USD ?? DEFAULT_EXCHANGE_RATES.USD,
          HKD: data.rates.HKD ?? DEFAULT_EXCHANGE_RATES.HKD,
          EUR: data.rates.EUR ?? DEFAULT_EXCHANGE_RATES.EUR,
          GBP: data.rates.GBP ?? DEFAULT_EXCHANGE_RATES.GBP,
          JPY: data.rates.JPY ?? DEFAULT_EXCHANGE_RATES.JPY,
        }
        exchangeRateNote.value = `汇率更新 ${new Date().toLocaleTimeString()}`
        return
      }
    }
    catch (error) {
      console.warn('[FinanceWidget] Failed to fetch exchange rates:', error)
    }
  }

  exchangeRateNote.value = '使用默认汇率'
}

function closePanel() {
  appStore.closeFinancePanel()
}

function openTradeModal(nodeId: string) {
  selectedNodeId.value = nodeId
  tradeDate.value = formatDateInput(new Date())
  tradeAmount.value = ''
  tradeModalVisible.value = true
}

function closeTradeModal() {
  tradeModalVisible.value = false
}

watch(selectedCurrency, (value) => {
  if (!isSupportedCurrency(value))
    selectedCurrency.value = appStore.financeDefaultCurrency
}, { immediate: true })

watch(sortMode, (value) => {
  if (!isSortMode(value))
    sortMode.value = 'weight_asc'
}, { immediate: true })

watch(selectedNode, (value) => {
  if (!value)
    tradeModalVisible.value = false
})

onMounted(() => {
  mounted.value = true
  refreshExchangeRates()
  nowTimer = setInterval(() => {
    nowTick.value = Date.now()
  }, 60000)
})

onBeforeUnmount(() => {
  if (nowTimer)
    clearInterval(nowTimer)
})
</script>

<template>
  <Transition name="finance-panel">
    <aside v-if="mounted && panelVisible" class="finance-widget" :style="surfaceStyle">
      <div class="finance-widget__header">
        <div class="finance-widget__title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
            <path d="M12 18V6" />
          </svg>
          <span>资产统计</span>
        </div>
        <button type="button" class="finance-widget__close" aria-label="Close finance widget" @click="closePanel">
          <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854Z" />
          </svg>
        </button>
      </div>

      <div class="finance-widget__body">
        <div class="finance-widget__summary">
          <div class="finance-widget__row">
            <span class="finance-widget__row-label">服务器数量</span>
            <span class="finance-widget__row-value finance-widget__number">{{ financeData.totalCount }}</span>
          </div>
          <div class="finance-widget__row">
            <span class="finance-widget__row-label">总价值</span>
            <span class="finance-widget__row-value finance-widget__number">{{ formatCurrency(financeData.totalPrice) }}</span>
          </div>
          <div class="finance-widget__row">
            <span class="finance-widget__row-label">月均支出</span>
            <span class="finance-widget__row-value finance-widget__number">{{ formatCurrency(financeData.monthlyPrice) }}</span>
          </div>
          <div class="finance-widget__row">
            <span class="finance-widget__row-label">年均支出</span>
            <span class="finance-widget__row-value finance-widget__number">{{ formatCurrency(financeData.annualPrice) }}</span>
          </div>
          <div class="finance-widget__row">
            <span class="finance-widget__row-label">剩余总价值</span>
            <span class="finance-widget__row-value-group">
              <span class="finance-widget__row-value finance-widget__number">{{ formatCurrency(financeData.remainingValue) }}</span>
              <NTooltip trigger="hover">
                <template #trigger>
                  <button type="button" class="finance-widget__help" aria-label="Remaining value help">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                      <path d="M12 17h.01" />
                    </svg>
                  </button>
                </template>
                {{ getHelpText() }}
              </NTooltip>
            </span>
          </div>
        </div>

        <div class="finance-widget__divider" />

        <div v-if="financeData.items.length" class="finance-widget__list">
          <button
            v-for="item in financeData.items"
            :key="item.node.uuid"
            type="button"
            class="finance-widget__list-item"
            :class="{ 'finance-widget__list-item--muted': item.muted }"
            @click="openTradeModal(item.node.uuid)"
          >
            <span class="finance-widget__list-name" :title="item.node.name">{{ item.node.name }}</span>
            <span class="finance-widget__list-right">
              <span class="finance-widget__list-value finance-widget__number">{{ formatCurrency(item.remainingValue) }}</span>
              <NTooltip v-if="item.note" trigger="hover">
                <template #trigger>
                  <span class="finance-widget__list-help" @click.stop>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                      <path d="M12 17h.01" />
                    </svg>
                  </span>
                </template>
                {{ item.note }}
              </NTooltip>
            </span>
          </button>
        </div>
        <div v-else class="finance-widget__empty">
          暂无可统计节点
        </div>

        <div class="finance-widget__rate-note">
          {{ exchangeRateNote }}
        </div>

        <div class="finance-widget__divider" />

        <div class="finance-widget__rates">
          <div v-for="item in currencyRateItems" :key="item.label" class="finance-widget__rate-item">
            <span>{{ item.label }}</span>
            <span class="finance-widget__rate-value finance-widget__number">{{ item.value }}</span>
          </div>
        </div>

        <div class="finance-widget__controls">
          <div class="finance-widget__selects">
            <NSelect
              v-model:value="selectedCurrency"
              size="small"
              :options="currencyOptions"
              class="finance-widget__select finance-widget__select--currency"
            />
            <NSelect
              v-model:value="sortMode"
              size="small"
              :options="sortOptions"
              :consistent-menu-width="false"
              class="finance-widget__select finance-widget__select--sort"
            />
          </div>
          <div class="finance-widget__actions">
            <NTooltip trigger="hover">
              <template #trigger>
                <button type="button" class="finance-widget__action-btn" :class="{ 'finance-widget__action-btn--active': excludeFree }" aria-label="Toggle white-piao nodes" @click="excludeFree = !excludeFree">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M19 5c-1.5 0-2.8 0.6-3.8 1.6l-1.2 1.2-1.2-1.2C11.8 5.6 10.5 5 9 5 5.5 5 3 7.6 3 11c0 3.5 3 7.6 9 13 6-5.4 9-9.5 9-13 0-3.4-2.5-6-6-6z" />
                  </svg>
                </button>
              </template>
              {{ excludeFree ? '当前：已排除白嫖' : '当前：包含白嫖' }}
            </NTooltip>

            <NTooltip trigger="hover">
              <template #trigger>
                <button type="button" class="finance-widget__action-btn" aria-label="Refresh exchange rates" @click="refreshExchangeRates">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M21.5 2v6h-6" />
                    <path d="M21.34 15.57a10 10 0 1 1-.57-8.38" />
                  </svg>
                </button>
              </template>
              刷新汇率
            </NTooltip>
          </div>
        </div>
      </div>
    </aside>
  </Transition>

  <NModal v-model:show="tradeModalVisible" :mask-closable="false" :trap-focus="true" :auto-focus="false">
    <div v-if="selectedNode" class="finance-trade-modal" :style="surfaceStyle">
      <div class="finance-trade-modal__header">
        <div class="finance-trade-modal__title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 2v20" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
          <span>服务器交易</span>
        </div>
        <button type="button" class="finance-trade-modal__close" aria-label="Close trade modal" @click="closeTradeModal">
          <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854Z" />
          </svg>
        </button>
      </div>

      <div class="finance-trade-modal__body">
        <section class="finance-trade-modal__section">
          <div class="finance-trade-modal__section-title">
            服务器信息
          </div>
          <div class="finance-trade-modal__grid">
            <div class="finance-trade-modal__info">
              <span class="finance-trade-modal__label">名称</span>
              <span class="finance-trade-modal__value">{{ selectedNode.name }}</span>
            </div>
            <div class="finance-trade-modal__info">
              <span class="finance-trade-modal__label">CPU</span>
              <span class="finance-trade-modal__value">{{ selectedNode.cpu_name || '未知' }}</span>
            </div>
            <div class="finance-trade-modal__info">
              <span class="finance-trade-modal__label">核心数</span>
              <span class="finance-trade-modal__value finance-widget__number">{{ selectedNode.cpu_cores ? `${selectedNode.cpu_cores} 核` : '未知' }}</span>
            </div>
            <div class="finance-trade-modal__info">
              <span class="finance-trade-modal__label">内存</span>
              <span class="finance-trade-modal__value finance-widget__number">{{ selectedNode.mem_total ? formatBytesWithConfig(selectedNode.mem_total, appStore.byteDecimals) : '未知' }}</span>
            </div>
            <div class="finance-trade-modal__info">
              <span class="finance-trade-modal__label">硬盘</span>
              <span class="finance-trade-modal__value finance-widget__number">{{ selectedNode.disk_total ? formatBytesWithConfig(selectedNode.disk_total, appStore.byteDecimals) : '未知' }}</span>
            </div>
            <div class="finance-trade-modal__info">
              <span class="finance-trade-modal__label">流量</span>
              <span class="finance-trade-modal__value finance-widget__number">{{ formatTraffic(selectedNode) }}</span>
            </div>
            <div class="finance-trade-modal__info">
              <span class="finance-trade-modal__label">原价</span>
              <span class="finance-trade-modal__value finance-widget__number">{{ formatPriceWithCycle(selectedNode.price, selectedNode.billing_cycle, selectedNode.currency, appStore.lang) }}</span>
            </div>
            <div class="finance-trade-modal__info">
              <span class="finance-trade-modal__label">到期时间</span>
              <span class="finance-trade-modal__value finance-widget__number">{{ formatExpiredDate(selectedNode.expired_at) }}</span>
            </div>
          </div>
        </section>

        <section class="finance-trade-modal__section">
          <div class="finance-trade-modal__section-title">
            交易计算
          </div>
          <div class="finance-trade-modal__form">
            <label class="finance-trade-modal__field">
              <span class="finance-trade-modal__field-label">交易日期</span>
              <input v-model="tradeDate" type="date" class="finance-trade-modal__input">
            </label>
            <label class="finance-trade-modal__field">
              <span class="finance-trade-modal__field-label">交易金额</span>
              <input v-model="tradeAmount" type="number" min="0" step="0.01" placeholder="请输入交易金额" class="finance-trade-modal__input">
            </label>
          </div>

          <div class="finance-trade-modal__result">
            <div class="finance-trade-modal__result-row">
              <span>剩余价值</span>
              <span class="finance-trade-modal__result-value finance-widget__number">{{ formatCurrency(tradeRemainingValue) }}</span>
            </div>
            <div class="finance-trade-modal__result-row">
              <span>溢价金额</span>
              <span class="finance-trade-modal__result-value finance-widget__number" :class="{ 'finance-trade-modal__result-value--positive': tradePremiumValue !== null && tradePremiumValue <= 0, 'finance-trade-modal__result-value--negative': tradePremiumValue !== null && tradePremiumValue > 0 }">
                {{ tradePremiumValue === null ? '-' : formatCurrency(tradePremiumValue) }}
              </span>
            </div>
            <div class="finance-trade-modal__result-row">
              <span>溢价率</span>
              <span class="finance-trade-modal__result-value finance-widget__number" :class="{ 'finance-trade-modal__result-value--positive': tradePremiumValue !== null && tradePremiumValue <= 0, 'finance-trade-modal__result-value--negative': tradePremiumValue !== null && tradePremiumValue > 0 }">
                {{ tradePremiumRate === null ? '-' : `${tradePremiumRate > 0 ? '+' : ''}${tradePremiumRate.toFixed(2)}%` }}
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  </NModal>
</template>

<style scoped lang="scss">
.finance-widget__number {
  font-family: var(--finance-number-font);
}

.finance-widget {
  position: fixed;
  top: 5rem;
  right: 1.25rem;
  z-index: 1079;
  max-height: min(calc(100vh - 6rem), 46rem);
  width: 19rem;
  max-width: calc(100vw - 2rem);
  border: 1px solid var(--finance-border);
  border-radius: 1rem;
  background: var(--finance-bg);
  color: var(--finance-text);
  box-shadow: var(--finance-shadow);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.finance-widget__header,
.finance-trade-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.85rem 1rem;
  border-bottom: 1px solid var(--finance-border);
}

.finance-widget__title,
.finance-trade-modal__title,
.finance-trade-modal__section-title {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 700;
}

.finance-widget__title svg,
.finance-trade-modal__title svg,
.finance-trade-modal__section-title::before {
  color: var(--finance-accent);
}

.finance-widget__title svg,
.finance-trade-modal__title svg {
  width: 1rem;
  height: 1rem;
}

.finance-widget__close,
.finance-trade-modal__close {
  width: 1.75rem;
  height: 1.75rem;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--finance-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition:
    transform 0.2s ease,
    color 0.2s ease,
    background-color 0.2s ease;
}

.finance-widget__close:hover,
.finance-trade-modal__close:hover {
  color: var(--finance-accent);
  background: var(--finance-soft-bg);
  transform: rotate(90deg);
}

.finance-widget__close svg,
.finance-trade-modal__close svg {
  width: 0.8rem;
  height: 0.8rem;
}

.finance-widget__body {
  min-height: 0;
  flex: 1;
  padding: 0.95rem 1rem 1rem;
  overflow-y: auto;
}

.finance-widget__summary,
.finance-widget__rates {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.finance-widget__row,
.finance-widget__rate-item,
.finance-trade-modal__result-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.finance-widget__row-label,
.finance-widget__rate-item span:first-child,
.finance-trade-modal__label,
.finance-trade-modal__field-label {
  color: var(--finance-muted);
  font-size: 0.8125rem;
}

.finance-widget__row-value,
.finance-widget__rate-value {
  font-weight: 700;
}

.finance-widget__row-value-group {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.finance-widget__help,
.finance-widget__list-help {
  width: 1rem;
  height: 1rem;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--finance-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: help;
}

.finance-widget__help svg,
.finance-widget__list-help svg {
  width: 0.9rem;
  height: 0.9rem;
}

.finance-widget__divider {
  height: 1px;
  margin: 0.8rem 0;
  background: var(--finance-border);
}

.finance-widget__list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.finance-widget__list-item {
  width: 100%;
  padding: 0.45rem 0.55rem;
  border: 1px solid transparent;
  border-radius: 0.75rem;
  background: transparent;
  color: inherit;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease,
    transform 0.2s ease;
}

.finance-widget__list-item:hover {
  border-color: color-mix(in srgb, var(--finance-accent) 22%, var(--finance-border));
  background: var(--finance-soft-bg);
  transform: translateY(-1px);
}

.finance-widget__list-item--muted {
  opacity: 0.62;
}

.finance-widget__list-name {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
  font-size: 0.8125rem;
}

.finance-widget__list-right {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}

.finance-widget__list-value {
  font-size: 0.78rem;
  font-weight: 700;
}

.finance-widget__empty,
.finance-widget__rate-note {
  color: var(--finance-muted);
  font-size: 0.75rem;
}

.finance-widget__rate-note {
  text-align: right;
  margin-top: 0.35rem;
}

.finance-widget__controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.finance-widget__selects {
  min-width: 0;
  flex: 1;
  display: flex;
  gap: 0.5rem;
}

:deep(.finance-widget__select) {
  min-width: 0;
}

:deep(.finance-widget__select--currency) {
  flex: 0 1 auto;
  max-width: 5.5rem;
}

:deep(.finance-widget__select--sort) {
  flex: 1 1 auto;
  min-width: 7rem;
}

:deep(.finance-widget__select .n-base-selection) {
  border-color: var(--finance-border) !important;
  border-radius: 999px !important;
  background: var(--finance-soft-bg) !important;
  box-shadow: none !important;
  --n-height: 2rem !important;
}

:deep(.finance-widget__select .n-base-selection-label) {
  color: var(--finance-text) !important;
  font-size: 0.75rem;
}

:deep(.finance-widget__select .n-base-selection-placeholder) {
  color: var(--finance-muted) !important;
}

.finance-widget__actions {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.finance-widget__action-btn {
  width: 2rem;
  height: 2rem;
  padding: 0;
  border: 1px solid var(--finance-border);
  border-radius: 999px;
  background: transparent;
  color: var(--finance-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    color 0.2s ease,
    background-color 0.2s ease,
    transform 0.2s ease;
}

.finance-widget__action-btn:hover,
.finance-widget__action-btn--active {
  color: var(--finance-accent);
  border-color: color-mix(in srgb, var(--finance-accent) 28%, var(--finance-border));
  background: var(--finance-soft-bg);
}

.finance-widget__action-btn:hover {
  transform: translateY(-1px);
}

.finance-widget__action-btn svg {
  width: 0.95rem;
  height: 0.95rem;
}

.finance-trade-modal {
  width: min(92vw, 48rem);
  max-height: 88vh;
  margin: 3rem auto;
  border: 1px solid var(--finance-border);
  border-radius: 1rem;
  background: var(--finance-bg);
  color: var(--finance-text);
  box-shadow: var(--finance-shadow);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  overflow: hidden;
}

.finance-trade-modal__body {
  max-height: calc(88vh - 4rem);
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.finance-trade-modal__section {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.finance-trade-modal__section-title {
  font-size: 0.95rem;
}

.finance-trade-modal__section-title::before {
  content: '';
  width: 0.3rem;
  height: 0.3rem;
  border-radius: 999px;
  background: currentColor;
}

.finance-trade-modal__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem 1.25rem;
}

.finance-trade-modal__info {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.finance-trade-modal__value {
  line-height: 1.5;
  word-break: break-word;
}

.finance-trade-modal__form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}

.finance-trade-modal__field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.finance-trade-modal__input {
  width: 100%;
  min-width: 0;
  height: 2.4rem;
  padding: 0 0.8rem;
  border: 1px solid var(--finance-border);
  border-radius: 0.75rem;
  background: var(--finance-soft-bg);
  color: var(--finance-text);
  outline: none;
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease;
}

.finance-trade-modal__input:focus {
  border-color: color-mix(in srgb, var(--finance-accent) 35%, var(--finance-border));
}

.finance-trade-modal__result {
  border: 1px solid var(--finance-border);
  border-radius: 0.9rem;
  background: var(--finance-soft-bg);
  padding: 0.85rem 0.95rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.finance-trade-modal__result-value {
  font-weight: 700;
}

.finance-trade-modal__result-value--positive {
  color: var(--finance-success);
}

.finance-trade-modal__result-value--negative {
  color: var(--finance-error);
}

.finance-panel-enter-active,
.finance-panel-leave-active {
  transition:
    opacity 0.28s ease,
    transform 0.28s ease;
}

.finance-panel-enter-from,
.finance-panel-leave-to {
  opacity: 0;
  transform: translateY(-0.8rem);
}

@media (max-width: 768px) {
  .finance-widget {
    top: 4.5rem;
    right: 0.875rem;
  }

  .finance-widget {
    max-height: calc(100vh - 5.25rem);
    width: min(22rem, calc(100vw - 1.75rem));
  }

  .finance-widget__controls {
    flex-direction: column;
    align-items: stretch;
  }

  .finance-widget__selects {
    grid-template-columns: 1fr;
  }

  :deep(.finance-widget__select--sort) {
    min-width: 0;
  }

  .finance-widget__actions {
    justify-content: flex-end;
  }
}

@media (max-width: 640px) {
  .finance-widget {
    left: 0.875rem;
    right: 0.875rem;
    top: 4.25rem;
    max-height: calc(100vh - 5rem);
    width: auto;
    max-width: none;
  }

  .finance-widget__body {
    padding: 0.9rem;
  }

  .finance-trade-modal {
    width: min(95vw, 32rem);
    margin: 2rem auto;
  }

  .finance-trade-modal__grid,
  .finance-trade-modal__form {
    grid-template-columns: 1fr;
  }
}
</style>
