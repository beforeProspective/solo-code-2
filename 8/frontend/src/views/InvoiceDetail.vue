<template>
  <div v-if="invoice" class="space-y-6 max-w-4xl">
    <div class="flex justify-between items-center">
      <div>
        <h1 class="text-3xl font-bold text-gray-800">发票详情</h1>
        <p class="text-gray-500 font-mono">{{ invoice.invoice_number }}</p>
      </div>
      <div class="flex gap-3">
        <button @click="downloadPdf" class="px-4 py-2 border rounded-lg hover:bg-gray-50">📄 下载 PDF</button>
        <button @click="$router.push('/invoices')" class="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">返回</button>
      </div>
    </div>
    
    <div class="bg-white rounded-xl shadow p-6">
      <div class="grid grid-cols-2 gap-6">
        <div class="bg-blue-50 rounded-lg p-4">
          <h3 class="font-bold text-blue-800 mb-2">发票信息</h3>
          <p class="text-sm text-gray-600">发票号: <span class="font-mono font-medium">{{ invoice.invoice_number }}</span></p>
          <p class="text-sm text-gray-600">创建日期: {{ invoice.created_at?.slice(0, 10) }}</p>
          <p class="text-sm text-gray-600">到期日期: {{ invoice.due_date }}</p>
          <p class="text-sm mt-2">
            状态: <span :class="statusBadge(invoice.status)">{{ statusLabel(invoice.status) }}</span>
          </p>
        </div>
        <div class="bg-gray-50 rounded-lg p-4">
          <h3 class="font-bold text-gray-800 mb-2">客户信息</h3>
          <p class="font-medium">{{ invoice.customer_name || 'N/A' }}</p>
          <p class="text-sm text-gray-600">{{ invoice.customer_email || '-' }}</p>
        </div>
      </div>
      
      <div class="mt-6">
        <h3 class="font-bold text-gray-800 mb-3">明细项目</h3>
        <table class="w-full border-collapse">
          <thead>
            <tr class="bg-gray-50">
              <th class="p-3 border text-left text-sm text-gray-600">#</th>
              <th class="p-3 border text-left text-sm text-gray-600">描述</th>
              <th class="p-3 border text-right text-sm text-gray-600">数量</th>
              <th class="p-3 border text-right text-sm text-gray-600">单价</th>
              <th class="p-3 border text-center text-sm text-gray-600">税率</th>
              <th class="p-3 border text-right text-sm text-gray-600">小计</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, i) in invoice.items" :key="item.id">
              <td class="p-3 border text-center">{{ i + 1 }}</td>
              <td class="p-3 border">{{ item.description }}</td>
              <td class="p-3 border text-right">{{ item.quantity }}</td>
              <td class="p-3 border text-right">¥{{ fmt(item.price) }}</td>
              <td class="p-3 border text-center">{{ item.tax_rate }}%</td>
              <td class="p-3 border text-right font-medium">¥{{ fmt(item.price * item.quantity) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      
      <div class="mt-6 flex justify-end">
        <div class="w-72 bg-gray-50 rounded-lg p-4 space-y-2">
          <div class="flex justify-between"><span class="text-gray-600">小计:</span><span class="font-medium">¥{{ fmt(invoice.amount) }}</span></div>
          <div class="flex justify-between"><span class="text-gray-600">税额:</span><span class="font-medium">¥{{ fmt(invoice.tax_amount) }}</span></div>
          <div class="flex justify-between text-lg font-bold border-t pt-2">
            <span>总计:</span><span class="text-blue-600">¥{{ fmt(invoice.total) }}</span>
          </div>
          <div class="flex justify-between"><span class="text-gray-600">已付:</span><span class="text-green-600">¥{{ fmt(invoice.paid_amount) }}</span></div>
          <div class="flex justify-between"><span class="text-gray-600">待付:</span><span class="text-red-600 font-medium">¥{{ fmt(invoice.total - invoice.paid_amount) }}</span></div>
        </div>
      </div>
      
      <div v-if="invoice.notes" class="mt-6 p-4 bg-yellow-50 rounded-lg">
        <p class="text-sm text-gray-600">备注: {{ invoice.notes }}</p>
      </div>
    </div>
    
    <div class="bg-white rounded-xl shadow p-6">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-lg font-bold text-gray-800">更改状态</h3>
        <div class="flex gap-2">
          <button v-for="s in ['draft', 'sent', 'paid']" :key="s" @click="changeStatus(s)"
            :class="['px-4 py-2 rounded-lg text-sm font-medium', 
              invoice.status === s ? 'bg-blue-600 text-white' : 'border hover:bg-gray-50']">
            {{ statusLabel(s) }}
          </button>
        </div>
      </div>
    </div>
    
    <div class="bg-white rounded-xl shadow p-6">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-lg font-bold text-gray-800">记录付款</h3>
      </div>
      <form @submit.prevent="recordPayment" class="flex gap-3 items-end flex-wrap">
        <div>
          <label class="block text-sm text-gray-600 mb-1">金额</label>
          <input v-model.number="paymentForm.amount" type="number" step="0.01" min="0.01" required
            class="border rounded-lg px-3 py-2 w-40" placeholder="付款金额" />
        </div>
        <div>
          <label class="block text-sm text-gray-600 mb-1">日期</label>
          <input v-model="paymentForm.payment_date" type="date" required class="border rounded-lg px-3 py-2" />
        </div>
        <div>
          <label class="block text-sm text-gray-600 mb-1">方式</label>
          <select v-model="paymentForm.method" class="border rounded-lg px-3 py-2">
            <option value="cash">现金</option>
            <option value="bank_transfer">银行转账</option>
            <option value="wechat">微信</option>
            <option value="alipay">支付宝</option>
            <option value="credit_card">信用卡</option>
          </select>
        </div>
        <button type="submit" class="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">记录付款</button>
      </form>
      
      <div v-if="invoice.payments.length" class="mt-6">
        <h4 class="font-medium text-gray-700 mb-2">付款历史</h4>
        <table class="w-full text-sm">
          <thead><tr class="bg-gray-50"><th class="p-2 text-left">日期</th><th class="p-2 text-left">方式</th><th class="p-2 text-right">金额</th></tr></thead>
          <tbody>
            <tr v-for="p in invoice.payments" :key="p.id" class="border-t">
              <td class="p-2">{{ p.payment_date }}</td>
              <td class="p-2">{{ methodLabel(p.method) }}</td>
              <td class="p-2 text-right font-medium">¥{{ fmt(p.amount) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { invoicesAPI } from '../api'

const route = useRoute()
const invoice = ref(null)
const paymentForm = ref({
  amount: 0,
  payment_date: new Date().toISOString().slice(0, 10),
  method: 'cash'
})

const fmt = (n) => (parseFloat(n) || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })

const statusLabel = (s) => ({
  draft: '草稿', sent: '已发送', paid: '已付款', overdue: '已逾期'
}[s] || s)

const statusBadge = (s) => {
  const colors = { draft: 'bg-gray-100 text-gray-700', sent: 'bg-blue-100 text-blue-700', paid: 'bg-green-100 text-green-700', overdue: 'bg-red-100 text-red-700' }
  return `inline-block px-3 py-1 rounded-full text-xs font-medium ${colors[s] || colors.draft}`
}

const methodLabel = (m) => ({
  cash: '现金', bank_transfer: '银行转账', wechat: '微信', alipay: '支付宝', credit_card: '信用卡'
}[m] || m)

const load = async () => {
  const res = await invoicesAPI.get(route.params.id)
  invoice.value = res.data.data
  paymentForm.value.amount = invoice.value.total - invoice.value.paid_amount
}

const changeStatus = async (status) => {
  await invoicesAPI.updateStatus(invoice.value.id, status)
  invoice.value.status = status
}

const recordPayment = async () => {
  if (!paymentForm.value.amount || paymentForm.value.amount <= 0) return
  const res = await invoicesAPI.addPayment(invoice.value.id, paymentForm.value)
  invoice.value.paid_amount = res.data.data.paid_amount
  invoice.value.status = res.data.data.status
  load()
}

const downloadPdf = () => invoicesAPI.downloadPdf(invoice.value.id)

onMounted(() => load())
</script>
