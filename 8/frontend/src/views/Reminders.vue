<template>
  <div class="space-y-6">
    <div class="flex justify-between items-center">
      <div>
        <h1 class="text-3xl font-bold text-gray-800">逾期提醒</h1>
        <p class="text-gray-500">检查并发送逾期发票提醒（模拟）</p>
      </div>
      <button @click="runCheck" :disabled="checking"
        class="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium">
        {{ checking ? '检查中...' : '🔍 检查逾期发票' }}
      </button>
    </div>
    
    <div v-if="lastCheck" class="bg-green-50 border border-green-200 rounded-xl p-6">
      <h3 class="font-bold text-green-800 mb-3">检查结果</h3>
      <div class="grid grid-cols-3 gap-4 text-sm">
        <div>
          <span class="text-gray-600">状态更新为逾期:</span>
          <span class="font-bold ml-2">{{ lastCheck.invoices_updated_to_overdue }}</span>
        </div>
        <div>
          <span class="text-gray-600">发送提醒邮件:</span>
          <span class="font-bold ml-2">{{ lastCheck.reminders_sent }}</span>
        </div>
        <div>
          <span class="text-gray-600">时间:</span>
          <span class="font-medium ml-2">{{ new Date().toLocaleString() }}</span>
        </div>
      </div>
      <div v-if="lastCheck.reminders.length" class="mt-4 space-y-3">
        <div v-for="r in lastCheck.reminders" :key="r.invoice_number" class="bg-white rounded-lg p-4 border border-green-200">
          <div class="flex justify-between">
            <div>
              <span class="font-mono text-blue-600">{{ r.invoice_number }}</span>
              <span class="mx-2">→</span>
              <span class="font-medium">{{ r.customer }}</span>
            </div>
            <span class="text-red-600 font-bold">待付: ¥{{ fmt(r.amount_due) }}</span>
          </div>
          <details class="mt-3">
            <summary class="text-sm text-gray-600 cursor-pointer hover:underline">查看模拟邮件内容</summary>
            <div class="mt-2 p-3 bg-gray-50 rounded text-sm font-mono whitespace-pre-wrap">
              To: {{ r.simulated_email.to }}
              Subject: {{ r.simulated_email.subject }}
              
              {{ r.simulated_email.body }}
            </div>
          </details>
        </div>
      </div>
    </div>
    
    <div class="bg-white rounded-xl shadow overflow-hidden">
      <div class="p-4 border-b">
        <h3 class="font-bold text-gray-800">历史提醒记录</h3>
      </div>
      <table class="w-full">
        <thead class="bg-gray-50">
          <tr>
            <th class="text-left p-4 text-gray-600 text-sm">发票</th>
            <th class="text-left p-4 text-gray-600 text-sm">客户</th>
            <th class="text-left p-4 text-gray-600 text-sm">类型</th>
            <th class="text-left p-4 text-gray-600 text-sm">发送时间</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in reminders" :key="r.id" class="border-t hover:bg-gray-50">
            <td class="p-4 font-mono text-blue-600">{{ r.invoice_number }}</td>
            <td class="p-4">{{ r.customer_name || '-' }}</td>
            <td class="p-4">
              <span class="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium">逾期邮件</span>
            </td>
            <td class="p-4 text-sm text-gray-600">{{ r.sent_at }}</td>
          </tr>
          <tr v-if="!reminders.length">
            <td colspan="4" class="p-8 text-center text-gray-400">暂无提醒记录</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { remindersAPI } from '../api'

const checking = ref(false)
const reminders = ref([])
const lastCheck = ref(null)

const fmt = (n) => (n || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })

const load = async () => {
  const res = await remindersAPI.getAll()
  reminders.value = res.data.data
}

const runCheck = async () => {
  checking.value = true
  try {
    const res = await remindersAPI.check()
    lastCheck.value = res.data.data
    load()
  } finally {
    checking.value = false
  }
}

onMounted(() => load())
</script>
