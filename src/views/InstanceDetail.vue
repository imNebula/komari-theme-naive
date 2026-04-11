<script setup lang="ts">
import { NCard, NDivider, NEllipsis, NEmpty, NIcon, NTag, NText } from 'naive-ui'
import { computed, defineAsyncComponent, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import { formatBytesPerSecondWithConfig, formatBytesWithConfig, formatUptimeWithFormat } from '@/utils/helper'
import { getOSImage, getOSName } from '@/utils/osImageHelper'
import { getRegionCode, getRegionDisplayName } from '@/utils/regionHelper'

// 异步组件：按需加载图表，减少首屏体积
const LoadChart = defineAsyncComponent(() => import('@/components/LoadChart.vue'))
const PingChart = defineAsyncComponent(() => import('@/components/PingChart.vue'))

const route = useRoute()
const router = useRouter()

const appStore = useAppStore()
const nodesStore = useNodesStore()

// 进入详情页时滚动到顶部
onMounted(() => {
  window.scrollTo({ top: 0, behavior: 'instant' })
})

// 格式化函数
const formatBytes = (bytes: number) => formatBytesWithConfig(bytes, appStore.byteDecimals)
const formatBytesPerSecond = (bytes: number) => formatBytesPerSecondWithConfig(bytes, appStore.byteDecimals)
const formatUptime = (seconds: number) => formatUptimeWithFormat(seconds, 'minute')

function formatOsDisplay(value?: string) {
  if (!value)
    return '-'

  return value.replace(/\s+\(/g, '\u00A0(')
}

function formatReportTime(value?: string) {
  if (!value)
    return '-'

  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return '-'

  const locale = appStore.lang === 'en-US' ? 'en-US' : 'zh-CN'
  return `${date.toLocaleDateString(locale)} ${date.toLocaleTimeString(locale, { hour12: false })}`
}

// 视图切换：load 或 ping
const chartView = ref<'load' | 'ping'>('load')

const data = computed(() => {
  return nodesStore.nodes.find(node => node.uuid === route.params.id)
})

// 是否启用模糊背景
const hasBackgroundBlur = computed(() => appStore.backgroundEnabled && appStore.backgroundBlur > 0)

// 计算模糊半径类
const blurClass = computed(() => {
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

/** 信息项配置 */
interface InfoItem {
  label: string
  value?: string
  valueLines?: string[]
  icon?: string
  fullRow?: boolean
  valueParts?: Array<{ text: string, tone?: 'up' | 'down' }>
  numberFont?: boolean
  showOsIcon?: boolean
}

const cpuDisplay = computed(() => {
  if (!data.value)
    return '-'
  return `${data.value.cpu_name} (x${data.value.cpu_cores})`
})

const gpuDisplay = computed(() => {
  const gpuName = data.value?.gpu_name?.trim()
  if (!gpuName || gpuName.toLowerCase() === 'none')
    return '服务器很多没有 GPU 的啦～'

  return gpuName
})
const normalizedGpuDisplay = computed(() => {
  const raw = gpuDisplay.value
  if (!raw || raw === '-')
    return '服务器很多没有 GPU 的啦～'

  return raw
    .replace(/[\r\n]+/g, ' · ')
    .replace(/[;,，；]+/g, ' · ')
    .replace(/\s{2,}/g, ' ')
    .trim()
})

/** 系统信息 */
const systemInfo = computed<InfoItem[]>(() => [
  { label: '操作系统', value: formatOsDisplay(data.value?.os), icon: 'i-icon-park-outline-computer', showOsIcon: true },
  { label: '内核版本', value: data.value?.kernel_version ?? '-', icon: 'i-icon-park-outline-code' },
  { label: '运行时间', value: formatUptime(data.value?.uptime ?? 0), icon: 'i-icon-park-outline-timer', numberFont: true },
  { label: '最后上报', value: formatReportTime(data.value?.time), icon: 'i-icon-park-outline-time', numberFont: true },
])

/** 存储信息 */
const storageInfo = computed<InfoItem[]>(() => [
  { label: '内存', value: formatBytes(data.value?.mem_total ?? 0), icon: 'i-icon-park-outline-memory', numberFont: true },
  { label: '内存交换', value: formatBytes(data.value?.swap_total ?? 0), icon: 'i-icon-park-outline-switch', numberFont: true },
  { label: '硬盘', value: formatBytes(data.value?.disk_total ?? 0), icon: 'i-icon-park-outline-hard-disk', numberFont: true },
])

/** 网络信息 */
const networkInfo = computed<InfoItem[]>(() => [
  {
    label: '总流量',
    icon: 'i-icon-park-outline-transfer-data',
    numberFont: true,
    valueParts: [
      { text: `↑ ${formatBytes(data.value?.net_total_up ?? 0)}`, tone: 'up' },
      { text: `↓ ${formatBytes(data.value?.net_total_down ?? 0)}`, tone: 'down' },
    ],
  },
  {
    label: '网络速率',
    icon: 'i-icon-park-outline-dashboard-one',
    numberFont: true,
    valueParts: [
      { text: `↑ ${formatBytesPerSecond(data.value?.net_out ?? 0)}`, tone: 'up' },
      { text: `↓ ${formatBytesPerSecond(data.value?.net_in ?? 0)}`, tone: 'down' },
    ],
  },
])

// 是否启用亮色模式高对比度
const lightCardContrastEnabled = computed(() => appStore.lightCardContrast && !appStore.isDark)
</script>

<template>
  <div class="instance-detail">
    <!-- 节点不存在时的空状态 -->
    <div v-if="!data" class="p-4">
      <NCard>
        <NEmpty description="节点不存在或已被删除">
          <template #extra>
            <NButton @click="router.push('/')">
              返回首页
            </NButton>
          </template>
        </NEmpty>
      </NCard>
    </div>

    <!-- 节点详情 -->
    <template v-else>
      <!-- 头部信息 -->
      <div class="px-4 py-2 flex gap-4 items-center">
        <NButton text @click="router.push('/')">
          <div class="i-icon-park-outline-arrow-left" />
        </NButton>
        <div class="text-lg font-bold flex gap-2 items-center">
          <NIcon size="24">
            <img :src="`/images/flags/${getRegionCode(data.region)}.svg`" :alt="getRegionDisplayName(data.region)">
          </NIcon>
          <NText>
            {{ data.name }}
          </NText>
        </div>
        <NTag :type="data.online ? 'success' : 'error'" size="small">
          {{ data.online ? '在线' : '离线' }}
        </NTag>
        <!-- <NText :depth="3" class="text-xs">
          {{ data.uuid }}
        </NText> -->
      </div>

      <!-- 实例信息卡片 -->
      <div class="p-4 gap-4 grid grid-cols-1 lg:grid-cols-2">
        <!-- 硬件信息 -->
        <NCard title="硬件信息" size="small" content-class="h-full" :class="[{ 'light-card-contrast': lightCardContrastEnabled }, { 'glass-card-enabled': hasBackgroundBlur }, blurClass]">
          <div class="instance-detail__hardware-layout">
            <div class="instance-detail__hardware-primary">
              <div class="instance-detail__hardware-item instance-detail__hardware-item--full">
                <div class="i-icon-park-outline-cpu text-gray-400 shrink-0" />
                <NText :depth="3" class="text-sm shrink-0">
                  CPU
                </NText>
                <NEllipsis tooltip class="instance-detail__hardware-value text-sm min-w-0">
                  {{ cpuDisplay }}
                </NEllipsis>
              </div>

              <div class="instance-detail__hardware-item instance-detail__hardware-item--full">
                <div class="i-icon-park-outline-video-one text-gray-400 shrink-0" />
                <NText :depth="3" class="text-sm shrink-0">
                  GPU
                </NText>
                <NEllipsis tooltip class="instance-detail__hardware-value text-sm min-w-0">
                  {{ normalizedGpuDisplay }}
                </NEllipsis>
              </div>
            </div>

            <div class="instance-detail__hardware-secondary">
              <div class="instance-detail__hardware-item">
                <div class="i-icon-park-outline-application-two text-gray-400 shrink-0" />
                <NText :depth="3" class="text-sm shrink-0">
                  架构
                </NText>
                <NText class="instance-detail__hardware-value text-sm min-w-0 break-all">
                  {{ data.arch || '-' }}
                </NText>
              </div>

              <div class="instance-detail__hardware-item">
                <div class="i-icon-park-outline-server text-gray-400 shrink-0" />
                <NText :depth="3" class="text-sm shrink-0">
                  虚拟化
                </NText>
                <NText class="instance-detail__hardware-value text-sm min-w-0 break-all">
                  {{ data.virtualization || '-' }}
                </NText>
              </div>
            </div>
          </div>
        </NCard>

        <!-- 系统信息 -->
        <NCard title="系统信息" size="small" content-class="h-full" :class="[{ 'light-card-contrast': lightCardContrastEnabled }, { 'glass-card-enabled': hasBackgroundBlur }, blurClass]">
          <div class="instance-detail__info-grid instance-detail__info-grid--two instance-detail__info-grid--system" style="height: 100%; align-content: center;">
            <div v-for="item in systemInfo" :key="item.label" class="instance-detail__info-item">
              <div v-if="item.icon" :class="item.icon" class="instance-detail__info-icon text-gray-400" />
              <NText :depth="3" class="instance-detail__info-label text-sm">
                {{ item.label }}
              </NText>
              <div class="instance-detail__info-value">
                <NIcon v-if="item.showOsIcon" class="instance-detail__info-os-icon" size="18">
                  <img :src="getOSImage(data.os)" :alt="getOSName(data.os)">
                </NIcon>
                <div
                  class="instance-detail__info-value-content"
                  :class="{ 'instance-detail__info-value-content--stacked': item.valueLines?.length }"
                  :style="item.numberFont ? { fontFamily: appStore.numberFontFamily } : {}"
                >
                  <NText v-if="!item.valueLines?.length" class="instance-detail__info-value-text text-sm">
                    {{ item.value }}
                  </NText>
                  <NText
                    v-for="(line, index) in item.valueLines ?? []"
                    v-else
                    :key="`${item.label}-${index}`"
                    class="instance-detail__info-value-text text-sm"
                  >
                    {{ line }}
                  </NText>
                </div>
              </div>
            </div>
          </div>
        </NCard>

        <!-- 存储信息 -->
        <NCard title="存储信息" size="small" :class="[{ 'light-card-contrast': lightCardContrastEnabled }, { 'glass-card-enabled': hasBackgroundBlur }, blurClass]">
          <div class="instance-detail__info-grid instance-detail__info-grid--three">
            <div v-for="item in storageInfo" :key="item.label" class="instance-detail__info-item">
              <div v-if="item.icon" :class="item.icon" class="instance-detail__info-icon text-gray-400" />
              <NText :depth="3" class="instance-detail__info-label text-sm">
                {{ item.label }}
              </NText>
              <div class="instance-detail__info-value">
                <NText class="instance-detail__info-value-text text-sm" :style="{ fontFamily: appStore.numberFontFamily }">
                  {{ item.value }}
                </NText>
              </div>
            </div>
          </div>
        </NCard>

        <!-- 网络信息 -->
        <NCard title="网络信息" size="small" :class="[{ 'light-card-contrast': lightCardContrastEnabled }, { 'glass-card-enabled': hasBackgroundBlur }, blurClass]">
          <div class="instance-detail__info-grid instance-detail__info-grid--two">
            <div v-for="item in networkInfo" :key="item.label" class="instance-detail__info-item">
              <div v-if="item.icon" :class="item.icon" class="instance-detail__info-icon text-gray-400" />
              <NText :depth="3" class="instance-detail__info-label text-sm">
                {{ item.label }}
              </NText>
              <div class="instance-detail__info-value instance-detail__info-value--parts" :style="item.numberFont ? { fontFamily: appStore.numberFontFamily } : {}">
                <span
                  v-for="part in item.valueParts"
                  :key="part.text"
                  class="instance-detail__info-part"
                  :class="{
                    'instance-detail__info-part--up': part.tone === 'up',
                    'instance-detail__info-part--down': part.tone === 'down',
                  }"
                >
                  {{ part.text }}
                </span>
              </div>
            </div>
          </div>
        </NCard>
      </div>

      <!-- 分割线 -->
      <div>
        <NDivider class="my-0! px-4!" dashed />
      </div>

      <!-- 图表标签页 -->
      <div class="instance-detail__chart-tabs p-4">
        <div class="instance-detail__chart-toggle">
          <button
            class="instance-detail__pill-btn"
            :class="{ 'instance-detail__pill-btn--active': chartView === 'load' }"
            @click="chartView = 'load'"
          >
            负载
          </button>
          <button
            class="instance-detail__pill-btn"
            :class="{ 'instance-detail__pill-btn--active': chartView === 'ping' }"
            @click="chartView = 'ping'"
          >
            延迟
          </button>
        </div>
        <div v-if="chartView === 'load'">
          <LoadChart :uuid="data.uuid" />
        </div>
        <div v-else>
          <PingChart :uuid="data.uuid" />
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
/* 亮色模式高对比度样式 */
.light-card-contrast {
  background-color: rgba(250, 250, 252, 1) !important;
  box-shadow: 0 2px 8px 0 rgba(0, 0, 0, 0.08);
  border-color: rgba(0, 0, 0, 0.12) !important;

  &:hover {
    box-shadow: 0 4px 12px 0 rgba(0, 0, 0, 0.12);
  }
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

/* 图表切换按钮组 */
.instance-detail__chart-toggle {
  display: flex;
  justify-content: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.instance-detail__pill-btn {
  flex: none;
  width: fit-content;
  min-width: 7rem;
  height: 2.5rem;
  padding: 0 2rem;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 999px;
  background: color-mix(in srgb, var(--n-color, #fff) 88%, transparent);
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.08);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--n-text-color, inherit);
  cursor: pointer;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    border-color 0.2s ease,
    background-color 0.2s ease;

  &:hover {
    transform: translateY(-1px);
    border-color: color-mix(in srgb, var(--primary-color) 30%, rgba(148, 163, 184, 0.18));
    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.12);
  }
}

.instance-detail__pill-btn--active {
  border-color: color-mix(in srgb, var(--primary-color) 28%, rgba(148, 163, 184, 0.18));
  background: color-mix(in srgb, var(--primary-color) 8%, var(--n-color, #fff));
  color: var(--primary-color);
}

.instance-detail__hardware-layout {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.instance-detail__hardware-primary {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.instance-detail__hardware-secondary {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
}

.instance-detail__hardware-item {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.625rem;
  line-height: 1.4;
}

.instance-detail__hardware-item--full {
  width: 100%;
}

.instance-detail__hardware-value {
  flex: 1;
  min-width: 0;
}

.instance-detail__hardware-value:deep(.n-ellipsis) {
  display: block;
}

.instance-detail__info-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
}

.instance-detail__info-item {
  min-width: 0;
  display: grid;
  grid-template-columns: 1rem auto auto;
  align-items: center;
  gap: 0.625rem;
  line-height: 1.4;
}

.instance-detail__info-icon {
  font-size: 1rem;
}

.instance-detail__info-label {
  white-space: nowrap;
}

.instance-detail__info-value {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0.5rem;
}

.instance-detail__info-value-content {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0.5rem;
}

.instance-detail__info-value-content--stacked {
  flex-direction: column;
  align-items: flex-start;
  gap: 0.08rem;
}

.instance-detail__info-value-content--stacked .instance-detail__info-value-text {
  white-space: nowrap;
  word-break: keep-all;
}

.instance-detail__info-value--parts {
  flex-wrap: wrap;
  row-gap: 0.25rem;
}

.instance-detail__info-os-icon {
  flex-shrink: 0;
}

.instance-detail__info-value-text {
  min-width: 0;
  text-align: left;
  word-break: break-word;
}

.instance-detail__info-part {
  white-space: nowrap;
}

.instance-detail__info-part--up {
  color: #16a34a;
}

.instance-detail__info-part--down {
  color: #2563eb;
}

@media (min-width: 640px) {
  .instance-detail__hardware-secondary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1.25rem;
  }

  .instance-detail__info-grid--two {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .instance-detail__info-grid--system {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    column-gap: 1.5rem;
  }
}

@media (min-width: 960px) {
  .instance-detail__info-grid--three {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .instance-detail__info-grid--three .instance-detail__info-item {
    grid-template-columns: 1rem auto auto;
  }

  .instance-detail__info-grid--three .instance-detail__info-value {
    justify-content: flex-start;
  }

  .instance-detail__info-grid--three .instance-detail__info-value-text {
    text-align: left;
  }
}

@media (max-width: 640px) {
  .instance-detail__info-item {
    grid-template-columns: 1rem auto 1fr;
    align-items: center;
  }

  .instance-detail__info-value {
    justify-content: flex-end;
    text-align: right;
  }

  .instance-detail__info-value-text {
    text-align: right;
  }

  .instance-detail__info-value--parts {
    justify-content: flex-end;
  }
}
</style>
