<script setup lang="ts">
import { useNow } from '@vueuse/core'
import { NCard, NText } from 'naive-ui'
import { computed } from 'vue'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import { formatBytesPerSecondSplit, formatBytesSplit } from '@/utils/helper'

const appStore = useAppStore()
const nodesStore = useNodesStore()

// 使用 VueUse 的 useNow 自动管理定时器，每秒更新
const now = useNow({ interval: 1000 })
const dateLocale = computed(() => appStore.lang === 'en-US' ? 'en-US' : 'zh-CN')
const currentDate = computed(() =>
  now.value.toLocaleDateString(dateLocale.value, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }),
)
const currentClock = computed(() =>
  now.value.toLocaleTimeString(dateLocale.value, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }),
)

/** 计算所有在线节点的实时速率总和 */
const totalSpeed = computed(() => {
  const onlineNodes = nodesStore.nodes.filter(node => node.online)
  const up = onlineNodes.reduce((sum, node) => sum + (node.net_out || 0), 0)
  const down = onlineNodes.reduce((sum, node) => sum + (node.net_in || 0), 0)
  return { up, down }
})

/** 计算所有节点的累积流量总和 */
const totalTraffic = computed(() => {
  const up = nodesStore.nodes.reduce((sum, node) => sum + (node.net_total_up || 0), 0)
  const down = nodesStore.nodes.reduce((sum, node) => sum + (node.net_total_down || 0), 0)
  return { up, down }
})

/** 在线区域数量 */
const onlineRegionCount = computed(() => {
  return new Set(
    nodesStore.nodes
      .filter(node => node.online && node.region !== '')
      .map(node => node.region),
  ).size
})

/** 在线节点数量 */
const onlineNodeCount = computed(() => nodesStore.nodes.filter(node => node.online).length)

// 格式化流量（使用配置，返回分离的数值和单位）
const formattedTrafficUp = computed(() => formatBytesSplit(totalTraffic.value.up, appStore.byteDecimals))
const formattedTrafficDown = computed(() => formatBytesSplit(totalTraffic.value.down, appStore.byteDecimals))

// 格式化速率（使用配置，返回分离的数值和单位）
const formattedSpeedUp = computed(() => formatBytesPerSecondSplit(totalSpeed.value.up, appStore.byteDecimals))
const formattedSpeedDown = computed(() => formatBytesPerSecondSplit(totalSpeed.value.down, appStore.byteDecimals))

// 是否启用背景模糊
const hasBackgroundBlur = computed(() => {
  return appStore.backgroundEnabled && appStore.cardBlurRadius > 0
})

// 计算卡片模糊半径类
const cardBlurClass = computed(() => {
  if (!hasBackgroundBlur.value)
    return ''
  const radius = appStore.cardBlurRadius
  if (radius <= 8)
    return 'glass-8'
  if (radius <= 12)
    return 'glass-12'
  if (radius <= 16)
    return 'glass-16'
  if (radius <= 20)
    return 'glass-20'
  return `glass-${radius}`
})
</script>

