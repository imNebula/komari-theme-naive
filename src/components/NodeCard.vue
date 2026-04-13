<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import { NButton, NCard, NEllipsis, NIcon, NModal, NProgress, NTag, NText, NTooltip, useThemeVars } from 'naive-ui'
import { computed, ref } from 'vue'
import PingChart from '@/components/PingChart.vue'
import { useAppStore } from '@/stores/app'
import { formatBytesPerSecondWithConfig, formatBytesWithConfig, formatUptimeWithFormat, getStatus } from '@/utils/helper'
import { getOSImage, getOSName } from '@/utils/osImageHelper'
import { getRegionCode, getRegionDisplayName } from '@/utils/regionHelper'
import { formatPriceWithCycle, getDaysUntilExpired, getExpireStatus, getExpireStatusHexColor, parseTags } from '@/utils/tagHelper'

const props = defineProps<{
  node: NodeData
}>()

const emit = defineEmits<{
  click: []
}>()

const appStore = useAppStore()

// 获取 Naive UI 主题变量
const themeVars = useThemeVars()

// 延迟图表弹窗状态
const showPingChart = ref(false)

// 格式化函数
const formatBytes = (bytes: number) => formatBytesWithConfig(bytes, appStore.byteDecimals)
const formatBytesPerSecond = (bytes: number) => formatBytesPerSecondWithConfig(bytes, appStore.byteDecimals)
const formatUptime = (seconds: number) => formatUptimeWithFormat(seconds, 'hour')
const formatInlineUnit = (value: string) => value.replaceAll(' ', '\u00A0')
const formatBytesInline = (bytes: number) => formatInlineUnit(formatBytes(bytes))
const formatBytesPerSecondInline = (bytes: number) => formatInlineUnit(formatBytesPerSecond(bytes))

// 计算统计信息
const cpuStatus = computed(() => getStatus(props.node.cpu ?? 0))
const memPercentage = computed(() => (props.node.ram ?? 0) / (props.node.mem_total || 1) * 100)
const memStatus = computed(() => getStatus(memPercentage.value))
const diskPercentage = computed(() => (props.node.disk ?? 0) / (props.node.disk_total || 1) * 100)
const diskStatus = computed(() => getStatus(diskPercentage.value))

// 流量进度条相关计算
const showTrafficProgress = computed(() => props.node.traffic_limit > 0)

// 根据流量类型计算已用流量和百分比
const trafficUsedPercentage = computed(() => {
  if (props.node.traffic_limit <= 0)
    return 0

  const { net_total_up = 0, net_total_down = 0, traffic_limit_type } = props.node
  let used = 0

  switch (traffic_limit_type) {
    case 'up':
      used = net_total_up
      break
    case 'down':
      used = net_total_down
      break
    case 'min':
      used = Math.min(net_total_up, net_total_down)
      break
    case 'max':
      used = Math.max(net_total_up, net_total_down)
      break
    case 'sum':
    default:
      used = net_total_up + net_total_down
      break
  }

  return Math.min((used / props.node.traffic_limit) * 100, 100)
})

// 已用流量（用于显示）
const trafficUsed = computed(() => {
  const { net_total_up = 0, net_total_down = 0, traffic_limit_type } = props.node
  switch (traffic_limit_type) {
    case 'up':
      return net_total_up
    case 'down':
      return net_total_down
    case 'min':
      return Math.min(net_total_up, net_total_down)
    case 'max':
      return Math.max(net_total_up, net_total_down)
    case 'sum':
    default:
      return net_total_up + net_total_down
  }
})

// 计算节点的价格相关标签（剩余天数 + 价格）
const priceTags = computed(() => {
  const tags: Array<{ text: string, color: string }> = []
  const lang = appStore.lang
  const node = props.node

  // price > 0 时显示
  if (node.price !== 0) {
    // 剩余天数标签
    const days = getDaysUntilExpired(node.expired_at)
    const status = getExpireStatus(node.expired_at)
    const color = getExpireStatusHexColor(status)

    if (status === 'expired') {
      tags.push({ text: lang === 'zh-CN' ? '已过期' : 'Expired', color })
    }
    else if (status === 'long_term') {
      tags.push({ text: lang === 'zh-CN' ? '长期' : 'Long-term', color })
    }
    else {
      tags.push({ text: lang === 'zh-CN' ? `${days} 天` : `${days} days`, color })
    }

    // 价格标签
    const priceText = formatPriceWithCycle(node.price, node.billing_cycle, node.currency, lang)
    tags.push({ text: priceText, color: themeVars.value.infoColor }) // purple
  }

  return tags
})

