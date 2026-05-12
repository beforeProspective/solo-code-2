<template>
  <div>
    <v-row class="mb-4">
      <v-col class="d-flex align-center">
        <v-btn icon class="mr-3" router-link="/events">
          <v-icon>mdi-arrow-left</v-icon>
        </v-btn>
        <h2 class="text-h5 font-weight-medium mb-0">
          活动统计 - {{ stats?.event?.title || '加载中...' }}
        </h2>
      </v-col>
    </v-row>

    <v-row v-if="stats">
      <v-col cols="12" sm="6" md="3">
        <v-card class="text-center pa-6">
          <v-icon size="48" color="green" class="mb-2">mdi-ticket-confirmation</v-icon>
          <p class="text-h4 font-weight-bold">{{ stats.tickets_sold }}</p>
          <p class="text-grey">已售门票</p>
        </v-card>
      </v-col>
      <v-col cols="12" sm="6" md="3">
        <v-card class="text-center pa-6">
          <v-icon size="48" color="blue" class="mb-2">mdi-cash-multiple</v-icon>
          <p class="text-h4 font-weight-bold">¥{{ stats.revenue.toFixed(2) }}</p>
          <p class="text-grey">总收入</p>
        </v-card>
      </v-col>
      <v-col cols="12" sm="6" md="3">
        <v-card class="text-center pa-6">
          <v-icon size="48" color="orange" class="mb-2">mdi-check-circle</v-icon>
          <p class="text-h4 font-weight-bold">{{ stats.checked_in }}</p>
          <p class="text-grey">已签到</p>
        </v-card>
      </v-col>
      <v-col cols="12" sm="6" md="3">
        <v-card class="text-center pa-6">
          <v-icon size="48" color="purple" class="mb-2">mdi-ticket-outline</v-icon>
          <p class="text-h4 font-weight-bold">{{ stats.ticket_stats?.length || 0 }}</p>
          <p class="text-grey">门票种类</p>
        </v-card>
      </v-col>
    </v-row>

    <v-row class="mt-6" v-if="stats?.ticket_stats?.length">
      <v-col>
        <v-card>
          <v-card-title>门票销售情况</v-card-title>
          <v-data-table
            :headers="ticketHeaders"
            :items="stats.ticket_stats"
            class="elevation-0"
            hide-default-footer
          >
            <template v-slot:item.type="{ item }">
              {{ getTypeLabel(item.type) }}
            </template>
            <template v-slot:item.revenue="{ item }">
              ¥{{ item.revenue.toFixed(2) }}
            </template>
            <template v-slot:item.remaining="{ item }">
              {{ item.remaining !== null ? item.remaining : '不限' }}
            </template>
          </v-data-table>
        </v-card>
      </v-col>
    </v-row>

    <v-row class="mt-6" v-if="stats?.recent_orders?.length">
      <v-col>
        <v-card>
          <v-card-title>最近订单</v-card-title>
          <v-data-table
            :headers="orderHeaders"
            :items="stats.recent_orders"
            class="elevation-0"
            hide-default-footer
          >
            <template v-slot:item.total_amount="{ item }">
              ¥{{ item.total_amount }}
            </template>
            <template v-slot:item.status="{ item }">
              <v-chip :class="`status-${item.status}`" size="small" label>
                {{ getStatusLabel(item.status) }}
              </v-chip>
            </template>
            <template v-slot:item.created_at="{ item }">
              {{ formatDate(item.created_at) }}
            </template>
          </v-data-table>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import dayjs from 'dayjs'
import api from '../../services/api'

const route = useRoute()
const stats = ref(null)

const ticketHeaders = [
  { title: '门票名称', value: 'name' },
  { title: '类型', value: 'type' },
  { title: '已售', value: 'sold' },
  { title: '剩余', value: 'remaining' },
  { title: '收入', value: 'revenue' }
]

const orderHeaders = [
  { title: '订单号', value: 'order_number' },
  { title: '客户', value: 'customer_name' },
  { title: '金额', value: 'total_amount' },
  { title: '状态', value: 'status' },
  { title: '时间', value: 'created_at' }
]

function formatDate(date) {
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}

function getTypeLabel(type) {
  const labels = { free: '免费', paid: '付费', donation: '捐赠' }
  return labels[type] || type
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

onMounted(async () => {
  try {
    const res = await api.get(`/dashboard/events/${route.params.eventId}/stats`)
    stats.value = res.data
  } catch (e) {
    console.error('Failed to load stats:', e)
  }
})
</script>
