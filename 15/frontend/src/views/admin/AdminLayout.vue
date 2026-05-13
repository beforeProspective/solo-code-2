<template>
  <div class="min-h-screen bg-gray-100 flex">
    <aside class="w-64 bg-gray-900 text-white flex-shrink-0">
      <div class="p-4 border-b border-gray-700">
        <h1 class="text-xl font-bold">管理后台</h1>
      </div>
      <nav class="p-4">
        <ul class="space-y-2">
          <li>
            <router-link
              to="/admin/dashboard"
              class="block px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors"
              :class="{ 'bg-gray-800': isActive('/admin/dashboard') }"
            >仪表盘</router-link>
          </li>
          <li>
            <router-link
              to="/admin/components"
              class="block px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors"
              :class="{ 'bg-gray-800': isActive('/admin/components') }"
            >组件管理</router-link>
          </li>
          <li>
            <router-link
              to="/admin/incidents"
              class="block px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors"
              :class="{ 'bg-gray-800': isActive('/admin/incidents') }"
            >事件管理</router-link>
          </li>
          <li>
            <router-link
              to="/admin/maintenances"
              class="block px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors"
              :class="{ 'bg-gray-800': isActive('/admin/maintenances') }"
            >维护计划</router-link>
          </li>
          <li>
            <router-link
              to="/admin/metrics"
              class="block px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors"
              :class="{ 'bg-gray-800': isActive('/admin/metrics') }"
            >指标管理</router-link>
          </li>
          <li>
            <router-link
              to="/admin/subscribers"
              class="block px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors"
              :class="{ 'bg-gray-800': isActive('/admin/subscribers') }"
            >订阅者</router-link>
          </li>
          <li>
            <router-link
              to="/admin/webhooks"
              class="block px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors"
              :class="{ 'bg-gray-800': isActive('/admin/webhooks') }"
            >Webhooks</router-link>
          </li>
          <li>
            <router-link
              to="/admin/theme"
              class="block px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors"
              :class="{ 'bg-gray-800': isActive('/admin/theme') }"
            >主题设置</router-link>
          </li>
        </ul>
      </nav>
      <div class="absolute bottom-0 w-64 p-4 border-t border-gray-700">
        <div class="text-sm text-gray-400 mb-2">{{ authStore.user?.name }}</div>
        <button
          @click="handleLogout"
          class="w-full text-left px-4 py-2 text-red-400 hover:bg-gray-800 rounded-lg transition-colors"
        >退出登录</button>
        <router-link
          to="/"
          class="block mt-2 text-center text-sm text-gray-400 hover:text-white"
        >查看公开页面</router-link>
      </div>
    </aside>

    <main class="flex-1 overflow-auto">
      <div class="p-6">
        <router-view />
      </div>
    </main>
  </div>
</template>

<script setup>
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const isActive = (path) => route.path === path

const handleLogout = async () => {
  await authStore.logout()
  router.push('/login')
}
</script>