// 计算节点的自定义标签
const customTags = computed(() => {
  return parseTags(props.node.tags).map(tag => ({ text: tag.text, color: tag.hex }))
})

// 计算合并后的标签（自定义标签 + 价格标签）
const mergedTags = computed(() => {
  return [...customTags.value, ...priceTags.value]
})

// 是否在单独一行显示标签
const shouldShowTagsInSeparateRow = computed(() => {
  return appStore.tagsInSeparateRow && mergedTags.value.length > 0
})

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
  <div>
    <NCard
      hoverable
      class="node-card w-full cursor-pointer transition-all duration-200 hover:border-primary" :class="[
        { 'light-card-contrast': appStore.lightCardContrast && !appStore.isDark },
        { 'glass-card-enabled': hasBackgroundBlur },
        cardBlurClass,
      ]"
      @click="emit('click')"
    >
      <template #header>
        <div class="flex gap-2 min-w-0 items-center">
          <NIcon class="node-card__flag shrink-0">
            <img class="node-card__flag-image" :src="`/images/flags/${getRegionCode(props.node.region)}.svg`" :alt="getRegionDisplayName(props.node.region)">
          </NIcon>
          <!-- 自定义标签显示在节点名前（仅当 tagsInSeparateRow 为 false 时） -->
          <div v-if="customTags.length > 0 && !appStore.tagsInSeparateRow" class="has-tags flex shrink-0 flex-wrap gap-1 items-center">
            <NTag
              v-for="(tag, index) in customTags"
              :key="index"
              size="small"
              :color="{ color: `${tag.color}20`, textColor: tag.color, borderColor: `${tag.color}40` }"
            >
              {{ tag.text }}
            </NTag>
          </div>
          <div class="node-card__title-wrap flex flex-1 flex-wrap gap-2 min-w-0 items-center">
            <NEllipsis class="text-lg font-bold m-0 flex-1 min-w-0">
              {{ props.node.name }}
            </NEllipsis>
          </div>
        </div>
      </template>
      <template #header-extra>
        <div class="flex gap-2 items-center">
          <NTooltip v-if="appStore.showPingChartButton">
            <template #trigger>
              <NButton
                quaternary
                circle
                size="small"
                class="p-1.5!"
                @click.stop="showPingChart = true"
              >
                <template #icon>
                  <div class="i-icon-park-outline-area-map text-base" />
                </template>
              </NButton>
            </template>
            查看延迟图表
          </NTooltip>
          <div class="node-card__status-group flex gap-2 items-center">
            <div
              class="online-badge"
              :style="{ backgroundColor: props.node.online ? themeVars.successColor : themeVars.errorColor, color: props.node.online ? themeVars.successColor : themeVars.errorColor }"
            >
              <div class="online-badge__wave" :style="{ backgroundColor: props.node.online ? themeVars.successColor : themeVars.errorColor }" />
            </div>
          </div>
        </div>
      </template>
      <template #default>
        <div class="flex flex-col gap-4">
          <!-- 操作系统 -->
          <div class="flex-between">
            <NText :depth="3" class="text-[13px]">
              操作系统
            </NText>
            <div class="flex gap-2 items-center">
              <NIcon class="node-card__os-icon">
                <img class="node-card__os-image" :src="getOSImage(props.node.os)" :alt="getOSName(props.node.os)">
              </NIcon>
              <NText class="text-[13px]">
                {{ getOSName(props.node.os) }} / {{ props.node.arch }}
              </NText>
            </div>
          </div>

          <!-- 资源概览 -->
          <div class="node-card__metrics">
            <!-- CPU -->
            <div class="node-card__metric">
              <div class="node-card__metric-header">
                <NText :depth="3" class="node-card__metric-label">
                  CPU
                </NText>
                <NText :depth="3" class="node-card__metric-inline-detail" :style="{ fontFamily: appStore.numberFontFamily }">
                  负载 {{ props.node.load?.toFixed(2) ?? '0.00' }}, {{ props.node.load5?.toFixed(2) ?? '0.00' }}, {{ props.node.load15?.toFixed(2) ?? '0.00' }}
                </NText>
                <NText class="node-card__metric-percent" :style="{ fontFamily: appStore.numberFontFamily }">
                  {{ (props.node.cpu ?? 0).toFixed(1) }}%
                </NText>
              </div>
              <NProgress
                class="node-card__metric-progress"
                :show-indicator="false"
                :percentage="props.node.cpu ?? 0"
                :status="cpuStatus"
                :height="8"
                :border-radius="999"
                rail-color="rgba(148, 163, 184, 0.18)"
              />
            </div>

            <!-- 内存 -->
            <div class="node-card__metric">
              <div class="node-card__metric-header">
                <NText :depth="3" class="node-card__metric-label">
                  内存
                </NText>
                <NText :depth="3" class="node-card__metric-inline-detail" :style="{ fontFamily: appStore.numberFontFamily }">
                  {{ formatBytes(props.node.ram ?? 0) }} / {{ formatBytes(props.node.mem_total ?? 0) }}
                </NText>
                <NText class="node-card__metric-percent" :style="{ fontFamily: appStore.numberFontFamily }">
                  {{ memPercentage.toFixed(1) }}%
                </NText>
              </div>
              <NProgress
                class="node-card__metric-progress"
                :show-indicator="false"
                :percentage="memPercentage"
                :status="memStatus"
                :height="8"
                :border-radius="999"
                rail-color="rgba(148, 163, 184, 0.18)"
              />
            </div>

            <!-- 硬盘 -->
            <div class="node-card__metric">
              <div class="node-card__metric-header">
                <NText :depth="3" class="node-card__metric-label">
                  硬盘
                </NText>
                <NText :depth="3" class="node-card__metric-inline-detail" :style="{ fontFamily: appStore.numberFontFamily }">
                  {{ formatBytes(props.node.disk ?? 0) }} / {{ formatBytes(props.node.disk_total ?? 0) }}
                </NText>
                <NText class="node-card__metric-percent" :style="{ fontFamily: appStore.numberFontFamily }">
                  {{ diskPercentage.toFixed(1) }}%
                </NText>
              </div>
              <NProgress
                class="node-card__metric-progress"
                :show-indicator="false"
                :percentage="diskPercentage"
                :status="diskStatus"
                :height="8"
                :border-radius="999"
                rail-color="rgba(148, 163, 184, 0.18)"
              />
            </div>

            <!-- 流量 -->
            <div class="node-card__metric">
              <div class="node-card__metric-header">
                <NText :depth="3" class="node-card__metric-label">
                  流量
                </NText>
                <NTooltip v-if="showTrafficProgress">
                  <template #trigger>
                    <NText :depth="3" class="node-card__metric-inline-detail node-card__metric-inline-detail--traffic cursor-help" :style="{ fontFamily: appStore.numberFontFamily }">
                      <span class="node-card__metric-inline-segment">{{ formatBytesInline(trafficUsed) }}</span>
                      <span class="node-card__metric-inline-separator"> / </span>
                      <span class="node-card__metric-inline-segment">{{ formatBytesInline(props.node.traffic_limit) }}</span>
                    </NText>
                  </template>
                  <NText class="text-[10px]" :style="{ fontFamily: appStore.numberFontFamily }">
                    <span class="node-card__metric-inline-segment" :style="{ color: appStore.trafficSplitColor ? themeVars.successColor : themeVars.textColorBase }">↑ {{ formatBytesInline(props.node.net_total_up ?? 0) }}</span><span class="p-1" /><span class="node-card__metric-inline-segment" :style="{ color: appStore.trafficSplitColor ? themeVars.infoColor : themeVars.textColorBase }">↓ {{ formatBytesInline(props.node.net_total_down ?? 0) }}</span>
                  </NText>
                </NTooltip>
                <NText v-else :depth="3" class="node-card__metric-inline-detail node-card__metric-inline-detail--traffic" :style="{ fontFamily: appStore.numberFontFamily }">
                  <span class="node-card__metric-inline-segment">↑ {{ formatBytesInline(props.node.net_total_up ?? 0) }}</span>
                  <span class="node-card__metric-inline-separator"> / </span>
                  <span class="node-card__metric-inline-segment">↓ {{ formatBytesInline(props.node.net_total_down ?? 0) }}</span>
                </NText>
                <NText class="node-card__metric-percent" :style="{ fontFamily: appStore.numberFontFamily }">
                  <template v-if="showTrafficProgress">
                    {{ trafficUsedPercentage.toFixed(1) }}%
                  </template>
                  <template v-else>
                    ∞
                  </template>
                </NText>
              </div>
              <NProgress
                class="node-card__metric-progress"
                :show-indicator="false"
                :percentage="showTrafficProgress ? trafficUsedPercentage : 0"
                :status="showTrafficProgress ? getStatus(trafficUsedPercentage) : 'success'"
                :height="8"
                :border-radius="999"
                rail-color="rgba(148, 163, 184, 0.18)"
              />
            </div>
          </div>

          <!-- 网络速率 -->
          <div class="flex-between">
            <NText :depth="3" class="text-[13px]">
              网络速率
            </NText>
            <div class="text-[13px] flex gap-1" :style="{ fontFamily: appStore.numberFontFamily }">
              <span class="node-card__metric-inline-segment" :style="{ color: themeVars.successColor }">↑ {{ formatBytesPerSecondInline(props.node.net_out ?? 0) }}</span><span class="" /><span class="node-card__metric-inline-segment" :style="{ color: themeVars.infoColor }">↓ {{ formatBytesPerSecondInline(props.node.net_in ?? 0) }}</span>
            </div>
          </div>

          <!-- 运行时间 -->
          <div class="uptime-row flex-between">
            <NText :depth="3" class="text-[13px]">
              运行时间
            </NText>
            <div class="flex gap-2 items-center">
              <!-- 当标签不在单独一行显示时，价格标签显示在运行时间行 -->
              <template v-if="!shouldShowTagsInSeparateRow">
                <NTag
                  v-for="(tag, index) in priceTags"
                  :key="index"
                  size="small"
                  :color="{ color: `${tag.color}20`, textColor: tag.color, borderColor: `${tag.color}40` }"
                >
                  {{ tag.text }}
                </NTag>
              </template>
              <NTag
                v-if="!props.node.online"
                size="small"
                class="node-card__offline-tag"
                :color="{ color: `${themeVars.errorColor}18`, textColor: themeVars.errorColor, borderColor: `${themeVars.errorColor}40` }"
              >
                离线
              </NTag>
              <!-- 根据 uptimeTagWrap 配置选择显示方式 -->
              <NTag v-if="props.node.online && appStore.uptimeTagWrap" size="small" :color="{ color: `#8b5cf620`, textColor: '#8b5cf6', borderColor: `#8b5cf640` }">
                {{ formatUptime(props.node.uptime ?? 0) }}
              </NTag>
              <NText v-else-if="props.node.online" class="text-[13px]" :style="{ fontFamily: appStore.numberFontFamily }">
                {{ formatUptime(props.node.uptime ?? 0) }}
              </NText>
            </div>
          </div>

          <!-- 标签单独一行显示（当 tagsInSeparateRow 为 true 时） -->
          <div v-if="shouldShowTagsInSeparateRow" class="tags-separate-row flex-between">
            <NText :depth="3" class="text-[13px]">
              标签
            </NText>
            <div class="flex flex-wrap gap-1 items-center justify-end">
              <NTag
                v-for="(tag, index) in mergedTags"
                :key="index"
                size="small"
                :color="{ color: `${tag.color}20`, textColor: tag.color, borderColor: `${tag.color}40` }"
              >
                {{ tag.text }}
              </NTag>
            </div>
          </div>
        </div>
      </template>
    </NCard>

    <!-- 延迟图表弹窗 -->
    <NModal
      v-model:show="showPingChart"
      preset="card"
      :title="`${props.node.name} - 延迟监控`"
      class="w-full sm:w-3/4"
      :bordered="false"
      :segmented="{ content: true, footer: 'soft' }"
    >
      <PingChart :uuid="props.node.uuid" />
    </NModal>
  </div>
