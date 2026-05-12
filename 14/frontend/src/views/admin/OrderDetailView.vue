<template>
  <div>
    <v-row class="mb-4">
      <v-col class="d-flex align-center">
        <v-btn icon class="mr-3" :to="`/events/${route.params.eventId}/orders`">
          <v-icon>mdi-arrow-left</v-icon>
        </v-btn>
        <h2 class="text-h5 font-weight-medium mb-0">订单详情</h2>
      </v-col>
    </v-row>

    <v-card v-if="order" class="mb-4">
      <v-card-title>
        订单信息
      </v-card-title>
      <v-card-text>
        <v-row>
          <v-col cols="6" md="3">
            <p class="text-grey">订单号</p>
            <p class="font-weight-medium">{{ order.order_number }}</p>
          </v-col>
          <v-col cols="6" md="3">
            <p class="text-grey">状态</p>
            <v-chip :class="`status-${order.status}`" size="small" label>
              {{ getStatusLabel(order.status) }}
            </v-chip>
          </v-col>
          <v-col cols="6" md="3">
            <p class="text-grey">支付方式</p>
            <p class="font-weight-medium">{{ order.payment_method || '-' }}</p>
          </v-col>
          <v-col cols="6" md="3">
            <p class="text-grey">下单时间</p>
            <p class="font-weight-medium">{{ formatDate(order.created_at) }}</p>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <v-card v-if="order" class="mb-4">
      <v-card-title>客户信息</v-card-title>
      <v-card-text>
        <v-row>
          <v-col cols="6" md="4">
            <p class="text-grey">姓名</p>
            <p class="font-weight-medium">{{ order.customer_name }}</p>
          </v-col>
          <v-col cols="6" md="4">
            <p class="text-grey">邮箱</p>
            <p class="font-weight-medium">{{ order.customer_email }}</p>
          </v-col>
          <v-col cols="6" md="4">
            <p class="text-grey">电话</p>
            <p class="font-weight-medium">{{ order.customer_phone || '-' }}</p>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <v-card v-if="order" class="mb-4">
      <v-card-title>门票明细</v-card-title>
      <v-data-table
        :headers="itemHeaders"
        :items="order.items"
        class="elevation-0"
        hide-default-footer
      >
        <template v-slot:item.price="{ item }">¥{{ item.price }}</template>
        <template v-slot:item.subtotal="{ item }">¥{{ item.subtotal }}</template>
      </v-data-table>
    </v-card>

    <v-card v-if="order && order.attendees?.length">
      <v-card-title>参会者</v-card-title>
      <v-data-table
        :headers="attendeeHeaders"
        :items="order.attendees"
        class="elevation-0"
        hide-default-footer
      >
        <template v-slot:item.checked_in="{ item }">
          <v-chip :color="item.checked_in ? 'green' : 'grey'" size="small" label>
            {{ item.checked_in ? '已签到' : '未签到' }}
          </v-chip>
        </template>
        <template v-slot:item.actions="{ item }">
          <v-btn
            icon
            small
            @click="downloadTicket(item)"
            title="下载电子票"
          >
            <v-icon>mdi-download</v-icon>
          </v-btn>
        </template>
      </v-data-table>
    </v-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import dayjs from 'dayjs'
import api from '../../services/api'

const route = useRoute()

const order = ref(null)
const loading = ref(true)

const itemHeaders = [
  { title: '门票名称', value: 'ticket_name' },
  { title: '单价', value: 'price' },
  { title: '数量', value: 'quantity' },
  { title: '小计', value: 'subtotal' }
]

const attendeeHeaders = [
  { title: '票码', value: 'ticket_code' },
  { title: '门票', value: 'ticket_name' },
  { title: '姓名', value: 'name' },
  { title: '邮箱', value: 'email' },
  { title: '状态', value: 'checked_in' },
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

async function loadOrder() {
  loading.value = true
  try {
    const res = await api.get(`/events/${route.params.eventId}/orders/${route.params.orderId}`)
    order.value = res.data
  } catch (e) {
    console.error('Failed to load:', e)
  } finally {
    loading.value = false
  }
}

onMounted(loadOrder)

function downloadTicket(attendee) {
  window.open(`http://localhost:8000/api/public/tickets/${attendee.ticket_code}/download`, '_blank')
}
</script>
