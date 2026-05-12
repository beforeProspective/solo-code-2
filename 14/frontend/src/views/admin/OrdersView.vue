<template>
  <div>
    <v-row class="mb-4">
      <v-col class="d-flex align-center">
        <v-btn icon class="mr-3" router-link="/events">
          <v-icon>mdi-arrow-left</v-icon>
        </v-btn>
        <h2 class="text-h5 font-weight-medium mb-0">
          订单管理 - {{ event?.title || '加载中...' }}
        </h2>
      </v-col>
      <v-col class="text-right">
        <v-btn color="success" @click="exportCsv" prepend-icon="mdi-download">
          导出参会者CSV
        </v-btn>
      </v-col>
    </v-row>

    <v-card>
      <v-data-table
        :loading="loading"
        :headers="headers"
        :items="orders"
        :items-per-page="10"
        class="elevation-1"
      >
        <template v-slot:item.total_amount="{ item }">
          ¥{{ item.total_amount }}
        </template>
        <template v-slot:item.status="{ item }">
          <v-chip
            :class="`status-${item.status}`"
            size="small"
            label
          >
            {{ getStatusLabel(item.status) }}
          </v-chip>
        </template>
        <template v-slot:item.created_at="{ item }">
          {{ formatDate(item.created_at) }}
        </template>
        <template v-slot:item.actions="{ item }">
          <v-btn icon small class="mr-1" @click="viewOrder(item)">
            <v-icon>mdi-eye</v-icon>
          </v-btn>
          <v-btn
            icon
            small
            class="mr-1"
            color="error"
            @click="confirmRefund(item)"
            :disabled="item.status === 'refunded' || item.status === 'cancelled'"
          >
            <v-icon>mdi-refund</v-icon>
          </v-btn>
        </template>
      </v-data-table>
    </v-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import dayjs from 'dayjs'
import api from '../../services/api'

const router = useRouter()
const route = useRoute()

const loading = ref(true)
const event = ref(null)
const orders = ref([])

const headers = [
  { title: '订单号', value: 'order_number' },
  { title: '客户', value: 'customer_name' },
  { title: '邮箱', value: 'customer_email' },
  { title: '金额', value: 'total_amount' },
  { title: '状态', value: 'status' },
  { title: '下单时间', value: 'created_at' },
  { title: '操作', value: 'actions', sortable: false }
]

function formatDate(date) {
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}

function getStatusLabel(status) {
  const labels = {
    pending: '待处理',
    confirmed: '已确认',
    cancelled: '已取消',
    refunded: '已退款'
  }
  return labels[status] || status
}

async function loadData() {
  loading.value = true
  try {
    const eventRes = await api.get(`/events/${route.params.eventId}`)
    event.value = eventRes.data
    
    const ordersRes = await api.get(`/events/${route.params.eventId}/orders`)
    orders.value = ordersRes.data.data || ordersRes.data
  } catch (e) {
    console.error('Failed to load:', e)
  } finally {
    loading.value = false
  }
}

onMounted(loadData)

function viewOrder(item) {
  router.push(`/events/${route.params.eventId}/orders/${item.id}`)
}

async function confirmRefund(item) {
  if (confirm(`确定要退款订单"${item.order_number}"吗？`)) {
    try {
      await api.post(`/events/${route.params.eventId}/orders/${item.id}/refund`)
      await loadData()
    } catch (e) {
      alert('退款失败')
    }
  }
}

function exportCsv() {
  window.open(`http://localhost:8000/api/events/${route.params.eventId}/attendees/export?token=${localStorage.getItem('token')}`, '_blank')
}
</script>
