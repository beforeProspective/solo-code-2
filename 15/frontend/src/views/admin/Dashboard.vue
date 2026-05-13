<template>
  <div>
    <h1 class="text-2xl font-bold mb-6">仪表盘</h1>

    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
      <div class="bg-white rounded-lg shadow p-6">
        <div class="text-sm text-gray-500">总组件数</div>
        <div class="text-3xl font-bold text-gray-800 mt-2">
          {{ adminStore.stats?.components?.total || 0 }}
        </div>
      </div>
      <div class="bg-white rounded-lg shadow p-6">
        <div class="text-sm text-gray-500">正常运行</div>
        <div class="text-3xl font-bold text-green-600 mt-2">
          {{ adminStore.stats?.components?.operational || 0 }}
        </div>
      </div>
      <div class="bg-white rounded-lg shadow p-6">
        <div class="text-sm text-gray-500">进行中事件</div>
        <div class="text-3xl font-bold text-yellow-600 mt-2">
          {{ adminStore.stats?.incidents?.open || 0 }}
        </div>
      </div>
      <div class="bg-white rounded-lg shadow p-6">
        <div class="text-sm text-gray-500">订阅者</div>
        <div class="text-3xl font-bold text-blue-600 mt-2">
          {{ adminStore.stats?.subscribers || 0 }}
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="bg-white rounded-lg shadow p-6">
        <h2 class="text-lg font-semibold mb-4">最近事件</h2>
        <div class="space-y-3">
          <div
            v-for="incident in adminStore.stats?.recent_incidents?.slice(0, 5) || []"
            :key="incident.id"
            class="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
          >
            <span class="text-gray-800">{{ incident.title }}</span>
            <span
              class="text-xs px-2 py-1 rounded"
              :class="incidentStatusClass(incident.status)"
            >{{ incidentStatusText(incident.status) }}</span>
          </div>
          <div v-if="!adminStore.stats?.recent_incidents?.length" class="text-gray-500 text-center py-4">
            暂无事件
          </div>
        </div>
      </div>

      <div class="bg-white rounded-lg shadow p-6">
        <h2 class="text-lg font-semibold mb-4">组件状态概览</h2>
        <div class="space-y-3">
          <div class="flex items-center justify-between p-3 bg-green-50 rounded-lg">
            <span class="text-green-800">正常运行</span>
            <span class="text-green-600 font-medium">
              {{ adminStore.stats?.components?.operational || 0 }}
            </span>
          </div>
          <div class="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
            <span class="text-yellow-800">性能下降</span>
            <span class="text-yellow-600 font-medium">
              {{ adminStore.stats?.components?.degraded || 0 }}
            </span>
          </div>
          <div class="flex items-center justify-between p-3 bg-red-50 rounded-lg">
            <span class="text-red-800">故障</span>
            <span class="text-red-600 font-medium">
              {{ adminStore.stats?.components?.outage || 0 }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useAdminStore } from '@/stores/admin'

const adminStore = useAdminStore()

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

onMounted(async () => {
  await adminStore.fetchStats()
})
</script>
