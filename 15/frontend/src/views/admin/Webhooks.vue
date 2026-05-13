<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold">Webhook 管理</h1>
      <button
        @click="showModal = true"
        class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
      >+ 新建 Webhook</button>
    </div>

    <div class="bg-white rounded-lg shadow overflow-hidden">
      <table class="w-full">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">URL</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">事件</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">状态</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200">
          <tr v-for="webhook in adminStore.webhooks" :key="webhook.id">
            <td class="px-6 py-4 text-gray-900 font-mono text-sm">{{ webhook.url }}</td>
            <td class="px-6 py-4">
              <div class="flex flex-wrap gap-1">
                <span
                  v-for="event in webhook.events"
                  :key="event"
                  class="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded"
                >{{ event }}</span>
              </div>
            </td>
            <td class="px-6 py-4">
              <button
                @click="toggleActive(webhook)"
                class="text-sm"
                :class="webhook.active ? 'text-green-600' : 'text-gray-400'"
              >
                {{ webhook.active ? '启用' : '禁用' }}
              </button>
            </td>
            <td class="px-6 py-4">
              <button
                @click="deleteWebhook(webhook.id)"
                class="text-red-600 hover:text-red-800 text-sm"
              >删除</button>
            </td>
          </tr>
          <tr v-if="!adminStore.webhooks.length">
            <td colspan="4" class="px-6 py-8 text-center text-gray-500">
              暂无 Webhook
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
        <h2 class="text-xl font-bold mb-4">新建 Webhook</h2>
        <form @submit.prevent="saveWebhook">
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-1">URL</label>
            <input
              v-model="form.url"
              type="url"
              placeholder="https://..."
              class="w-full px-3 py-2 border rounded-lg"
              required
            />
          </div>
          <div class="mb-6">
            <label class="block text-sm font-medium text-gray-700 mb-2">触发事件</label>
            <div class="space-y-2">
              <label class="flex items-center gap-2">
                <input type="checkbox" value="incident_created" v-model="form.events" />
                事件创建
              </label>
              <label class="flex items-center gap-2">
                <input type="checkbox" value="incident_updated" v-model="form.events" />
                事件更新
              </label>
              <label class="flex items-center gap-2">
                <input type="checkbox" value="incident_resolved" v-model="form.events" />
                事件解决
              </label>
            </div>
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
  url: '',
  events: ['incident_created', 'incident_updated', 'incident_resolved']
})

const saveWebhook = async () => {
  try {
    await adminStore.createWebhook(form.value)
    await adminStore.fetchWebhooks()
    showModal.value = false
    form.value = { url: '', events: ['incident_created', 'incident_updated', 'incident_resolved'] }
  } catch (e) {
    alert('创建失败')
  }
}

const toggleActive = async (webhook) => {
  try {
    await adminStore.updateWebhook(webhook.id, { active: !webhook.active })
    await adminStore.fetchWebhooks()
  } catch (e) {
    alert('更新失败')
  }
}

const deleteWebhook = async (id) => {
  if (confirm('确定删除此 Webhook？')) {
    try {
      await adminStore.deleteWebhook(id)
      await adminStore.fetchWebhooks()
    } catch (e) {
      alert('删除失败')
    }
  }
}

onMounted(async () => {
  await adminStore.fetchWebhooks()
})
</script>
