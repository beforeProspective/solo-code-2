<template>
  <v-container class="my-12">
    <v-row class="mb-10 text-center">
      <v-col>
        <h1 class="text-h2 font-weight-bold mb-4">
          <v-icon size="48" class="mr-4 text-primary">mdi-calendar-star</v-icon>
          EventHub
        </h1>
        <p class="text-h6 text-grey mb-6">发现精彩活动，在线购票，轻松参与</p>
        <v-btn
          color="primary"
          size="large"
          prepend-icon="mdi-account-plus"
          href="/register"
        >
          现在开始创建活动
        </v-btn>
      </v-col>
    </v-row>

    <v-row class="mb-4">
      <v-col>
        <h2 class="text-h5 font-weight-medium">即将开始的活动</h2>
      </v-col>
    </v-row>

    <v-progress-linear
      v-if="loading"
      indeterminate
      class="mb-4"
      color="primary"
    ></v-progress-linear>

    <v-row v-if="!loading && events.length === 0">
      <v-col class="text-center py-12">
        <v-icon size="64" color="grey">mdi-calendar-blank</v-icon>
        <p class="text-h6 mt-4 text-grey">暂无活动</p>
      </v-col>
    </v-row>

    <v-row v-else>
      <v-col cols="12" sm="6" md="4" lg="3" v-for="event in events" :key="event.id">
        <v-card
          class="event-card h-100"
          @click="goToEvent(event)"
          style="cursor: pointer;"
        >
          <v-img
            :src="event.cover_image || 'https://picsum.photos/seed/' + event.id + '/400/200'"
            aspect-ratio="16/9"
            cover
          ></v-img>
          <v-card-text>
            <h3 class="text-h6 font-weight-medium mb-2 line-clamp-2">{{ event.title }}</h3>
            <div class="d-flex align-center text-grey mb-1">
              <v-icon small class="mr-1">mdi-map-marker</v-icon>
              <span class="text-caption">{{ event.location }}</span>
            </div>
            <div class="d-flex align-center text-grey">
              <v-icon small class="mr-1">mdi-calendar</v-icon>
              <span class="text-caption">{{ formatDate(event.start_time) }}</span>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import api from '../../services/api'

const router = useRouter()

const loading = ref(true)
const events = ref([])

function formatDate(date) {
  return dayjs(date).format('YYYY年MM月DD日 HH:mm')
}

function goToEvent(event) {
  router.push(`/events/${event.slug}`)
}

onMounted(async () => {
  try {
    const res = await api.get('/public/events')
    events.value = res.data.data || res.data
  } catch (e) {
    console.error('Failed to load events:', e)
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
