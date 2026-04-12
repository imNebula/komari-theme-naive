<script setup lang="ts">
import dayjs from 'dayjs'
import { NButton, NEmpty, NSpin, NSwitch, NTooltip } from 'naive-ui'
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import VChart from 'vue-echarts'
import { useAppStore } from '@/stores/app'
import { cutPeakValues, interpolateNullsLinear } from '@/utils/recordHelper'
import { getSharedRpc } from '@/utils/rpc'
import '@/utils/echarts' // 共享 ECharts 配置

const props = defineProps<{
  uuid: string
}>()

const appStore = useAppStore()
const isDark = computed(() => appStore.isDark)
// 使用共享的 RPC 实例，避免重复创建连接
const rpc = getSharedRpc()

// 图表主题相关颜色
const chartThemeColors = computed(() => ({
  text: isDark.value ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.85)',
  textSecondary: isDark.value ? 'rgba(255, 255, 255, 0.55)' : 'rgba(0, 0, 0, 0.55)',
  textTertiary: isDark.value ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.35)',
  borderColor: isDark.value ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
  splitLineColor: isDark.value ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
  tooltipBg: isDark.value ? 'rgba(40, 40, 40, 0.95)' : 'rgba(255, 255, 255, 0.98)',
  tooltipShadow: isDark.value ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.12)',
  crosshairColor: isDark.value ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)',
}))

// 优化后的图表配色方案（多任务时使用）
const chartColors = [
  '#FF6B6B', // 珊瑚红
  '#4ECDC4', // 青绿色
  '#A78BFA', // 紫罗兰
  '#60A5FA', // 天蓝色
  '#FFB347', // 琥珀黄
  '#F472B6', // 粉红色
  '#34D399', // 翠绿色
  '#FB923C', // 橙色
  '#818CF8', // 靛蓝色
  '#FBBF24', // 金黄色
  '#38BDF8', // 亮蓝色
  '#A3E635', // 柠檬绿
  '#FB7185', // 玫瑰红
  '#2DD4BF', // 绿松石
  '#C084FC', // 亮紫色
  '#F43F5E', // 树莓红
  '#10B981', // 深翠绿
  '#8B5CF6', // 蓝紫色
  '#EAB308', // 姜黄色
  '#06B6D4', // 青蓝色
]

// 从 publicSettings 获取记录保留时间
const maxPingRecordPreserveTime = computed(() => appStore.publicSettings?.ping_record_preserve_time || 168)

// 视图选项
const presetViews = [
  { label: '1 小时', hours: 1 },
  { label: '6 小时', hours: 6 },
  { label: '12 小时', hours: 12 },
  { label: '1 天', hours: 24 },
]

// 可用视图列表
const availableViews = computed(() => {
  const views: { label: string, hours: number }[] = []
  const maxHours = maxPingRecordPreserveTime.value

  for (const v of presetViews) {
    if (maxHours >= v.hours) {
      views.push(v)
    }
  }

  const maxPreset = presetViews[presetViews.length - 1]
  if (maxPreset && maxHours > maxPreset.hours) {
    const label = maxHours % 24 === 0
      ? `${Math.floor(maxHours / 24)} 天`
      : `${maxHours} 小时`
    views.push({ label, hours: maxHours })
  }
  else if (maxHours > 1 && !presetViews.some(v => v.hours === maxHours)) {
    const label = maxHours % 24 === 0
      ? `${Math.floor(maxHours / 24)} 天`
      : `${maxHours} 小时`
    views.push({ label, hours: maxHours })
  }

  return views
})

// 当前选中的视图
const selectedView = ref<string>('')
const selectedHours = computed(() => {
  const view = availableViews.value.find(v => v.label === selectedView.value)
  return view?.hours || 1
})

// 初始化默认视图
watch(availableViews, (views) => {
  const firstView = views[0]
  if (firstView && !selectedView.value) {
    selectedView.value = firstView.label
  }
}, { immediate: true })

// ==================== 类型定义 ====================

interface PingRecord {
  client: string
  task_id: number
  time: string
  value: number
}

