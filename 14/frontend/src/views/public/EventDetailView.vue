<template>
  <div v-if="event">
    <v-img
      :src="event.cover_image || 'https://picsum.photos/seed/' + event.id + '/1200/400'"
      aspect-ratio="3/1"
      cover
    ></v-img>

    <v-container class="my-8">
      <v-row>
        <v-col cols="12" md="8">
          <h1 class="text-h3 font-weight-bold mb-4">{{ event.title }}</h1>
          
          <div class="mb-6">
            <div class="d-flex align-center text-grey mb-2">
              <v-icon class="mr-2">mdi-calendar</v-icon>
              <span>
                {{ formatDate(event.start_time) }} - {{ formatTime(event.end_time) }}
              </span>
            </div>
            <div class="d-flex align-center text-grey mb-2">
              <v-icon class="mr-2">mdi-map-marker</v-icon>
              <span>{{ event.location }}</span>
            </div>
            <div v-if="event.address" class="d-flex align-center text-grey mb-2">
              <v-icon class="mr-2">mdi-map-marker-radius</v-icon>
              <span>{{ event.address }}</span>
            </div>
          </div>

          <v-divider class="mb-6"></v-divider>

          <h2 class="text-h5 font-weight-medium mb-4">活动介绍</h2>
          <p class="text-body-1 mb-8" style="white-space: pre-wrap;">{{ event.description || '暂无详细介绍' }}</p>
        </v-col>

        <v-col cols="12" md="4">
          <template v-if="event.registration_open && availableTickets.length">
            <v-card class="sticky-top">
              <v-card-title>
                选择门票
              </v-card-title>
              <v-card-text>
                <div
                  v-for="ticket in availableTickets"
                  :key="ticket.id"
                  class="mb-4"
                >
                  <v-card outlined>
                    <v-card-text>
                      <div class="d-flex justify-between align-start">
                        <div>
                          <h3 class="text-subtitle-1 font-weight-medium">{{ ticket.name }}</h3>
                          <p class="text-caption text-grey mb-2">{{ ticket.description || '' }}</p>
                          <p class="text-h5 font-weight-bold text-primary">
                            {{ getTicketPrice(ticket) }}
                          </p>
                          <p class="text-caption text-grey">
                            剩余: {{ ticket.quantity ? ticket.quantity : '不限' }}
                          </p>
                        </div>
                        <div class="d-flex align-center">
                          <v-btn
                            @click="selectTicket(ticket)"
                            color="primary"
                          >
                            选择
                          </v-btn>
                        </div>
                      </div>
                    </v-card-text>
                  </v-card>
                </div>
              </v-card-text>
            </v-card>
            <v-btn
              block
              color="primary"
              size="large"
              class="mt-4"
              @click="goToRegister"
            >
              立即报名
            </v-btn>
          </template>
          <v-alert v-else-if="!event.registration_open" type="warning" class="mb-4">
            报名已关闭
          </v-alert>
          <v-alert v-else type="info">
            暂无可用门票
          </v-alert>
        </v-col>
      </v-row>
    </v-container>
  </div>

  <v-container v-else-if="!loading" class="py-12 text-center">
    <v-icon size="64" color="error">mdi-alert-circle</v-icon>
    <p class="text-h6 mt-4">活动不存在或已下架</p>
    <v-btn class="mt-4" router-link="/">返回首页</v-btn>
  </v-container>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import dayjs from 'dayjs'
import api from '../../services/api'

const router = useRouter()
const route = useRoute()

const event = ref(null)
const loading = ref(true)

const availableTickets = computed(() => {
  return event.value?.tickets || []
})

function formatDate(date) {
  return dayjs(date).format('YYYY年MM月DD日 HH:mm')
}

function formatTime(date) {
  return dayjs(date).format('HH:mm')
}

function getTicketPrice(ticket) {
  if (ticket.type === 'free') return '免费'
  if (ticket.type === 'donation') return '最低 ¥' + ticket.min_donation
  return '¥' + ticket.price
}

function goToRegister() {
  router.push(`/events/${event.value.slug}/register`)
}

function selectTicket(ticket) {
  router.push({
    path: `/events/${event.value.slug}/register`,
    query: { ticket: ticket.id }
  })
}

onMounted(async () => {
  try {
    const res = await api.get(`/public/events/${route.params.slug}`)
    event.value = res.data
  } catch (e) {
    console.error('Failed to load event:', e)
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.sticky-top {
  position: sticky;
  top: 20px;
}
</style>
