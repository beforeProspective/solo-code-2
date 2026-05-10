<template>
  <div class="space-y-6">
    <div class="flex justify-between items-center">
      <div>
        <h1 class="text-3xl font-bold text-gray-800">发票列表</h1>
        <p class="text-gray-500">管理所有发票</p>
      </div>
      <button @click="$router.push('/invoices/create')" class="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 font-medium">
        ➕ 新建发票
      </button>
    </div>
    
    <div class="bg-white rounded-xl shadow p-4 flex gap-4">
      <button v-for="s in statusFilters" :key="s.value" @click="filter = s.value"
        :class="['px-4 py-2 rounded-lg font-medium', filter === s.value ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700']">
        {{ s.label }}
      </button>
    </div>
    
    <div class="bg-white rounded-xl shadow overflow-hidden">
      <table class="w-full">
        <thead class="bg-gray-50">
          <tr>
            <th class="text-left px-6 py-4 text-gray-600 font-medium">发票号</th>
            <th class="text-left px-6 py-4 text-gray-600 font-medium">客户</th>
            <th class="text-left px-6 py-4 text-gray-600 font-medium">金额</th>
            <th class="text-left px-6 py-4 text-gray-600 font-medium">到期日</th>
            <th class="text-left px-6 py-4 text-gray-600 font-medium">状态</th>
            <th class="text-left px-6 py-4 text-gray-600 font-medium">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y">
          <tr v-for="inv in invoices" :key="inv.id" class="hover:bg-gray-50">
            <td class="px-6 py-4 font-mono text-blue-600">{{ inv.invoice_number }}</td>
            <td class="px-6 py-4 text-gray-800">{{ inv.customer_name || 'N/A' }}</td>
            <td class="px-6 py-4 font-medium">¥{{ formatMoney(inv.total) }}</td>
            <td class="px-6 py-4 text-gray-600">{{ inv.due_date }}</td>
            <td class="px-6 py-4">
              <span :class="statusBadge(inv.status)">{{ statusLabel(inv.status) }}</span>
            </td>
            <td class="px-6 py-4 space-x-2">
              <button @click="$router.push('/invoices/' + inv.id)" class="text-blue-600 hover:underline text-sm">查看</button>
              <button @click="downloadPdf(inv.id)" class="text-green-600 hover:underline text-sm">PDF</button>
            </td>
          </tr>
          <tr v-if="!invoices.length">
            <td colspan="6" class="px-6 py-12 text-center text-gray-400">暂无发票</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { invoicesAPI } from '../api'

const invoices = ref([])
const filter = ref('')
const statusFilters = [
  { label: '全部', value: '' },
  { label: '草稿', value: 'draft' },
  { label: '已发送', value: 'sent' },
  { label: '已付款', value: 'paid' },
  { label: '已逾期', value: 'overdue' }
]

const statusLabel = (s) => ({
  draft: '草稿', sent: '已发送', paid: '已付款', overdue: '已逾期'
}[s] || s)

const statusBadge = (s) => {
  const colors = { draft: 'bg-gray-100 text-gray-700', sent: 'bg-blue-100 text-blue-700', paid: 'bg-green-100 text-green-700', overdue: 'bg-red-100 text-red-700' }
  return `inline-block px-3 py-1 rounded-full text-xs font-medium ${colors[s] || colors.draft}`
}

const formatMoney = (n) => (n || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })

const load = async () => {
  const res = await invoicesAPI.getAll(filter.value)
  invoices.value = res.data.data
}

const downloadPdf = (id) => invoicesAPI.downloadPdf(id)

onMounted(() => load())
watch(filter, () => load())
</script>
