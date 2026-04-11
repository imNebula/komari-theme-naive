<script setup lang="ts">
import type { CSSProperties } from 'vue'
import { useThemeVars } from 'naive-ui'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useAppStore } from '@/stores/app'

interface VisitorInfo {
  ip: string
  country: string
  countryCode: string
  isp: string
}

const appStore = useAppStore()
const themeVars = useThemeVars()

const visible = ref(false)
const loading = ref(true)
const dismissed = ref(false)
const visitorInfo = ref<VisitorInfo | null>(null)

let showTimer: ReturnType<typeof setTimeout> | null = null
let hideTimer: ReturnType<typeof setTimeout> | null = null

const capsuleStyle = computed<CSSProperties>(() => ({
  '--capsule-bg': appStore.isDark ? 'rgba(24, 24, 28, 0.84)' : 'rgba(255, 255, 255, 0.82)',
  '--capsule-border': appStore.isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(15, 23, 42, 0.08)',
  '--capsule-shadow': appStore.isDark
    ? '0 18px 40px rgba(0, 0, 0, 0.35)'
    : '0 18px 40px rgba(15, 23, 42, 0.14)',
  '--capsule-text': themeVars.value.textColor2,
  '--capsule-muted': themeVars.value.textColor3,
  '--capsule-accent': themeVars.value.primaryColor,
  '--capsule-close-bg': appStore.isDark ? 'rgba(251, 113, 133, 0.22)' : 'rgba(251, 113, 133, 0.16)',
  '--capsule-close-bg-hover': appStore.isDark ? 'rgba(251, 113, 133, 0.36)' : 'rgba(251, 113, 133, 0.26)',
  '--capsule-close-border': appStore.isDark ? 'rgba(251, 113, 133, 0.28)' : 'rgba(251, 113, 133, 0.18)',
  '--capsule-close-text': themeVars.value.errorColor,
}))

const fallbackText = computed(() => {
  return appStore.lang === 'zh-CN'
    ? '欢迎回来，当前网络信息暂不可用'
    : 'Welcome back, network info is unavailable'
})

const flagUrl = computed(() => {
  const code = visitorInfo.value?.countryCode?.toLowerCase()
  if (!code || code === 'un')
    return ''
  return `https://flagcdn.com/w80/${code}.png`
})

function cleanupTimers() {
  if (showTimer) {
    clearTimeout(showTimer)
    showTimer = null
  }

  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
}

async function fetchJsonWithTimeout(url: string, timeout = 4000) {
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

async function fetchFirstAvailable(urls: string[]) {
  let lastError: unknown = null

  for (const url of urls) {
    try {
      return await fetchJsonWithTimeout(url)
    }
    catch (error) {
      lastError = error
    }
  }

  throw lastError ?? new Error('All visitor info requests failed')
}

async function loadVisitorInfo() {
  try {
    const response = await fetchFirstAvailable([
      'https://ipapi.co/json/',
      'https://api.ip.sb/geoip',
      'https://ipwho.is/',
    ])

    const ip = response.ip
    if (!ip)
      throw new Error('Missing IP')

    visitorInfo.value = {
      ip,
      country: response.country_name || response.country || 'Global',
      countryCode: response.country_code || response.countryCode || 'UN',
      isp: (response.org || response.isp || response.asn_organization || response.connection?.isp || 'Internet')
        .replace(/^AS\d+\s*-?\s*/i, '')
        .trim(),
    }
  }
  catch (error) {
    console.warn('[VisitorCapsule] Failed to fetch visitor info:', error)
  }
  finally {
    loading.value = false

    showTimer = setTimeout(() => {
      if (!dismissed.value)
        visible.value = true
    }, 1000)

    if (appStore.visitorCapsuleAutoHideSeconds > 0) {
      hideTimer = setTimeout(() => {
        visible.value = false
      }, (appStore.visitorCapsuleAutoHideSeconds + 1) * 1000)
    }
  }
}

function closeCapsule() {
  dismissed.value = true
  visible.value = false
}

onMounted(() => {
  loadVisitorInfo()
})

onBeforeUnmount(() => {
  cleanupTimers()
})
</script>

<template>
  <Transition name="visitor-capsule">
    <div v-if="visible" class="visitor-capsule" :style="capsuleStyle">
      <button class="visitor-capsule__close" type="button" aria-label="Close visitor capsule" @click="closeCapsule">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      <div class="visitor-capsule__flag">
        <img
          v-if="flagUrl"
          :src="flagUrl"
          :alt="visitorInfo?.country || 'Flag'"
        >
        <div v-else class="i-icon-park-outline-world visitor-capsule__fallback-icon" />
      </div>

      <div class="visitor-capsule__content">
        <template v-if="visitorInfo">
          <span class="visitor-capsule__segment">
            <span class="visitor-capsule__label visitor-capsule__label--accent">IP:</span>
            <span class="visitor-capsule__mono">{{ visitorInfo.ip }}</span>
          </span>
          <span class="visitor-capsule__divider" aria-hidden="true" />
          <span class="visitor-capsule__segment">
            <span class="visitor-capsule__full-name">{{ visitorInfo.country }}</span>
            <span class="visitor-capsule__short-name">{{ visitorInfo.countryCode }}</span>
          </span>
          <span class="visitor-capsule__divider" aria-hidden="true" />
          <span class="visitor-capsule__segment visitor-capsule__segment--truncate" :title="visitorInfo.isp">
            {{ visitorInfo.isp }}
          </span>
        </template>
        <span v-else class="visitor-capsule__fallback-text">
          {{ loading ? 'Loading...' : fallbackText }}
        </span>
      </div>
    </div>
  </Transition>
</template>

<style scoped lang="scss">
.visitor-capsule {
  position: fixed;
  left: 50%;
  top: 1.5rem;
  z-index: 1100;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: fit-content;
  max-width: min(95vw, 52rem);
  padding: 0.65rem 1rem 0.65rem 0.85rem;
  border: 1px solid var(--capsule-border);
  border-radius: 1.15rem;
  background: var(--capsule-bg);
  color: var(--capsule-text);
  box-shadow: var(--capsule-shadow);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  transform: translateX(-50%);
}

.visitor-capsule__close {
  flex-shrink: 0;
  width: 1.5rem;
  height: 1.5rem;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--capsule-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0.5;
  transition:
    opacity 0.2s ease,
    transform 0.2s ease,
    background-color 0.2s ease;
}

.visitor-capsule__close:hover {
  opacity: 1;
  background: color-mix(in srgb, var(--capsule-muted) 12%, transparent);
  transform: rotate(90deg);
}

.visitor-capsule__close svg {
  width: 0.65rem;
  height: 0.65rem;
}

.visitor-capsule__flag {
  width: 1.65rem;
  height: 1.65rem;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.12);
}

