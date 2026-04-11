<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import { NAlert, NDivider, NEmpty, NInput, NRadioButton, NRadioGroup, NTabPane, NTabs } from 'naive-ui'
import { computed, defineAsyncComponent, nextTick, onActivated, onDeactivated, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import { getRegionCode, getRegionDisplayName, isRegionMatch } from '@/utils/regionHelper'

// 定义组件名称，用于 KeepAlive 匹配
defineOptions({
  name: 'HomeView',
})

// 异步组件：按需加载，减少首屏体积
const NodeCard = defineAsyncComponent(() => import('@/components/NodeCard.vue'))
const NodeGeneralCards = defineAsyncComponent(() => import('@/components/NodeGeneralCards.vue'))
const NodeList = defineAsyncComponent(() => import('@/components/NodeList.vue'))

const appStore = useAppStore()
const nodesStore = useNodesStore()

const router = useRouter()

// 组件激活时恢复滚动位置
onActivated(() => {
  if (appStore.homeScrollPosition > 0) {
    // 使用 nextTick 确保 DOM 已渲染完成后再恢复滚动
    nextTick(() => {
      window.scrollTo({ top: appStore.homeScrollPosition, behavior: 'instant' })
    })
  }
})

// 组件失活时保存滚动位置
onDeactivated(() => {
  appStore.homeScrollPosition = window.scrollY
})

const searchText = ref('')
// 防抖后的搜索文本
const debouncedSearchText = ref('')

// 使用 VueUse 的 useDebounceFn 进行防抖，300ms 延迟
const updateDebouncedSearch = useDebounceFn((value: string) => {
  debouncedSearchText.value = value
}, 300)

// 监听原始搜索文本变化
watch(searchText, (value) => {
  updateDebouncedSearch(value)
})

const regionLanguage = computed(() => appStore.lang === 'en-US' ? 'en' : 'zh')
const groupCount = computed(() => Math.max(groupOptions.value.length - 1, 0))

const groupOptions = computed(() => {
  const allLabel = appStore.lang === 'zh-CN' ? '全部节点' : 'All Nodes'

  return [
    { tab: allLabel, name: 'all' },
    ...nodesStore.groups.map(group => ({
      tab: group,
      name: group,
    })),
  ]
})

// 计算是否应该显示分组 Tab
const showGroupTabs = computed(() => {
  if (appStore.nodeGroupingMode !== 'group') {
    return false
  }

  // 如果配置为单分组时隐藏，且只有一个分组（不含"全部节点"），则隐藏
  if (appStore.hideSingleGroupTab && groupCount.value <= 1) {
    return false
  }
  return true
})

// 验证当前选中的分组是否有效，无效则重置为 'all'
watch(
  () => groupOptions.value.map(group => group.name),
  (groups) => {
    if (appStore.nodeGroupingMode !== 'group')
      return

    const currentGroup = appStore.nodeSelectedGroup
    if (currentGroup !== 'all' && !groups.includes(currentGroup)) {
      appStore.nodeSelectedGroup = 'all'
    }
  },
  { immediate: true },
)

watch(
  () => appStore.nodeGroupingMode,
  (mode) => {
    if (mode !== 'group')
      return

    const validGroups = groupOptions.value.map(group => group.name)
    if (appStore.nodeSelectedGroup !== 'all' && !validGroups.includes(appStore.nodeSelectedGroup)) {
      appStore.nodeSelectedGroup = 'all'
    }
  },
)

/**
 * 检查节点是否匹配搜索词
 */
function isNodeMatchSearch(node: typeof nodesStore.nodes[number], search: string): boolean {
  if (!search.trim())
    return true

  const lowerSearch = search.toLowerCase().trim()

  // 搜索节点名称
  if (node.name.toLowerCase().includes(lowerSearch))
    return true

  // 搜索地区（使用 regionHelper 支持国家名称搜索）
  if (node.region && isRegionMatch(node.region, search))
    return true

  // 搜索操作系统
  if (node.os && node.os.toLowerCase().includes(lowerSearch))
    return true

  // 搜索分组
  if (node.group && node.group.toLowerCase().includes(lowerSearch))
    return true

  // 搜索标签
  if (node.tags && node.tags.toLowerCase().includes(lowerSearch))
    return true

  // 搜索备注
  if (node.remark && node.remark.toLowerCase().includes(lowerSearch))
    return true

  return false
}

function getRegionSectionName(region: string): string {
  if (!region || region === '__unknown__') {
    return appStore.lang === 'zh-CN' ? '未标注地区' : 'Unknown Region'
  }

  return getRegionDisplayName(region, regionLanguage.value)
}

const searchedNodes = computed(() => {
  if (!debouncedSearchText.value.trim()) {
    return nodesStore.nodes
  }

  return nodesStore.nodes.filter(node => isNodeMatchSearch(node, debouncedSearchText.value))
})

const nodeList = computed(() => {
  return appStore.nodeSelectedGroup === 'all'
    ? searchedNodes.value
    : searchedNodes.value.filter(node => node.group === appStore.nodeSelectedGroup)
})

const regionSections = computed(() => {
  const regionMap = new Map<string, Array<typeof nodesStore.nodes[number]>>()
  const orderIndex = new Map(appStore.regionDisplayOrder.map((region, index) => [region, index]))

  searchedNodes.value.forEach((node) => {
    const regionKey = node.region?.trim() || '__unknown__'
    if (!regionMap.has(regionKey)) {
      regionMap.set(regionKey, [])
    }
    regionMap.get(regionKey)!.push(node)
  })

  return Array.from(regionMap.entries())
    .sort(([regionA], [regionB]) => {
      if (regionA === '__unknown__')
        return 1
      if (regionB === '__unknown__')
        return -1

      const indexA = orderIndex.get(regionA) ?? Number.MAX_SAFE_INTEGER
      const indexB = orderIndex.get(regionB) ?? Number.MAX_SAFE_INTEGER

      if (indexA !== indexB) {
        return indexA - indexB
      }

      return getRegionSectionName(regionA).localeCompare(
        getRegionSectionName(regionB),
        appStore.lang === 'en-US' ? 'en' : 'zh-CN',
      )
    })
    .map(([region, nodes]) => ({
      key: region,
      emoji: region === '__unknown__' ? '' : region,
      name: getRegionSectionName(region),
      nodes,
    }))
})

function handleNodeClick(node: typeof nodesStore.nodes[number]) {
  router.push({ name: 'instance-detail', params: { id: node.uuid } })
}

// 是否启用背景模糊
const hasBackgroundBlur = computed(() => {
  return appStore.backgroundEnabled && appStore.cardBlurRadius > 0
})

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
  <div class="home-view">
    <div v-if="appStore.connectionError" class="alert px-4">
      <NAlert type="error" title="RPC 服务错误" show-icon>
        连接服务器失败，请检查网络设置或刷新页面后再试。
      </NAlert>
    </div>
    <!-- 自定义公告 -->
    <div v-if="appStore.alertEnabled && appStore.alertContent" class="alert px-4">
      <NAlert :type="appStore.alertType" :title="appStore.alertTitle || undefined" show-icon>
        <MarkdownRenderer :content="appStore.alertContent" />
      </NAlert>
    </div>
    <NodeGeneralCards />
    <NDivider class="my-0! px-4!" dashed />
    <div class="node-info p-4 flex flex-col gap-4">
      <div class="search flex gap-2 items-center">
        <NInput
          v-model:value="searchText"
          placeholder="搜索节点名称、地区、系统"
          class="search-input"
          :class="[{ 'glass-input-enabled': hasBackgroundBlur }, blurClass]"
        >
          <template #prefix>
            <div class="i-icon-park-outline-search" />
          </template>
        </NInput>
        <NRadioGroup v-model:value="appStore.nodeGroupingMode" class="grouping-selector">
          <NRadioButton value="group" class="grouping-selector-item">
            {{ appStore.lang === 'zh-CN' ? '分组' : 'Group' }}
          </NRadioButton>
          <NRadioButton value="region" class="grouping-selector-item">
            {{ appStore.lang === 'zh-CN' ? '地区' : 'Region' }}
          </NRadioButton>
        </NRadioGroup>
        <NRadioGroup v-model:value="appStore.nodeViewMode" class="view-selector">
          <NRadioButton value="card" class="view-selector-item">
            <div class="i-icon-park-outline-view-grid-card" />
          </NRadioButton>
          <NRadioButton value="list" class="view-selector-item">
            <div class="i-icon-park-outline-view-list" />
          </NRadioButton>
        </NRadioGroup>
      </div>
      <div class="nodes">
        <template v-if="appStore.nodeGroupingMode === 'region'">
          <div v-if="regionSections.length !== 0" class="region-sections">
            <section v-for="section in regionSections" :key="section.key" class="region-section">
              <div class="region-section__header">
                <div class="region-section__title">
                  <img
                    v-if="section.emoji"
                    class="region-section__flag"
                    :src="`/images/flags/${getRegionCode(section.emoji)}.svg`"
                    :alt="section.name"
                  >
                  <span>{{ section.name }}</span>
                </div>
                <span class="region-section__meta">
                  {{ section.nodes.length }}{{ appStore.lang === 'zh-CN' ? ' 台' : ' nodes' }}
                </span>
              </div>
              <div v-if="appStore.nodeViewMode === 'card'" class="node-grid">
                <NodeCard v-for="node in section.nodes" :key="node.uuid" :node="node" @click="handleNodeClick(node)" />
              </div>
              <NodeList v-else :nodes="section.nodes" @click="handleNodeClick" />
            </section>
          </div>
          <div v-else class="text-gray-500 text-center">
            <NEmpty description="暂无节点" />
          </div>
        </template>
        <template v-else-if="showGroupTabs">
          <NTabs v-model:value="appStore.nodeSelectedGroup" animated>
            <NTabPane v-for="group in groupOptions" :key="group.name" :tab="group.tab" :name="group.name">
              <div v-if="nodeList.length !== 0 && appStore.nodeViewMode === 'card'" class="node-grid">
                <NodeCard v-for="node in nodeList" :key="node.uuid" :node="node" @click="handleNodeClick(node)" />
              </div>
              <NodeList v-else-if="nodeList.length !== 0 && appStore.nodeViewMode === 'list'" :nodes="nodeList" @click="handleNodeClick" />
              <div v-else class="text-gray-500 text-center">
                <NEmpty description="暂无节点" />
              </div>
            </NTabPane>
          </NTabs>
        </template>
        <template v-else>
          <div v-if="nodeList.length !== 0 && appStore.nodeViewMode === 'card'" class="node-grid">
            <NodeCard v-for="node in nodeList" :key="node.uuid" :node="node" @click="handleNodeClick(node)" />
          </div>
          <NodeList v-else-if="nodeList.length !== 0 && appStore.nodeViewMode === 'list'" :nodes="nodeList" @click="handleNodeClick" />
          <div v-else class="text-gray-500 text-center">
            <NEmpty description="暂无节点" />
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.node-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: 1fr;
}