interface TaskInfo {
  id: number
  name: string
  interval: number
  loss: number
  p99?: number
  p50?: number
  p99_p50_ratio?: number
  min?: number
  max?: number
  avg?: number
  latest?: number
  total?: number
  type?: string
}

interface PingRecordsResponse {
  count: number
  records: PingRecord[]
  tasks?: TaskInfo[]
  from?: string
  to?: string
}

// 数据状态
const remoteData = shallowRef<PingRecord[]>([])
const tasks = shallowRef<TaskInfo[]>([])
const loading = ref(false)
const updating = ref(false)
const error = ref<string | null>(null)

// 任务选择
const selectedTaskIds = ref<number[]>([])
const cutPeak = ref(false)

const chartRef = ref<InstanceType<typeof VChart> | null>(null)
const userYAxisMax = ref<number | null>(null)

const chartMargin = { top: 32, right: 24, bottom: 84, left: 56 }

// ==================== 数据获取 ====================

function handleChartClick(params: any) {
  const chart = chartRef.value
  if (!chart || typeof chart.containPixel !== 'function') return

  const pointInPixel = [params.offsetX, params.offsetY]
  if (chart.containPixel('grid', pointInPixel)) {
    const pointInGrid = chart.convertFromPixel('grid', pointInPixel) as [number, number]
    const clickedY = pointInGrid[1]
    
    if (typeof clickedY === 'number' && clickedY > 0) {
      userYAxisMax.value = Math.round(clickedY * 10) / 10
    }
  }
}

async function fetchRecords() {
  if (!props.uuid)
    return

  // 首次加载使用 loading（显示骨架），后续切换使用 updating（保持旧数据可见）
  const isFirstLoad = tasks.value.length === 0
  if (isFirstLoad) {
    loading.value = true
  }
  else {
    updating.value = true
  }
  error.value = null

  try {
    const result = await rpc.getClient().call<PingRecordsResponse>('common:getRecords', {
      uuid: props.uuid,
      type: 'ping',
      hours: selectedHours.value,
    })

    const records = result?.records || []
    records.sort((a, b) => dayjs(a.time).valueOf() - dayjs(b.time).valueOf())

    remoteData.value = records
    tasks.value = result?.tasks || []

    // 数据加载后校正选中的任务 ID
    if (tasks.value.length > 0) {
      const validIds = new Set(tasks.value.map(t => t.id))
      if (selectedTaskIds.value.length === 0) {
        // 首次加载，全选
        selectedTaskIds.value = tasks.value.map(t => t.id)
      }
      else {
        // 保留仍有效的选中项，移除已不存在的
        const kept = selectedTaskIds.value.filter(id => validIds.has(id))
        // 如果所有旧选中项都仍有效，则保持；否则重新全选
        selectedTaskIds.value = kept.length > 0 ? kept : tasks.value.map(t => t.id)
      }
    }
  }
  catch (err) {
    error.value = err instanceof Error ? err.message : '获取数据失败'
    remoteData.value = []
    tasks.value = []
  }
  finally {
    loading.value = false
    updating.value = false
  }
}

// ==================== 数据处理 ====================

