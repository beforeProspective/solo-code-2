<template>
  <div class="min-h-screen bg-gray-50">
    <header class="bg-gray-900 text-white py-6">
      <div class="max-w-4xl mx-auto px-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <h1 class="text-2xl font-bold">{{ statusStore.theme.site_name || 'Status Page' }}</h1>
        </div>
        <div class="flex items-center gap-4">
          <router-link to="/login" class="text-sm text-gray-300 hover:text-white">管理后台</router-link>
        </div>
      </div>
    </header>

    <main class="max-w-4xl mx-auto px-4 py-8">
      <div class="mb-8">
        <div
          :class="[
            'p-6 rounded-lg text-white',
            statusColor
          ]"
        >
          <div class="flex items-center gap-3">
            <span class="text-3xl">{{ statusIcon }}</span>
            <div>
              <h2 class="text-xl font-bold">{{ statusText }}</h2>
              <p class="text-sm opacity-80">{{ statusDescription }}</p>
            </div>
          </div>
        </div>
      </div>

      <div v-if="statusStore.openIncidents.length > 0" class="mb-8">
        <h3 class="text-lg font-semibold mb-4 text-gray-800">当前事件</h3>
        <div class="space-y-4">
          <div
            v-for="incident in statusStore.openIncidents"
            :key="incident.id"
            class="bg-white rounded-lg shadow p-6 border-l-4"
            :class="incidentBorderColor(incident)"
          >
            <div class="flex items-start justify-between mb-3">
              <h4 class="font-semibold text-gray-800">{{ incident.title }}</h4>
              <span
                class="text-xs px-2 py-1 rounded"
                :class="incidentStatusClass(incident.status)"
              >{{ incidentStatusText(incident.status) }}</span>
            </div>
            <p v-if="incident.updates?.length > 0" class="text-sm text-gray-600 mb-3">
              {{ incident.updates[0].content }}
            </p>
            <div v-if="incident.components?.length > 0" class="flex flex-wrap gap-2">
              <span
                v-for="comp in incident.components"
                :key="comp.id"
                class="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded"
              >{{ comp.component?.name }}</span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="statusStore.scheduledMaintenances.length > 0" class="mb-8">
        <h3 class="text-lg font-semibold mb-4 text-gray-800">计划维护</h3>
        <div class="space-y-4">
          <div
            v-for="maintenance in statusStore.scheduledMaintenances"
            :key="maintenance.id"
            class="bg-blue-50 rounded-lg p-4 border border-blue-200"
          >
            <h4 class="font-medium text-blue-900">{{ maintenance.title }}</h4>
            <p class="text-sm text-blue-700 mt-1">
              计划于: {{ formatDate(maintenance.scheduled_at) }}
            </p>
          </div>
        </div>
      </div>

      <div class="mb-8">
        <h3 class="text-lg font-semibold mb-4 text-gray-800">组件状态</h3>
        <div class="space-y-6">
          <div v-for="(components, group) in statusStore.groupedComponents" :key="group">
            <h4 class="text-sm font-medium text-gray-500 mb-2 uppercase tracking-wide">{{ group }}</h4>
            <div class="bg-white rounded-lg shadow divide-y">
              <div
                v-for="component in components"
                :key="component.id"
                class="flex items-center justify-between p-4"
              >
                <span class="text-gray-800">{{ component.name }}</span>
                <span
                  class="flex items-center gap-2 text-sm font-medium"
                  :class="componentStatusTextColor(component.status)"
                >
                  <span class="w-2 h-2 rounded-full" :class="componentStatusColor(component.status)"></span>
                  {{ componentStatusText(component.status) }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="statusStore.pastIncidents.length > 0" class="mb-8">
        <h3 class="text-lg font-semibold mb-4 text-gray-800">历史事件</h3>
        <div class="bg-white rounded-lg shadow divide-y">
          <div
            v-for="incident in statusStore.pastIncidents.slice(0, 10)"
            :key="incident.id"
            class="p-4"
          >
            <div class="flex items-center justify-between">
              <span class="text-gray-800">{{ incident.title }}</span>
              <span class="text-sm text-gray-500">{{ formatDate(incident.resolved_at) }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-lg shadow p-6">
        <h3 class="text-lg font-semibold mb-4 text-gray-800">订阅通知</h3>
        <form @submit.prevent="subscribe" class="flex gap-2">
          <input
            v-model="subscribeEmail"
            type="email"
            placeholder="输入您的邮箱"
            class="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            required
          />
          <button
            type="submit"
            class="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >订阅</button>
        </form>
        <p v-if="subscribeMessage" class="mt-2 text-sm" :class="subscribeError ? 'text-red-600' : 'text-green-600'">
          {{ subscribeMessage }}
        </p>
      </div>
    </main>

    <footer class="bg-gray-100 py-4 mt-12">
      <div class="max-w-4xl mx-auto px-4 text-center text-sm text-gray-600">
        {{ statusStore.theme.footer_text || '© 2024 Status Page' }}
      </div>
    </footer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useStatusStore } from '@/stores/status'
import api from '@/api'

const statusStore = useStatusStore()
const subscribeEmail = ref('')
const subscribeMessage = ref('')
const subscribeError = ref(false)

const statusColor = computed(() => {
  const status = statusStore.status
  if (status === 'operational') return 'bg-green-500'
  if (status === 'degraded') return 'bg-yellow-500'
  if (status === 'major_outage') return 'bg-red-500'
  return 'bg-green-500'
})

const statusIcon = computed(() => {
  const status = statusStore.status
  if (status === 'operational') return '✓'
  if (status === 'degraded') return '!'
  if (status === 'major_outage') return '✗'
  return '✓'
})

const statusText = computed(() => {
  const status = statusStore.status
  if (status === 'operational') return '所有系统正常运行'
  if (status === 'degraded') return '部分系统性能下降'
  if (status === 'major_outage') return '主要系统故障'
  return '所有系统正常运行'
})

const statusDescription = computed(() => {
  const status = statusStore.status
  if (status === 'operational') return '没有检测到问题'
  if (status === 'degraded') return '我们正在调查这些问题'
  if (status === 'major_outage') return '我们正在紧急修复这些问题'
  return '没有检测到问题'
})

const incidentBorderColor = (incident) => {
  const impact = incident.impact
  if (impact === 'critical' || impact === 'major') return 'border-red-500'
  if (impact === 'minor') return 'border-yellow-500'
  return 'border-blue-500'
}

const incidentStatusClass = (status) => {
  if (status === 'resolved') return 'bg-green-100 text-green-800'
  if (status === 'monitoring') return 'bg-blue-100 text-blue-800'
  if (status === 'identified') return 'bg-yellow-100 text-yellow-800'
  return 'bg-red-100 text-red-800'
}

const incidentStatusText = (status) => {
  if (status === 'resolved') return '已解决'
  if (status === 'monitoring') return '监控中'
  if (status === 'identified') return '已确认'
  if (status === 'investigating') return '调查中'
  return status
}

const componentStatusColor = (status) => {
  if (status === 'operational') return 'bg-green-500'
  if (status === 'degraded') return 'bg-yellow-500'
  if (status === 'partial_outage') return 'bg-orange-500'
  if (status === 'major_outage') return 'bg-red-500'
  return 'bg-green-500'
}

const componentStatusTextColor = (status) => {
  if (status === 'operational') return 'text-green-600'
  if (status === 'degraded') return 'text-yellow-600'
  if (status === 'partial_outage') return 'text-orange-600'
  if (status === 'major_outage') return 'text-red-600'
  return 'text-green-600'
}

const componentStatusText = (status) => {
  if (status === 'operational') return '正常运行'
  if (status === 'degraded') return '性能下降'
  if (status === 'partial_outage') return '部分故障'
  if (status === 'major_outage') return '完全故障'
  return status
}

const formatDate = (dateStr) => {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleString('zh-CN')
}

const subscribe = async () => {
  try {
    await api.post('/subscribe', { email: subscribeEmail.value })
    subscribeMessage.value = '订阅成功！'
    subscribeError.value = false
    subscribeEmail.value = ''
  } catch (e) {
    subscribeMessage.value = e.response?.data?.message || '订阅失败'
    subscribeError.value = true
  }
}

onMounted(async () => {
  await Promise.all([
    statusStore.fetchStatus(),
    statusStore.fetchTheme()
  ])
})
</script>