</template>

<style scoped lang="scss">
.node-card {
  position: relative;
  overflow: hidden;
  container-type: inline-size;
}

.node-card__title-wrap {
  row-gap: 0.375rem;
}

.node-card__offline-tag {
  flex-shrink: 0;
}

.node-card__flag {
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 4px !important;
  overflow: hidden;
}

.node-card__flag-image,
.node-card__os-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 4px;
}

.node-card__os-icon {
  width: 1.1rem;
  height: 1.1rem;
}

.node-card__metrics {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}

.node-card__metric {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.node-card__metric-header {
  display: grid;
  grid-template-columns: 4.5rem minmax(0, 1fr) 4.5rem;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
}

.node-card__metric-label {
  font-size: 1rem;
  line-height: 1.25;
  justify-self: start;
  text-align: left;
}

.node-card__metric-inline-detail {
  min-width: 0;
  width: fit-content;
  max-width: 100%;
  display: inline-flex;
  align-items: center;
  justify-self: center;
  font-size: 0.85rem;
  line-height: 1.25;
  text-align: left;
  word-break: break-word;
}

.node-card__metric-inline-detail--traffic {
  flex-wrap: nowrap;
  justify-content: center;
  white-space: nowrap;
  column-gap: 0;
  row-gap: 0;
  word-break: normal;
  font-size: clamp(0.6rem, 2.1vw, 0.85rem);
  font-size: clamp(0.56rem, 4.8cqi, 0.85rem);
  line-height: 1.15;
}

.node-card__metric-inline-segment {
  white-space: nowrap;
}

.node-card__metric-inline-separator {
  white-space: nowrap;
}

.node-card__metric-percent {
  justify-self: end;
  width: 4.5rem;
  font-size: 0.95rem;
  font-weight: 600;
  line-height: 1.25;
  text-align: right;
}

.node-card__metric-progress {
  width: 100%;
}

.node-card__metric-detail {
  font-size: 0.85rem;
  line-height: 1.25;
}

.node-card__status-group {
  flex-shrink: 0;
}

.n-card .shrink-0.n-icon ~ .flex.shrink-0.has-tags {
  position: absolute;
  backdrop-filter: blur(8px);
  padding: 12px 22px 19px;
  border-radius: 10px;
  left: 1px;
  right: 1px;
  bottom: 1px;
  z-index: 9;
  transform: translateY(10%);
  opacity: 0;
  transition: 200ms;
}
.n-card:hover .shrink-0.n-icon ~ .flex.shrink-0.has-tags {
  transform: translateY(0);
  opacity: 1;
}
.n-card:has(.has-tags):hover .flex-between:last-child {
  opacity: 0.3;
}

// 亮色模式高对比度样式
.light-card-contrast {
  background-color: rgba(250, 250, 252, 1) !important;
  box-shadow: 0 2px 8px 0 rgba(0, 0, 0, 0.08);
  border-color: rgba(0, 0, 0, 0.12) !important;

  &:hover {
    box-shadow: 0 4px 12px 0 rgba(0, 0, 0, 0.12);
    border-color: var(--primary-color) !important;
  }
}

/* 毛玻璃卡片样式 */
.glass-card-enabled {
  background-color: rgba(255, 255, 255, 0.7) !important;
  border-radius: var(--n-border-radius);

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

.online-badge {
  position: relative;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 10%, transparent);
}

.online-badge__wave {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  opacity: 0.4;
  animation: online-badge-wave 1.5s infinite ease-out;
}

@media (max-width: 640px) {
  .node-card__metric-header {
    grid-template-columns: 3.75rem minmax(0, 1fr) 3.75rem;
    gap: 0.5rem;
  }

  .node-card__flag {
    width: 1.5rem;
    height: 1.5rem;
  }

  .node-card__os-icon {
    width: 1rem;
    height: 1rem;
  }

  .node-card__title-wrap {
    gap: 0.375rem;
  }

  .node-card__metrics {
    gap: 0.625rem;
  }

  .node-card__metric {
    gap: 0.325rem;
  }

  .node-card__metric-label {
    font-size: 0.95rem;
  }

  .node-card__metric-inline-detail {
    width: min(100%, 9.25rem);
    font-size: 0.76rem;
    line-height: 1.2;
  }

  .node-card__metric-inline-detail--traffic {
    font-size: clamp(0.6rem, 2.2vw, 0.78rem);
  }

  .node-card__metric-percent {
    width: 4rem;
    font-size: 0.9rem;
  }

  .node-card__metric-detail {
    font-size: 0.8rem;
  }

  .node-card :deep(.n-card-header) {
    padding-bottom: 0.75rem;
  }

  .node-card :deep(.n-card__content) {
    padding-top: 0.875rem;
  }

  .node-card .flex-between {
    gap: 0.625rem;
  }

  .node-card .uptime-row,
  .node-card .tags-separate-row {
    align-items: flex-start;
  }

  .node-card .uptime-row > :last-child,
  .node-card .tags-separate-row > :last-child {
    flex-wrap: wrap;
    justify-content: flex-end;
  }
}

@keyframes online-badge-wave {
  0% {
    transform: scale(1);
    opacity: 0.4;
  }
  100% {
    transform: scale(2.5);
    opacity: 0;
  }
}
</style>