const mergedData = computed(() => {
  const data = remoteData.value
  if (!data.length)
    return []

  const taskList = tasks.value

  const taskIntervals = taskList
    .map(t => t.interval)
    .filter((v): v is number => typeof v === 'number' && v > 0)

  const fallbackIntervalSec = taskIntervals.length ? Math.min(...taskIntervals) : 60
  const toleranceMs = Math.min(
    6000,
    Math.max(800, Math.floor(fallbackIntervalSec * 1000 * 0.25)),
  )

  const grouped: Map<number, Record<string, unknown>> = new Map()
  const anchors: number[] = []

  for (const rec of data) {
    const ts = dayjs(rec.time).valueOf()
    let anchor: number | null = null

    for (const a of anchors) {
      if (Math.abs(a - ts) <= toleranceMs) {
        anchor = a
        break
      }
    }

    const useTs = anchor ?? ts
    if (!grouped.has(useTs)) {
      grouped.set(useTs, { time: dayjs(useTs).toISOString() })
      if (anchor === null) {
        anchors.push(useTs)
      }
    }

    const group = grouped.get(useTs)!
    group[rec.task_id] = rec.value < 0 ? null : rec.value
  }

  const merged = Array.from(grouped.values()).sort(
    (a, b) => dayjs(a.time as string).valueOf() - dayjs(b.time as string).valueOf(),
  )

  const hours = selectedHours.value
  const lastItem = merged[merged.length - 1]
  const lastTs = lastItem ? dayjs(lastItem.time as string).valueOf() : dayjs().valueOf()
  const fromTs = lastTs - hours * 3600_000

  let startIdx = 0
  for (let i = 0; i < merged.length; i++) {
    const item = merged[i]
    if (!item)
      continue
    const ts = dayjs(item.time as string).valueOf()
    if (ts >= fromTs) {
      startIdx = Math.max(0, i - 1)
      break
    }
  }

  return merged.slice(startIdx)
})

const chartData = computed(() => {
  let data = mergedData.value
  const selectedKeys = selectedTaskIds.value.map(String)

  if (selectedKeys.length === 0)
    return []

  if (cutPeak.value) {
    data = cutPeakValues(data, selectedKeys)
  }

  if (selectedKeys.length > 0 && data.length > 0) {
    data = interpolateNullsLinear(data, selectedKeys, {
      maxGapMultiplier: 6,
      minCapMs: 2 * 60_000,
      maxCapMs: 30 * 60_000,
    })
  }

  return data
})

// ==================== 工具函数 ====================

function formatTime(time: string, showDate: boolean): string {
  const date = dayjs(time)
  if (showDate) {
    return date.format('M/D HH:mm')
  }
  return date.format('HH:mm')
}

function formatTimeForTooltip(time: string, hours: number): string {
  const date = dayjs(time)
  if (hours < 24) {
    return date.format('HH:mm:ss')
  }
  return date.format('MM/DD HH:mm')
}

const showDateInAxis = computed(() => selectedHours.value >= 24)

// ==================== 任务选择 ====================

// 获取任务颜色（根据任务在完整列表中的索引）
function getTaskColor(taskId: number): string {
  const taskIndex = tasks.value.findIndex(t => t.id === taskId)
  const safeIndex = Math.max(0, taskIndex % chartColors.length)
  return chartColors[safeIndex]!
}

// 最新值统计（从服务端 tasks 获取，保持颜色顺序）
const latestValues = computed(() => {
  if (!tasks.value.length)
    return []

  const latestMap = new Map<number, number | null>()
  for (const task of tasks.value) {
    for (let i = remoteData.value.length - 1; i >= 0; i--) {
      const rec = remoteData.value[i]
      if (rec && rec.task_id === task.id && rec.value >= 0) {
        latestMap.set(task.id, rec.value)
        break
      }
    }
  }

  return tasks.value.map((task, idx) => {
    const safeIdx = Math.max(0, idx % chartColors.length)
    return {
      ...task,
      latestValue: latestMap.get(task.id) ?? null,
      color: chartColors[safeIdx]!,
    }
  })
})

const selectedTasks = computed(() => {
  return tasks.value.filter(t => selectedTaskIds.value.includes(t.id))
})

// 切换任务选中状态
function toggleTask(taskId: number) {
  if (selectedTaskIds.value.includes(taskId)) {
    selectedTaskIds.value = selectedTaskIds.value.filter(id => id !== taskId)
  }
  else {
    selectedTaskIds.value = [...selectedTaskIds.value, taskId]
  }
}

function showAllTasks() {
  selectedTaskIds.value = tasks.value.map(t => t.id)
}

function hideAllTasks() {
  selectedTaskIds.value = []
}

// ==================== 图表配置 ====================

