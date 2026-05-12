<template>
  <div>
    <v-row>
      <v-col cols="12" sm="6" md="3">
        <v-card class="text-center pa-6">
          <v-icon size="48" color="primary" class="mb-2">mdi-calendar-multiple</v-icon>
          <p class="text-h4 font-weight-bold">{{ stats.total_events }}</p>
          <p class="text-grey">活动总数</p>
        </v-card>
      </v-col>
      <v-col cols="12" sm="6" md="3">
        <v-card class="text-center pa-6">
          <v-icon size="48" color="green" class="mb-2">mdi-ticket-confirmation</v-icon>
          <p class="text-h4 font-weight-bold">{{ stats.total_tickets_sold }}</p>
          <p class="text-grey">已售门票</p>
        </v-card>
      </v-col>
      <v-col cols="12" sm="6" md="3">
        <v-card class="text-center pa-6">
          <v-icon size="48" color="blue" class="mb-2">mdi-cash-multiple</v-icon>
          <p class="text-h4 font-weight-bold">¥{{ stats.total_revenue.toFixed(2) }}</p>
          <p class="text-grey">总收入</p>
        </v-card>
      </v-col>
      <v-col cols="12" sm="6" md="3">
        <v-card class="text-center pa-6">
          <v-icon size="48" color="orange" class="mb-2">mdi-account-group</v-icon>
          <p class="text-h4 font-weight-bold">{{ stats.total_attendees }}</p>
          <p class="text-grey">参会者总数</p>
        </v-card>
      </v-col>
    </v-row>

    <v-row class="mt-6">
      <v-col>
        <v-card>
          <v-card-title class="d-flex align-center">
            <v-icon class="mr-2">mdi-calendar</v-icon>
            我的活动
            <v-spacer></v-spacer>
            <v-btn color="primary" router-link="/events/create" prepend-icon="mdi-plus">
              新建活动
            </v-btn>
          </v-card-title>
          <v-data-table
            :loading="loading"
            :headers="headers"
            :items="events"
            :items-per-page="5"
            class="elevation-1"
          >
            <template v-slot:item.actions="{ item }">
              <v-btn icon small class="mr-1" @click="goToEdit(item)">
                <v-icon>mdi-pencil</v-icon>
              </v-btn>
              <v-btn icon small class="mr-1" @click="goToTickets(item)">
                <v-icon>mdi-ticket</v-icon>
              </v-btn>
              <v-btn icon small @click="goToStats(item)">
                <v-icon>mdi-chart-bar</v-icon>
              </v-btn>
            </template>
          </v-data-table>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '../../services/api'

const router = useRouter()
const loading = ref(true)
const stats = ref({
  total_events: 0,
  total_tickets_sold: 0,
  total_revenue: 0,
  total_attendees: 0
})
const events = ref([])

const headers = [
  { title: '活动名称', value: 'title' },
  { title: '地点', value: 'location' },
  { title: '开始时间', value: 'start_time' },
  { title: '订单数', value: 'orders_count' },
  { title: '参会者', value: 'attendees_count' },
  { title: '状态', value: 'is_published' },
  { title: '操作', value: 'actions', sortable: false }
]

onMounted(async () => {
  try {
    const [statsRes, eventsRes] = await Promise.all([
      api.get('/dashboard/stats'),
      api.get('/events')
    ])
    stats.value = statsRes.data
    events.value = eventsRes.data.data || eventsRes.data
  } catch (e) {
    console.error('Failed to load dashboard:', e)
  } finally {
    loading.value = false
  }
})

function goToEdit(item) {
  router.push(`/events/${item.id}/edit`)
}

function goToTickets(item) {
  router.push(`/events/${item.id}/tickets`)
}

function goToStats(item) {
  router.push(`/events/${item.id}/stats`)
}
</script>
