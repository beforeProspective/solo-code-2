<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold">维护计划</h1>
      <button
        @click="showModal = true"
        class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
      >+ 新建维护</button>
    </div>

    <div class="bg-white rounded-lg shadow overflow-hidden">
      <table class="w-full">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">标题</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">状态</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">计划时间</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200">
          <tr v-for="maintenance in adminStore.maintenances" :key="maintenance.id">
            <td class="px-6 py-4">
              <div class="font-medium text-gray-900">{{ maintenance.title }}</div>
            </td>
            <td class="px-6 py-4">
              <span
                class="text-xs px-2 py-1 rounded"
                :class="statusClass(maintenance.status)"
              >{{ statusText(maintenance.status) }}</span>
            </td>
            <td class="px-6 py-4 text-gray-600 text-sm">
              {{ formatDate(maintenance.scheduled_at) }}
            </td>
            <td class="px-6 py-4">
              <button
                @click="deleteMaintenance(maintenance.id)"
                class="text-red-600 hover:text-red-800 text-sm"
              >删除</button>
            </td>
          </tr>
          <tr v-if="!adminStore.maintenances.length">
            <td colspan="4" class="px-6 py-8 text-center text-gray-500">
              暂无维护计划
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div
      v-if="showModal"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
    >
      <div class="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
        <h2 class="text-xl font-bold mb-4">新建维护计划</h2>
        <form @submit.prevent="saveMaintenance">
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-1">标题</label>
            <input v-model="form.title" type="text" class="w-full px-3 py-2 border rounded-lg" required />
          </div>
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-1">描述</label>
            <textarea v-model="form.description" rows="3" class="w-full px-3 py-2 border rounded-lg"></textarea>
          </div>
          <div class="mb-6">
            <label class="block text-sm font-medium text-gray-700 mb-1">计划时间</label>
            <input
              v-model="form.scheduled_at"
              type="datetime-local"
              class="w-full px-3 py-2 border rounded-lg"
            />
          </div>
          <div class="flex justify-end gap-3">
            <button
              type="button"
              @click="showModal = false"
              class="px-4 py-2 text-gray-600 hover:text-gray-800"
            >取消</button>
            <button
              type="submit"
              class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >创建</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useAdminStore } from '@/stores/admin'

const adminStore = useAdminStore()

const showModal = ref(false)
const form = ref({
  title: '',
  description: '',
  scheduled_at: ''
})

const statusClass = (status) => {
  if (status === 'resolved') return 'bg-green-100 text-green-800'
  if (status === 'monitoring') return 'bg-blue-100 text-blue-800'
  return 'bg-yellow-100 text-yellow-800'
}

const statusText = (status) => {
  if (status === 'resolved') return '已完成'
  if (status === 'monitoring') return '进行中'
  if (status === 'identified') return '进行中'
  if (status === 'investigating') return '计划中'
  return status
}

const formatDate = (date) => {
  if (!date) return '-'
  return new Date(date).toLocaleString('zh-CN')
}

const saveMaintenance = async () => {
  try {
    await adminStore.createIncident({
      ...form.value,
      is_maintenance: true,
      status: 'investigating'
    })
    await adminStore.fetchIncidents(true)
    showModal.value = false
    form.value = { title: '', description: '', scheduled_at: '' }
  } catch (e) {
    alert('创建失败')
  }
}

const deleteMaintenance = async (id) => {
  if (confirm('确定删除此维护计划？')) {
    try {
      await adminStore.deleteIncident(id)
      await adminStore.fetchIncidents(true)
    } catch (e) {
      alert('删除失败')
    }
  }
}

onMounted(async () => {
  await adminStore.fetchIncidents(true)
})
</script>
