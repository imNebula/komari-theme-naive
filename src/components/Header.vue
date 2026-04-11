<script setup lang="ts">
import { NAvatar, NButton, NFlex, NH3, NPopover } from 'naive-ui'
import { computed, h, inject, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import LoginDialog from './LoginDialog.vue'

const router = useRouter()
const appStore = useAppStore()

// 从 Provider 注入滚动状态
const isScrolled = inject<ReturnType<typeof ref<boolean>>>('isScrolled', ref(false))

const siteFavicon = ref('/favicon.ico')

// 计算页面容器的样式
const containerStyle = computed(() => {
  if (appStore.fullWidth) {
    return {}
  }
  return {
    maxWidth: appStore.maxPageWidth,
    marginInline: 'auto',
  }
})

const actionButtons = computed(() => {
  const buttons = [
    ...(appStore.financeWidgetEnabled
      ? [{
          title: '资产统计',
          label: '资产',
          icon: 'finance',
          action: 'toggleFinancePanel',
          disabled: false,
          active: appStore.financePanelVisible,
        }]
      : []),
    {
      title: appStore.themeMode === 'auto' ? '自动主题' : appStore.themeMode === 'light' ? '浅色主题' : '深色主题',
      label: '主题',
      icon: appStore.themeMode === 'auto' ? 'i-icon-park-outline-dark-mode' : appStore.themeMode === 'light' ? 'i-icon-park-outline-sun-one' : 'i-icon-park-outline-moon',
      action: 'toggleTheme',
      disabled: false,
      active: false,
    },
  ]

  // 已登录时显示设置按钮，未登录时根据配置决定是否显示登录按钮
  if (appStore.isLoggedIn) {
    buttons.push({
      title: '后台管理',
      label: '管理',
      icon: 'i-icon-park-outline-setting',
      action: 'jumpToSetting',
      disabled: false,
      active: false,
    })
  }
  else if (appStore.showLoginButton) {
    buttons.push({
      title: '登录',
      label: '登录',
      icon: 'i-icon-park-outline-login',
      action: 'openLoginDialog',
      disabled: false,
      active: false,
    })
  }

  return buttons
})

function handleButtonClick(action: string) {
  switch (action) {
    case 'toggleTheme':
      appStore.updateThemeMode()
      break
    case 'toggleFinancePanel':
      appStore.toggleFinancePanel()
      break
    case 'jumpToSetting':
      // 设置页由 Server 提供，不能使用无极路由
      location.href = '/admin'
      break
    case 'openLoginDialog':
      window.$modal.create({
        title: '登录',
        preset: 'dialog',
        showIcon: false,
        content: () => h(LoginDialog),
      })
      break
  }
}
</script>

<template>
  <div class="header-bar transition-all duration-200 top-0 position-sticky z-10" :class="{ 'header-bar--scrolled': isScrolled }">
    <div class="px-4 flex-between h-16" :style="containerStyle">
      <NFlex class="flex-center cursor-pointer" @click="router.push('/')">
        <NAvatar :src="siteFavicon" round />
        <NH3 class="m-0">
          {{ appStore.publicSettings?.sitename || 'Komari Monitor' }}
        </NH3>
      </NFlex>
      <NFlex class="header-actions flex gap-3">
        <NPopover v-for="button in actionButtons" :key="button.action" :disabled="button.disabled">
          <template #trigger>
            <NButton
              :disabled="button.disabled"
              quaternary
              class="header-action-btn" :class="[
                { 'header-action-btn--active': button.active, 'header-action-btn--finance': button.action === 'toggleFinancePanel' },
              ]"
              @click="handleButtonClick(button.action)"
            >
              <span v-if="button.action === 'toggleFinancePanel'" class="header-action-btn__finance-badge">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
                  <path d="M12 18V6" />
                </svg>
              </span>
              <div v-else :class="button.icon" class="header-action-btn__icon" />
              <span class="header-action-btn__label">{{ button.label }}</span>
            </NButton>
          </template>
          <template #default>
            {{ button.title }}
          </template>
        </NPopover>
      </NFlex>
    </div>
  </div>
</template>

<style scoped lang="scss">
.header-bar {
  background: transparent;
}

.header-bar--scrolled {
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
}

html.dark .header-bar--scrolled {
  background: rgba(24, 24, 28, 0.72);
}

.header-actions {
  align-items: center;
}

.header-action-btn {
  min-width: 3rem;
  height: 2.5rem;
  padding: 0 0.875rem;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 999px;
  background: color-mix(in srgb, var(--n-color) 88%, transparent);
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.08);
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
  font-weight: 600;
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

.header-action-btn--active {
  border-color: color-mix(in srgb, var(--primary-color) 28%, rgba(148, 163, 184, 0.18));
  background: color-mix(in srgb, var(--primary-color) 8%, var(--n-color));
  color: var(--primary-color);
}

.header-action-btn--finance {
  padding-inline: 0.75rem 0.95rem;
}

.header-action-btn__icon {
  font-size: 1rem;
}

.header-action-btn__finance-badge {
  width: 1.4rem;
  height: 1.4rem;
  border: 1.5px solid color-mix(in srgb, var(--primary-color) 48%, rgba(148, 163, 184, 0.12));
  border-radius: 999px;
  color: var(--primary-color);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.header-action-btn__finance-badge svg {
  width: 0.92rem;
  height: 0.92rem;
}

.header-action-btn__label {
  font-size: 0.875rem;
  line-height: 1;
}

@media (max-width: 640px) {
  .header-actions {
    gap: 0.375rem;
  }

  .header-action-btn {
    width: 2.375rem;
    min-width: 2.375rem;
    height: 2.375rem;
    padding: 0;
    justify-content: center;
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);
  }

  .header-action-btn__icon {
    font-size: 0.95rem;
  }

  .header-action-btn--finance {
    padding: 0;
  }

  .header-action-btn__finance-badge {
    width: 1.3rem;
    height: 1.3rem;
  }

  .header-action-btn__label {
    display: none;
  }
}
</style>