<template>
  <div class="general-info p-4" :class="{ 'light-general-contrast': appStore.lightCardContrast && !appStore.isDark }">
    <!-- 当前时间（移动端隐藏） -->
    <NCard hoverable class="general-card general-card--time sm:min-h-32" :class="[{ 'glass-card-enabled': hasBackgroundBlur }, cardBlurClass]" content-class="h-full">
      <div class="general-card__content general-card__content--split" :style="{ fontFamily: appStore.numberFontFamily }">
        <div class="general-card__time-block">
          <NText class="general-card__date">
            {{ currentDate }}
          </NText>
          <NText class="general-card__clock">
            {{ currentClock }}
          </NText>
        </div>
        <NText :depth="3" class="general-card__label">
          <div class="i-icon-park-outline-time" />
          当前时间
        </NText>
      </div>
    </NCard>

    <!-- 在线节点 -->
    <NCard hoverable class="general-card sm:min-h-32" :class="[{ 'glass-card-enabled': hasBackgroundBlur }, cardBlurClass]" content-class="h-full">
      <div class="general-card__content general-card__content--split" :style="{ fontFamily: appStore.numberFontFamily }">
        <div class="general-card__primary flex flex-wrap gap-x-1 gap-y-0.5 items-baseline justify-center">
          <NText class="text-inherit m-0">
            {{ onlineNodeCount }}
          </NText>
          <NText :depth="3" class="text-sm m-0 sm:text-base">
            /
          </NText>
          <NText :depth="3" class="text-sm m-0 sm:text-base">
            {{ nodesStore.nodes.length }}
          </NText>
        </div>
        <NText :depth="3" class="general-card__label">
          <div class="i-icon-park-outline-heartbeat" />
          在线节点
        </NText>
      </div>
    </NCard>

    <!-- 点亮区域 -->
    <NCard hoverable class="general-card sm:min-h-32" :class="[{ 'glass-card-enabled': hasBackgroundBlur }, cardBlurClass]" content-class="h-full">
      <div class="general-card__content general-card__content--split" :style="{ fontFamily: appStore.numberFontFamily }">
        <NText class="general-card__primary">
          {{ onlineRegionCount }}
        </NText>
        <NText :depth="3" class="general-card__label">
          <div class="i-icon-park-outline-world" />
          点亮区域
        </NText>
      </div>
    </NCard>

    <!-- 流量与速率 -->
    <NCard hoverable class="general-card general-card--combined sm:min-h-32" :class="[{ 'glass-card-enabled': hasBackgroundBlur }, cardBlurClass]" content-class="h-full">
      <div class="general-card__content general-card__content--combined" :style="{ fontFamily: appStore.numberFontFamily }">
        <div class="general-card__combined-sections">
          <section class="general-card__section">
            <div class="general-card__metric-list">
              <div class="general-card__metric-row">
                <div class="i-icon-park-outline-upload general-card__metric-icon" />
                <span class="general-card__metric-value">{{ formattedTrafficUp.value }}</span>
                <span class="general-card__metric-unit">{{ formattedTrafficUp.unit }}</span>
              </div>
              <div class="general-card__metric-row">
                <div class="i-icon-park-outline-download general-card__metric-icon" />
                <span class="general-card__metric-value">{{ formattedTrafficDown.value }}</span>
                <span class="general-card__metric-unit">{{ formattedTrafficDown.unit }}</span>
              </div>
            </div>
            <NText :depth="3" class="general-card__section-title">
              <div class="i-icon-park-outline-transfer-data" />
              流量总览
            </NText>
          </section>
          <section class="general-card__section">
            <div class="general-card__metric-list">
              <div class="general-card__metric-row">
                <div class="i-icon-park-outline-up general-card__metric-icon" />
                <span class="general-card__metric-value">{{ formattedSpeedUp.value }}</span>
                <span class="general-card__metric-unit">{{ formattedSpeedUp.unit }}</span>
              </div>
              <div class="general-card__metric-row">
                <div class="i-icon-park-outline-down general-card__metric-icon" />
                <span class="general-card__metric-value">{{ formattedSpeedDown.value }}</span>
                <span class="general-card__metric-unit">{{ formattedSpeedDown.unit }}</span>
              </div>
            </div>
            <NText :depth="3" class="general-card__section-title">
              <div class="i-icon-park-outline-lightning" />
              网络速率
            </NText>
          </section>
        </div>
      </div>
    </NCard>
  </div>
</template>

<style scoped lang="scss">
.general-info {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.5rem;
}

.light-general-contrast :deep(.n-card) {
  background-color: rgba(250, 250, 252, 1) !important;
  box-shadow: 0 2px 8px 0 rgba(0, 0, 0, 0.08);
  border-color: rgba(0, 0, 0, 0.12);
}

/* 毛玻璃卡片样式 */
.glass-card-enabled {
  background-color: rgba(255, 255, 255, 0.7) !important;

  &:hover {
    filter: brightness(0.95);
  }
}

html.dark .glass-card-enabled {
  background-color: rgba(24, 24, 28, 0.85) !important;

  &:hover {
    filter: brightness(1.1);
  }
}

.general-card {
  min-height: 6.5rem;
}

.general-card--combined {
  min-height: 8rem;
}

.general-info--desktop {
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.9fr) minmax(0, 0.9fr) minmax(0, 1.7fr);
  align-items: stretch;
}

.general-card__content {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.625rem;
  text-align: center;
}

.general-card__content--split {
  justify-content: center;
  width: 100%;
  padding-block: 0.5rem;
}

.general-card__content--combined {
  width: 100%;
}