.region-sections {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.region-section {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.region-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding-inline: 0.15rem;
}

.region-section__title {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 1rem;
  font-weight: 700;
  color: var(--n-text-color-1);
}

.region-section__flag {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
  object-fit: contain;
  border-radius: 3px;
}

.region-section__meta {
  flex-shrink: 0;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--n-text-color-3);
}

.grouping-selector :deep(.n-radio__label),
.view-selector :deep(.n-radio__label) {
  width: 100%;
  height: 100%;

  display: flex;
  align-items: center;
  justify-content: center;
}

.search-input {
  min-width: 0;
  flex: 1 1 18rem;
}

.grouping-selector,
.view-selector {
  flex-shrink: 0;
}

/* 毛玻璃搜索框样式 */
.glass-input-enabled {
  background-color: rgba(255, 255, 255, 0.7) !important;
  border-radius: var(--n-border-radius);
}

html.dark .glass-input-enabled {
  background-color: rgba(24, 24, 28, 0.85) !important;
}

@media (min-width: 640px) {
  .node-grid {
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  }
}

@media (max-width: 640px) {
  .search {
    flex-wrap: wrap;
    align-items: stretch;
  }

  .search-input {
    flex-basis: 100%;
  }

  .region-sections {
    gap: 1rem;
  }

  .region-section {
    gap: 0.75rem;
  }

  .region-section__header {
    padding-inline: 0;
  }

  .region-section__title {
    font-size: 0.95rem;
  }
}
</style>