// 通用 Tooltip 配置
const baseTooltipConfig = computed(() => ({
  trigger: 'axis' as const,
  confine: false,
  backgroundColor: chartThemeColors.value.tooltipBg,
  borderColor: 'transparent',
  borderWidth: 0,
  borderRadius: 8,
  padding: [10, 14],
  boxShadow: `0 4px 16px ${chartThemeColors.value.tooltipShadow}`,
  textStyle: {
    color: chartThemeColors.value.text,
    fontSize: 13,
    lineHeight: 20,
  },
  extraCssText: 'box-shadow: none; backdrop-filter: blur(8px);',
  axisPointer: {
    type: 'cross' as const,
    crossStyle: {
      color: chartThemeColors.value.textTertiary,
    },
    lineStyle: {
      color: chartThemeColors.value.crosshairColor,
      width: 1,
      type: 'dashed' as const,
    },
    shadowStyle: {
      color: chartThemeColors.value.crosshairColor,
    },
  },
}))

const pingChartOption = computed(() => {
  const taskList = selectedTasks.value
  const data = chartData.value
  const hours = selectedHours.value

  const yAxisMax = userYAxisMax.value
  let ceilingMax = yAxisMax

  if (yAxisMax !== null) {
    const laneStep = Math.max(yAxisMax * 0.04, 1)
    ceilingMax = yAxisMax + taskList.length * laneStep
  }

  // 构建 series，确保颜色与卡片一致
  const series = taskList.flatMap((task, idx) => {
    const color = getTaskColor(task.id)
    
    const mainSeries = {
      id: 'main-' + task.id,
      name: task.name,
      type: 'line' as const,
      data: data.map(d => d[task.id] as number | null ?? null),
      smooth: cutPeak.value ? 0.6 : 0.4,
      showSymbol: false,
      connectNulls: false,
      lineStyle: { width: 2.5, color, cap: 'round' as const },
      itemStyle: { color }, // 确保 symbol 颜色一致
    }

    if (yAxisMax !== null) {
      const laneStep = Math.max(yAxisMax * 0.04, 1)
      const exceedY = yAxisMax + (idx * laneStep)

      return [
        mainSeries,
        {
          id: 'exceed-' + task.id,
          name: task.name,
          type: 'line' as const,
          data: data.map(d => {
            const v = d[task.id] as number | null ?? null
            return (v !== null && v > yAxisMax) ? exceedY : null
          }),
          smooth: false,
          showSymbol: true,
          symbol: 'circle',
          symbolSize: 3,
          connectNulls: false,
          lineStyle: { width: 2, color, type: 'dashed' as const },
          itemStyle: { color },
          tooltip: { show: false },
          hoverAnimation: false,
        }
      ]
    }
    
    return [mainSeries]
  })

  // 颜色映射表（用于 Tooltip）
  const colorMap = new Map<number, string>()
  tasks.value.forEach((task, idx) => {
    const safeIdx = Math.max(0, idx % chartColors.length)
    colorMap.set(task.id, chartColors[safeIdx]!)
  })

  return {
    animation: false,
    visualMap: yAxisMax === null ? undefined : taskList.map((task, idx) => ({
      type: 'piecewise',
      show: false,
      dimension: 1, // Y轴是维度1
      seriesIndex: idx * 2, // mainSeries 是每个任务生成的第一个系列
      pieces: [{ max: yAxisMax, color: getTaskColor(task.id) }],
      outOfRange: { color: 'transparent' }
    })),
    // 全局颜色设置（用于图例等）
    color: tasks.value.map((_, idx) => {
      const safeIdx = Math.max(0, idx % chartColors.length)
      return chartColors[safeIdx]!
    }),
    tooltip: {
      ...baseTooltipConfig.value,
      formatter: (params: unknown) => {
        const p = params as Array<{ seriesId?: string, seriesName: string, value: number | null, dataIndex: number }>
        if (!p.length)
          return ''
        
        // 过滤掉用于展示虚线的虚拟系列
        const validParams = p.filter(item => !item.seriesId?.startsWith('exceed'))
        if (!validParams.length)
          return ''

        const firstParam = validParams[0]
        if (!firstParam)
          return ''
        const rowData = data[firstParam.dataIndex]
        if (!rowData)
          return ''

        const time = rowData.time as string
        const timeStr = formatTimeForTooltip(time, hours)
        let html = `<div style="font-weight:600;margin-bottom:6px;color:${chartThemeColors.value.textSecondary}">${timeStr}</div>`
        html += '<div style="display:flex;flex-direction:column;gap:4px">'

        // 按延迟真实值排序显示
        const sortedParams = [...validParams].sort((a, b) => (a.value ?? 0) - (b.value ?? 0))

        for (const item of sortedParams) {
          if (item.value !== null && item.value !== undefined) {
            // 通过任务名找到对应的任务ID，再获取颜色
            const task = tasks.value.find(t => t.name === item.seriesName)
            const color = task ? colorMap.get(task.id) || chartColors[0] : chartColors[0]
            const colorDot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:8px;flex-shrink:0"></span>`
            html += `<div style="display:flex;align-items:center">${colorDot}<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item.seriesName}</span><span style="margin-left:auto;font-weight:600;margin-left:16px;font-variant-numeric:tabular-nums">${Math.round(item.value)} ms</span></div>`
          }
        }
        html += '</div>'
        return html
      },
    },
    legend: {
      type: 'scroll',
      bottom: 36,
      itemWidth: 12,
      itemHeight: 12,
      itemGap: 16,
      icon: 'roundRect',
      textStyle: { fontSize: 11, color: chartThemeColors.value.textSecondary },
      data: taskList.map(t => t.name),
    },
    toolbox: {
      show: true,
      right: 16,
      top: 0,
      feature: {
        dataZoom: {
          yAxisIndex: 'none',
          title: { zoom: '区域缩放', back: '还原缩放' }
        }
      },
      iconStyle: {
        borderColor: chartThemeColors.value.textSecondary
      }
    },
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: 0,
        filterMode: 'filter',
        // 限制最多只能放大到查看 20 个数据节点，防止滚轮过猛直接缩到只剩几个点没法看
        minValueSpan: 20
      },
      {
        type: 'slider',
        xAxisIndex: 0,
        bottom: 0,
        height: 24,
        minValueSpan: 20,
        textStyle: { color: chartThemeColors.value.textSecondary },
        borderColor: chartThemeColors.value.borderColor,
        fillerColor: isDark.value ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
      }
    ],
    grid: chartMargin,
    xAxis: {
      type: 'category',
      data: data.map(d => formatTime(d.time as string, showDateInAxis.value)),
      axisLabel: {
        fontSize: 11,
        color: chartThemeColors.value.textSecondary,
        margin: 12,
      },
      axisLine: {
        show: true,
        lineStyle: { color: chartThemeColors.value.borderColor, width: 1 },
      },
      axisTick: { show: false },
      boundaryGap: false,
    },
    yAxis: {
      type: 'value',
      name: '延迟 (ms)',
      max: yAxisMax === null ? undefined : ceilingMax,
      nameTextStyle: { color: chartThemeColors.value.textSecondary, padding: [0, 40, 0, 0] },
      axisLabel: { 
        fontSize: 11, 
        color: chartThemeColors.value.textSecondary, 
        formatter: (val: number) => {
          if (yAxisMax !== null && val > yAxisMax) return ''
          return String(val)
        }
      },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: {
        lineStyle: {
          color: chartThemeColors.value.splitLineColor,
          type: 'dashed' as const,
        },
      },
    },
    series,
  }
})

