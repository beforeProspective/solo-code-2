<template>
  <v-container class="py-16">
    <v-row justify="center">
      <v-col cols="12" md="8" lg="6">
        <v-card v-if="order" class="pa-8 text-center">
          <div class="mb-6">
            <v-icon size="80" color="green">mdi-check-circle</v-icon>
          </div>
          <h1 class="text-h3 font-weight-bold mb-2">报名成功！</h1>
          <p class="text-grey mb-8">电子票已发送到您的邮箱，您也可以下载下方的电子票。</p>

          <v-card outlined class="mb-8 text-left">
            <v-card-title>订单信息</v-card-title>
            <v-card-text>
              <v-row>
                <v-col cols="6">
                  <p class="text-grey mb-1">订单号</p>
                  <p class="font-weight-medium">{{ order.order_number }}</p>
                </v-col>
                <v-col cols="6">
                  <p class="text-grey mb-1">活动</p>
                  <p class="font-weight-medium">{{ order.event?.title || '活动' }}</p>
                </v-col>
                <v-col cols="6">
                  <p class="text-grey mb-1">金额</p>
                  <p class="font-weight-medium">¥{{ order.total_amount }}</p>
                </v-col>
                <v-col cols="6">
                  <p class="text-grey mb-1">状态</p>
                  <v-chip color="green" size="small" label>已确认</v-chip>
                </v-col>
              </v-row>
            </v-card-text>
          </v-card>

          <v-card outlined class="mb-8 text-left">
            <v-card-title>电子票</v-card-title>
            <v-data-table
              :headers="headers"
              :items="order.attendees || []"
              class="elevation-0"
              hide-default-footer
            >
              <template v-slot:item.actions="{ item }">
                <v-btn
                  color="primary"
                  small
                  @click="downloadTicket(item)"
                >
                  <v-icon class="mr-1">mdi-download</v-icon>
                  下载
                </v-btn>
              </template>
            </v-data-table>
          </v-card>

          <v-row>
            <v-col cols="6">
              <v-btn block variant="outlined" router-link="/">
                返回首页
              </v-btn>
            </v-col>
            <v-col cols="6">
              <v-btn
                block
                color="primary"
                @click="downloadAllTickets"
                :disabled="!order.attendees?.length"
              >
                下载所有电子票
              </v-btn>
            </v-col>
          </v-row>
        </v-card>

        <v-card v-else class="pa-8 text-center">
          <v-progress-circular indeterminate color="primary"></v-progress-circular>
          <p class="mt-4">加载订单信息...</p>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import api from '../../services/api'

const route = useRoute()
const order = ref(null)

const headers = [
  { title: '票码', value: 'ticket_code' },
  { title: '门票', value: 'ticket_name' },
  { title: '姓名', value: 'name' },
  { title: '操作', value: 'actions', sortable: false }
]

function downloadTicket(attendee) {
  window.open(`http://localhost:8000/api/public/tickets/${attendee.ticket_code}/download`, '_blank')
}

function downloadAllTickets() {
  order.value?.attendees?.forEach(a => {
    setTimeout(() => downloadTicket(a), 500)
  })
}

onMounted(async () => {
  try {
    const res = await api.get(`/public/orders/${route.params.orderNumber}`)
    order.value = res.data
  } catch (e) {
    console.error('Failed to load order:', e)
  }
})
</script>
