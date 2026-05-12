<template>
  <div>
    <v-row class="mb-4">
      <v-col class="d-flex align-center">
        <h2 class="text-h5 font-weight-medium mb-0">活动管理</h2>
      </v-col>
      <v-col class="text-right">
        <v-btn color="primary" router-link="/events/create" prepend-icon="mdi-plus">
          新建活动
        </v-btn>
      </v-col>
    </v-row>
    <v-card>
      <v-data-table
        :loading="loading"
        :headers="headers"
        :items="events"
        :items-per-page="10"
        class="elevation-1"
      >
        <template v-slot:item.is_published="{ item }">
          <v-chip :color="item.is_published ? 'green' : 'grey'" size="small" label>
            {{ item.is_published ? '已发布' : '草稿' }}
          </v-chip>
        </template>
        <template v-slot:item.start_time="{ item }">
          {{ formatDate(item.start_time) }}
        </template>
        <template v-slot:item.actions="{ item }">
          <v-btn icon small class="mr-1" @click="viewEvent(item)" title="查看">
            <v-icon>mdi-eye</v-icon>
          </v-btn>
          <v-btn icon small class="mr-1" @click="editEvent(item)" title="编辑">
            <v-icon>mdi-pencil</v-icon>
          </v-btn>
          <v-btn icon small class="mr-1" @click="manageTickets(item)" title="门票">
            <v-icon>mdi-ticket</v-icon>
          </v-btn>
          <v-btn icon small class="mr-1" @click="manageOrders(item)" title="订单">
            <v-icon>mdi-receipt</v-icon>
          </v-btn>
          <v-btn icon small class="mr-1" @click="viewStats(item)" title="统计">
            <v-icon>mdi-chart-bar</v-icon>
          </v-btn>
          <v-btn icon small color="error" @click="confirmDelete(item)" title="删除">
            <v-icon>mdi-delete</v-icon>
          </v-btn>
        </template>
      </v-data-table>
    </v-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { useEventStore } from '../../stores/event'

const router = useRouter()
const eventStore = useEventStore()

const loading = ref(true)
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

function formatDate(date) {
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}

async function loadEvents() {
  loading.value = true
  try {
    const data = await eventStore.fetchEvents()
    events.value = data
  } catch (e) {
    console.error('Failed to load events:', e)
  } finally {
    loading.value = false
  }
}

onMounted(loadEvents)

function viewEvent(item) {
  window.open(`/events/${item.slug}`, '_blank')
}

function editEvent(item) {
  router.push(`/events/${item.id}/edit`)
}

function manageTickets(item) {
  router.push(`/events/${item.id}/tickets`)
}

function manageOrders(item) {
  router.push(`/events/${item.id}/orders`)
}

function viewStats(item) {
  router.push(`/events/${item.id}/stats`)
}

async function confirmDelete(item) {
  if (confirm(`确定要删除活动"${item.title}"吗？`)) {
    try {
      await eventStore.deleteEvent(item.id)
      await loadEvents()
    } catch (e) {
      alert('删除失败：' + (e.response?.data?.message || '未知错误'))
    }
  }
}
</script>
