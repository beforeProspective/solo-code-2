<template>
  <div>
    <h1 class="text-2xl font-bold mb-6">订阅者管理</h1>

    <div class="bg-white rounded-lg shadow overflow-hidden">
      <table class="w-full">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">邮箱</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">状态</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">订阅时间</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200">
          <tr v-for="subscriber in adminStore.subscribers" :key="subscriber.id">
            <td class="px-6 py-4 text-gray-900">{{ subscriber.email }}</td>
            <td class="px-6 py-4">
              <span
                class="text-xs px-2 py-1 rounded"
                :class="subscriber.verified ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'"
              >
                {{ subscriber.verified ? '已验证' : '未验证' }}
              </span>
            </td>
            <td class="px-6 py-4 text-gray-600 text-sm">
              {{ formatDate(subscriber.created_at) }}
            </td>
            <td class="px-6 py-4">
              <button
                @click="deleteSubscriber(subscriber.id)"
                class="text-red-600 hover:text-red-800 text-sm"
              >移除</button>
            </td>
          </tr>
          <tr v-if="!adminStore.subscribers.length">
            <td colspan="4" class="px-6 py-8 text-center text-gray-500">
              暂无订阅者
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useAdminStore } from '@/stores/admin'

const adminStore = useAdminStore()

const formatDate = (date) => {
  if (!date) return ''
  return new Date(date).toLocaleString('zh-CN')
}

const deleteSubscriber = async (id) => {
  if (confirm('确定移除此订阅者？')) {
    try {
      await adminStore.deleteSubscriber(id)
      await adminStore.fetchSubscribers()
    } catch (e) {
      alert('移除失败')
    }
  }
}

onMounted(async () => {
  await adminStore.fetchSubscribers()
})
</script>