.general-card__primary {
  margin: 0;
  font-size: 1.8rem;
  font-weight: 700;
  line-height: 1.25;
}

.general-card__content--split > .general-card__primary {
  margin-top: auto;
}

.general-card__content--split > .general-card__primary.flex {
  margin-top: auto;
}

.general-card__content--split > .general-card__label {
  margin-top: auto;
}

.general-card__time-block {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.general-card__date,
.general-card__clock {
  margin: 0;
  display: block;
}

.general-card__date {
  font-size: 1.1rem;
  font-weight: 700;
  line-height: 1.2;
  word-break: break-word;
  color: var(--n-text-color-2);
}

.general-card__clock {
  font-size: 1.45rem;
  font-weight: 700;
  line-height: 1.15;
  word-break: break-word;
}

.general-card__label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  margin: 0;
  text-align: center;
}

.general-card__metric-list {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.375rem;
  width: fit-content;
  max-width: 100%;
  margin-inline: auto;
}

.general-card__metric-row {
  display: grid;
  grid-template-columns: 1.125rem minmax(4ch, auto) minmax(3.5ch, auto);
  align-items: baseline;
  justify-content: center;
  column-gap: 0.35rem;
  width: 100%;
}

.general-card__metric-icon {
  flex-shrink: 0;
  align-self: center;
  width: 1rem;
  height: 1rem;
  font-size: 1rem;
  color: var(--n-text-color-2);
}

.general-card__metric-value {
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.2;
  min-width: 4ch;
  text-align: right;
}

.general-card__metric-unit {
  font-size: 0.75rem;
  color: var(--n-text-color-3);
  min-width: 3.5ch;
  text-align: left;
  white-space: nowrap;
}

.general-card__combined-sections {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: 100%;
}

.general-card__section {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.general-card__section:not(:last-child)::after {
  content: '';
  position: absolute;
  left: 10%;
  right: 10%;
  bottom: -0.4375rem;
  height: 1px;
  background: color-mix(in srgb, var(--n-border-color) 55%, transparent);
}

.general-card__section-title {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  margin: 0;
  text-align: center;
}

@media (max-width: 639px) {
  .general-card--time {
    display: none;
  }

  .general-card--combined .general-card__combined-sections {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
    align-items: start;
  }

  .general-card--combined .general-card__section:not(:last-child)::after {
    top: 12%;
    bottom: 12%;
    left: auto;
    right: -0.375rem;
    width: 1px;
    height: auto;
  }
}

@media (min-width: 400px) {
  .general-info {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .general-card--combined {
    grid-column: 1 / -1;
  }
}

@media (min-width: 640px) {
  .general-info {
    gap: 1rem;
  }

  .general-card__content {
    gap: 0.85rem;
  }

  .general-card__content--split {
    padding-block: 0.5rem;
  }

  .general-card__primary {
    font-size: 2rem;
  }

  .general-card__date {
    font-size: 1.25rem;
  }

  .general-card__clock {
    font-size: 1.8rem;
  }

  .general-card__metric-icon {
    width: 1.125rem;
    height: 1.125rem;
    font-size: 1.125rem;
  }

  .general-card__metric-value {
    font-size: 1.25rem;
  }

  .general-card__metric-row {
    grid-template-columns: 1.25rem minmax(4.5ch, auto) minmax(4ch, auto);
    column-gap: 0.45rem;
  }

  .general-card__metric-value {
    min-width: 4.5ch;
  }

  .general-card__metric-unit {
    min-width: 4ch;
  }
}

@media (min-width: 1024px) {
  .general-info {
    grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.9fr) minmax(0, 0.9fr) minmax(0, 1.7fr);
    align-items: stretch;
  }

  .general-card--combined {
    grid-column: auto;
  }

  .general-card--combined {
    min-height: 8.25rem;
  }

  .general-card__combined-sections {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
    align-items: start;
  }

  .general-card__section:not(:last-child)::after {
    top: 12%;
    bottom: 12%;
    left: auto;
    right: -0.5rem;
    width: 1px;
    height: auto;
  }
}

@media (min-width: 1280px) {
  .general-card {
    min-height: 6.75rem;
  }

  .general-card--combined {
    min-height: 8.5rem;
  }

  .general-info {
    grid-template-columns: minmax(0, 1fr) minmax(0, 0.88fr) minmax(0, 0.88fr) minmax(0, 1.85fr);
  }
}
</style>