.visitor-capsule__flag img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.visitor-capsule__fallback-icon {
  font-size: 1rem;
  opacity: 0.78;
}

.visitor-capsule__content {
  min-width: 0;
  flex: 1;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  white-space: nowrap;
}

.visitor-capsule__segment {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.8125rem;
  line-height: 1.4;
}

.visitor-capsule__segment--truncate {
  max-width: min(15rem, 36vw);
  overflow: hidden;
  text-overflow: ellipsis;
}

.visitor-capsule__label {
  font-weight: 600;
  color: var(--capsule-muted);
}

.visitor-capsule__label--accent {
  color: var(--capsule-accent);
}

.visitor-capsule__mono {
  font-family: var(--n-font-family-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 18rem;
}

.visitor-capsule__divider {
  width: 1px;
  height: 0.75rem;
  flex-shrink: 0;
  background: color-mix(in srgb, var(--capsule-muted) 35%, transparent);
}

.visitor-capsule__short-name {
  display: none;
}

.visitor-capsule__fallback-text {
  font-size: 0.8125rem;
  color: var(--capsule-muted);
}

.visitor-capsule-enter-active,
.visitor-capsule-leave-active {
  transition:
    opacity 0.5s ease,
    transform 0.5s ease,
    visibility 0.5s ease;
}

.visitor-capsule-enter-from,
.visitor-capsule-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-3rem);
}

.visitor-capsule-enter-to,
.visitor-capsule-leave-from {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

@media (max-width: 768px) {
  .visitor-capsule {
    top: 0.75rem;
    padding: 0.55rem 0.85rem 0.55rem 0.75rem;
  }

  .visitor-capsule__content {
    gap: 0.375rem;
  }

  .visitor-capsule__segment {
    font-size: 0.75rem;
  }

  .visitor-capsule__segment--truncate {
    max-width: 7.5rem;
  }

  .visitor-capsule__full-name {
    display: none;
  }

  .visitor-capsule__short-name {
    display: inline;
  }

  .visitor-capsule__mono {
    max-width: min(9rem, 28vw);
  }
}

@media (max-width: 480px) {
  .visitor-capsule {
    max-width: 94vw;
    gap: 0.625rem;
  }

  .visitor-capsule__flag {
    width: 1.5rem;
    height: 1.5rem;
  }

  .visitor-capsule__segment--truncate {
    max-width: 5.5rem;
  }

  .visitor-capsule__mono {
    max-width: min(7rem, 24vw);
  }
}
</style>
