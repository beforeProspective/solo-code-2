<template>
  <v-container class="py-12">
    <v-row justify="center">
      <v-col cols="12" md="6">
        <v-card v-if="attendee" class="pa-8">
          <div class="text-center mb-8">
            <div
              v-if="qrCodeUrl"
              class="d-flex justify-center mb-4"
            >
              <img :src="qrCodeUrl" alt="QR Code" style="width: 200px; height: 200px;" />
            </div>
            <h1 class="text-h3 font-weight-bold mb-2">电子票</h1>
            <p class="text-grey">请在活动现场出示此电子票</p>
          </div>

          <v-card outlined class="mb-6">
            <v-card-text class="pa-6">
              <div class="text-center mb-6">
                <h2 class="text-h5 font-weight-bold">{{ event?.title }}</h2>
                <p class="text-grey">{{ event?.location }}</p>
              </div>
              <v-divider class="my-4" style="border-style: dashed;"></v-divider>
              <v-row>
                <v-col cols="6">
                  <p class="text-grey mb-1">姓名</p>
                  <p class="font-weight-medium">{{ attendee.name }}</p>
                </v-col>
                <v-col cols="6">
                  <p class="text-grey mb-1">邮箱</p>
                  <p class="font-weight-medium">{{ attendee.email }}</p>
                </v-col>
                <v-col cols="6">
                  <p class="text-grey mb-1">门票类型</p>
                  <p class="font-weight-medium">{{ attendee.ticket_name }}</p>
                </v-col>
                <v-col cols="6">
                  <p class="text-grey mb-1">票码</p>
                  <p class="font-weight-medium font-mono">{{ attendee.ticket_code }}</p>
                </v-col>
                <v-col cols="6">
                  <p class="text-grey mb-1">开始时间</p>
                  <p class="font-weight-medium">{{ formatDate(event?.start_time) }}</p>
                </v-col>
                <v-col cols="6">
                  <p class="text-grey mb-1">状态</p>
                  <v-chip
                    :color="attendee.checked_in ? 'green' : 'grey'"
                    size="small"
                    label
                  >
                    {{ attendee.checked_in ? '已签到' : '未签到' }}
                  </v-chip>
                </v-col>
              </v-row>
            </v-card-text>
          </v-card>

          <v-row>
            <v-col cols="6">
              <v-btn block variant="outlined" router-link="/">
                返回首页
              </v-btn>
            </v-col>
            <v-col cols="6">
              <v-btn block color="primary" @click="downloadPdf">
                <v-icon class="mr-1">mdi-download</v-icon>
                下载PDF
              </v-btn>
            </v-col>
          </v-row>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import QRCode from 'qrcode'
import dayjs from 'dayjs'
import api from '../../services/api'

const route = useRoute()
const attendee = ref(null)
const event = ref(null)
const qrCodeUrl = ref('')

function formatDate(date) {
  if (!date) return ''
  return dayjs(date).format('YYYY年MM月DD日 HH:mm')
}

async function generateQRCode() {
  try {
    qrCodeUrl.value = await QRCode.toDataURL(route.params.ticketCode, {
      width: 300,
      margin: 2
    })
  } catch (e) {
    console.error('QR generation failed:', e)
  }
}

function downloadPdf() {
  window.open(`http://localhost:8000/api/public/tickets/${route.params.ticketCode}/download`, '_blank')
}

onMounted(async () => {
  try {
    const res = await api.get(`/public/tickets/${route.params.ticketCode}`)
    attendee.value = res.data.attendee
    event.value = res.data.event
    generateQRCode()
  } catch (e) {
    console.error('Failed to load ticket:', e)
  }
})
</script>