// ==================== 生命周期 ====================

watch(selectedView, () => {
  fetchRecords()
})

watch(() => props.uuid, () => {
  remoteData.value = []
  tasks.value = []
  selectedTaskIds.value = []
  fetchRecords()
})

onMounted(() => {
  const firstView = availableViews.value[0]
  if (firstView && !selectedView.value) {
    selectedView.value = firstView.label
  }
  fetchRecords()
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
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- 时间选择器 -->
    <div class="flex flex-wrap gap-2 justify-center">
      <NButton
        v-for="view in availableViews"
        :key="view.label"
        :type="selectedView === view.label ? 'primary' : 'default'"
        size="small"
        class="pill-btn"
        @click="selectedView = view.label"
      >
        {{ view.label }}
      </NButton>
    </div>

    <!-- 内容区域 -->
    <NSpin :show="loading" content-class="flex flex-col gap-4">
      <div v-if="error" class="text-red-500 py-8 text-center">
        {{ error }}
      </div>
      <div v-else-if="tasks.length === 0 && !loading" class="py-8">
        <NEmpty description="暂无延迟数据" />
      </div>

      <template v-else>
        <!-- 最新值统计卡片（可点击切换选中状态） -->
        <div v-if="latestValues.length > 0" class="gap-3 grid" :class="{ 'ping-chart--updating': updating }" style="grid-template-columns: repeat(auto-fit, minmax(320px, 1fr))">
          <div
            v-for="task in latestValues"
            :key="task.id"
            class="p-3 border border-transparent flex gap-3 cursor-pointer select-none transition-colors items-center hover:border-solid"
            :class="[
              selectedTaskIds.includes(task.id)
                ? ''
                : 'opacity-50',
              hasBackgroundBlur ? 'glass-task-enabled' : 'task-card-default',
              blurClass,
            ]"
            :onmouseover="(e: MouseEvent) => ((e.currentTarget as HTMLElement).style.borderColor = task.color)"
            :onmouseout="(e: MouseEvent) => ((e.currentTarget as HTMLElement).style.borderColor = 'transparent')"
            @click="toggleTask(task.id)"
          >
            <div
              class="rounded-md flex-shrink-0 h-10 w-1.5"
              :style="{ backgroundColor: task.color }"
            />
            <div class="flex-1 min-w-0">
              <div class="flex gap-2 items-center">
                <span class="text-base font-semibold truncate">{{ task.name }}</span>
                <NTooltip placement="top">
                  <template #trigger>
                    <span class="i-carbon-information text-sm opacity-50 cursor-help transition-opacity hover:opacity-100" style="color: var(--n-text-color-2)" @click.stop />
                  </template>
                  <div class="text-sm gap-x-4 gap-y-1.5 grid grid-cols-2">
                    <template v-if="task.min !== undefined">
                      <span style="color: var(--n-text-color-3)">最小</span>
                      <span class="font-medium" :style="{ fontFamily: appStore.numberFontFamily }">{{ Math.round(task.min) }} ms</span>
                    </template>
                    <template v-if="task.max !== undefined">
                      <span style="color: var(--n-text-color-3)">最大</span>
                      <span class="font-medium" :style="{ fontFamily: appStore.numberFontFamily }">{{ Math.round(task.max) }} ms</span>
                    </template>
                    <template v-if="task.avg !== undefined">
                      <span style="color: var(--n-text-color-3)">平均</span>
                      <span class="font-medium" :style="{ fontFamily: appStore.numberFontFamily }">{{ Math.round(task.avg) }} ms</span>
                    </template>
                    <template v-if="task.latest !== undefined">
                      <span style="color: var(--n-text-color-3)">最新</span>
                      <span class="font-medium" :style="{ fontFamily: appStore.numberFontFamily }">{{ Math.round(task.latest) }} ms</span>
                    </template>
                    <template v-if="task.p50 !== undefined">
                      <span style="color: var(--n-text-color-3)">P50</span>
                      <span class="font-medium" :style="{ fontFamily: appStore.numberFontFamily }">{{ Math.round(task.p50) }} ms</span>
                    </template>
                    <template v-if="task.p99 !== undefined">
                      <span style="color: var(--n-text-color-3)">P99</span>
                      <span class="font-medium" :style="{ fontFamily: appStore.numberFontFamily }">{{ Math.round(task.p99) }} ms</span>
                    </template>
                    <template v-if="task.p99_p50_ratio !== undefined">
                      <span style="color: var(--n-text-color-3)">波动率</span>
                      <span class="font-medium" :style="{ fontFamily: appStore.numberFontFamily }">{{ task.p99_p50_ratio.toFixed(2) }}</span>
                    </template>
                    <template v-if="task.interval !== undefined">
                      <span style="color: var(--n-text-color-3)">间隔</span>
                      <span class="font-medium" :style="{ fontFamily: appStore.numberFontFamily }">{{ task.interval }}s</span>
                    </template>
                    <template v-if="task.type">
                      <span style="color: var(--n-text-color-3)">类型</span>
                      <span class="font-medium" :style="{ fontFamily: appStore.numberFontFamily }">{{ task.type.toUpperCase() }}</span>
                    </template>
                    <template v-if="task.total !== undefined">
                      <span style="color: var(--n-text-color-3)">总数</span>
                      <span class="font-medium" :style="{ fontFamily: appStore.numberFontFamily }">{{ task.total }}</span>
                    </template>
                  </div>
                </NTooltip>
              </div>
              <div class="text-sm mt-1 flex gap-3 items-center ping-chart__values" style="color: var(--n-text-color-3)">
                <span class="font-medium" :style="{ fontFamily: appStore.numberFontFamily, color: 'var(--n-text-color-1)' }">{{ task.latestValue !== null ? `${Math.round(task.latestValue)} ms` : '-' }}</span>
                <span class="opacity-60">•</span>
                <span :style="{ fontFamily: appStore.numberFontFamily }">{{ task.loss.toFixed(1) }}% 丢包</span>
                <template v-if="task.p99_p50_ratio !== undefined">
                  <span class="opacity-60">•</span>
                  <span :style="{ fontFamily: appStore.numberFontFamily }" title="波动率 p99/p50">{{ task.p99_p50_ratio.toFixed(1) }} 波动</span>
                </template>
              </div>
            </div>
          </div>
        </div>

        <!-- 峰值裁剪开关 + 全选/全不选 -->
        <div class="flex flex-wrap gap-4 items-center">
          <div class="flex gap-2 items-center">
            <NSwitch v-model:value="cutPeak" size="small" />
            <span class="text-sm">平滑曲线</span>
            <NTooltip>
              <template #trigger>
                <span class="i-carbon-information text-sm opacity-50 cursor-help transition-opacity hover:opacity-100" style="color: var(--n-text-color-3)" />
              </template>
              <span>使用 EWMA 算法平滑数据并过滤突变值</span>
            </NTooltip>
          </div>
          <div class="flex gap-2 items-center">
            <NButton size="small" tertiary @click="showAllTasks">
              全选
            </NButton>
            <NButton size="small" tertiary @click="hideAllTasks">
              全不选
            </NButton>
            <NButton v-if="userYAxisMax !== null" size="small" type="primary" ghost @click="userYAxisMax = null">
              还原图表高度
            </NButton>
          </div>
        </div>

        <!-- 图表 -->
        <div class="h-80" :class="{ 'ping-chart--updating': updating }">
          <VChart ref="chartRef" :option="pingChartOption" autoresize @zr:click="handleChartClick" />
        </div>
      </template>
    </NSpin>
  </div>
</template>

<style scoped>
/* 默认任务卡片样式 */
.task-card-default {
  background-color: rgba(255, 255, 255, 0.9);
  border-radius: var(--n-border-radius);
  border: 1px solid rgba(0, 0, 0, 0.06);
}

html.dark .task-card-default {
  background-color: rgba(30, 30, 35, 0.95);
  border-color: rgba(255, 255, 255, 0.08);
}

/* 毛玻璃任务卡片样式 */
.glass-task-enabled {
  background-color: rgba(255, 255, 255, 0.7);
  border-radius: var(--n-border-radius);
}

html.dark .glass-task-enabled {
  background-color: rgba(24, 24, 28, 0.85);
}

/* 数据更新中的过渡效果 */
.ping-chart--updating {
  opacity: 0.6;
  transition: opacity 0.15s ease;
  pointer-events: none;
}

/* 数据值平滑过渡 */
.ping-chart__values span {
  transition: opacity 0.2s ease;
}
</style>
