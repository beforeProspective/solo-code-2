<template>
  <div v-if="event">
    <v-container class="my-8">
      <v-row>
        <v-col cols="12">
          <v-btn icon class="mb-4" router-link="`/events/${event.slug}`">
            <v-icon>mdi-arrow-left</v-icon>
          </v-btn>
          <h1 class="text-h3 font-weight-bold mb-2">{{ event.title }}</h1>
          <p class="text-grey mb-6">填写以下信息完成报名</p>
        </v-col>
      </v-row>

      <v-row>
        <v-col cols="12" md="8">
          <v-card>
            <v-card-title>1. 选择门票</v-card-title>
            <v-card-text>
              <div
                v-for="(ticket, index) in event.tickets"
                :key="ticket.id"
                class="mb-4"
              >
                <v-card outlined>
                  <v-card-text>
                    <v-row>
                      <v-col cols="6">
                        <h3 class="text-subtitle-1 font-weight-medium">{{ ticket.name }}</h3>
                        <p class="text-caption text-grey">{{ ticket.description || '' }}</p>
                        <p class="text-h5 font-weight-bold text-primary mt-2">
                          {{ getTicketPrice(ticket) }}
                        </p>
                      </v-col>
                      <v-col cols="6" class="text-right">
                        <v-spacer></v-spacer>
                        <div class="d-inline-flex align-center">
                          <v-btn icon @click="decreaseQty(ticket.id)" :disabled="getQty(ticket.id) === 0">
                            <v-icon>mdi-minus</v-icon>
                          </v-btn>
                          <div class="px-4 text-h5">{{ getQty(ticket.id) }}</div>
                          <v-btn icon @click="increaseQty(ticket.id)" :disabled="isMaxQty(ticket)">
                            <v-icon>mdi-plus</v-icon>
                          </v-btn>
                        </div>
                        <v-text-field
                          v-if="ticket.type === 'donation' && getQty(ticket.id) > 0"
                          v-model.number="donationAmounts[ticket.id]"
                          label="捐赠金额"
                          type="number"
                          :min="ticket.min_donation"
                          class="mt-3"
                          style="max-width: 160px;"
                        ></v-text-field>
                      </v-col>
                    </v-row>
                  </v-card-text>
                </v-card>
              </div>

              <v-alert v-if="totalQty === 0" type="warning" class="mb-4">
                请至少选择一张门票
              </v-alert>
            </v-card-text>
          </v-card>

          <v-card class="mt-6" v-if="totalQty > 0">
            <v-card-title>2. 填写报名信息</v-card-title>
            <v-card-text>
              <v-form ref="form" v-model="valid">
                <h3 class="text-subtitle-1 font-weight-medium mb-4">联系人信息</h3>
                <v-row>
                  <v-col cols="12" md="6">
                    <v-text-field
                      v-model="customerForm.name"
                      label="姓名"
                      required
                      class="mb-4"
                    ></v-text-field>
                  </v-col>
                  <v-col cols="12" md="6">
                    <v-text-field
                      v-model="customerForm.email"
                      label="邮箱"
                      type="email"
                      required
                      class="mb-4"
                    ></v-text-field>
                  </v-col>
                  <v-col cols="12" md="6">
                    <v-text-field
                      v-model="customerForm.phone"
                      label="电话"
                      class="mb-4"
                    ></v-text-field>
                  </v-col>
                </v-row>

                <v-divider class="my-4"></v-divider>

                <h3 class="text-subtitle-1 font-weight-medium mb-4">每位参会者信息</h3>
                <v-card
                  v-for="(attendee, index) in attendees"
                  :key="index"
                  class="mb-4"
                  outlined
                >
                  <v-card-title class="text-subtitle-1">
                    参会者 {{ index + 1 }}（{{ getTicketName(attendee.ticketId) }}）
                  </v-card-title>
                  <v-card-text>
                    <v-row>
                      <v-col cols="12" md="6">
                        <v-text-field
                          v-model="attendee.name"
                          label="姓名"
                          required
                        ></v-text-field>
                      </v-col>
                      <v-col cols="12" md="6">
                        <v-text-field
                          v-model="attendee.email"
                          label="邮箱"
                          type="email"
                          required
                        ></v-text-field>
                      </v-col>
                    </v-row>
                  </v-card-text>
                </v-card>

                <template v-if="event.custom_fields?.length">
                  <v-divider class="my-4"></v-divider>
                  <h3 class="text-subtitle-1 font-weight-medium mb-4">其他信息</h3>
                  <v-row>
                    <v-col
                      cols="12"
                      v-for="field in event.custom_fields"
                      :key="field.label"
                    >
                      <v-text-field
                        v-model="customFormData[field.label]"
                        :label="field.label"
                        :required="field.required"
                      ></v-text-field>
                    </v-col>
                  </v-row>
                </template>
              </v-form>
            </v-card-text>
          </v-card>
        </v-col>

        <v-col cols="12" md="4">
          <v-card class="sticky-top">
            <v-card-title>订单摘要</v-card-title>
            <v-card-text>
              <div v-for="(ticket, index) in selectedTickets" :key="index" class="mb-3">
                <div class="d-flex justify-between">
                  <span>{{ ticket.name }} x {{ ticket.qty }}</span>
                  <span>¥{{ ticket.subtotal.toFixed(2) }}</span>
                </div>
              </div>
              <v-divider class="my-3"></v-divider>
              <div class="d-flex justify-between text-h5 font-weight-bold">
                <span>总计</span>
                <span class="text-primary">¥{{ totalAmount.toFixed(2) }}</span>
              </div>
              <v-btn
                block
                color="primary"
                size="large"
                class="mt-6"
                :loading="submitting"
                :disabled="totalQty === 0 || !valid"
                @click="handleSubmit"
              >
                确认报名
              </v-btn>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </v-container>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import api from '../../services/api'

const router = useRouter()
const route = useRoute()

const event = ref(null)
const valid = ref(true)
const submitting = ref(false)

const ticketQuantities = reactive({})
const donationAmounts = reactive({})

const customerForm = reactive({
  name: '',
  email: '',
  phone: ''
})

const attendees = ref([])
const customFormData = reactive({})

const totalQty = computed(() => {
  return Object.values(ticketQuantities).reduce((sum, qty) => sum + qty, 0)
})

const selectedTickets = computed(() => {
  if (!event.value?.tickets) return []
  return event.value.tickets
    .filter(t => (ticketQuantities[t.id] || 0) > 0)
    .map(t => {
      const qty = ticketQuantities[t.id]
      let price = t.price
      if (t.type === 'donation') {
        price = donationAmounts[t.id] || t.min_donation || 0
      }
      return {
        id: t.id,
        name: t.name,
        qty,
        price,
        subtotal: price * qty
      }
    })
})

const totalAmount = computed(() => {
  return selectedTickets.value.reduce((sum, t) => sum + t.subtotal, 0)
})

function getTicketPrice(ticket) {
  if (ticket.type === 'free') return '免费'
  if (ticket.type === 'donation') return '捐赠 ¥' + (ticket.min_donation || 0) + ' 起'
  return '¥' + ticket.price
}

function getQty(ticketId) {
  return ticketQuantities[ticketId] || 0
}

function increaseQty(ticketId) {
  ticketQuantities[ticketId] = (ticketQuantities[ticketId] || 0) + 1
}

function decreaseQty(ticketId) {
  if (ticketQuantities[ticketId] > 0) {
    ticketQuantities[ticketId]--
  }
}

function isMaxQty(ticket) {
  if (!ticket.quantity) return false
  return (ticketQuantities[ticket.id] || 0) >= ticket.quantity
}

function getTicketName(ticketId) {
  const ticket = event.value?.tickets?.find(t => t.id === ticketId)
  return ticket?.name || ''
}

function syncAttendees() {
  const newAttendees = []
  for (const ticket of selectedTickets.value) {
    for (let i = 0; i < ticket.qty; i++) {
      const existing = attendees.value.find(a => a.ticketId === ticket.id && a.ticketIndex === i)
      newAttendees.push({
        ticketId: ticket.id,
        ticketIndex: i,
        name: existing?.name || customerForm.name,
        email: existing?.email || customerForm.email,
        phone: existing?.phone || customerForm.phone
      })
    }
  }
  attendees.value = newAttendees
}

watch([() => Object.values(ticketQuantities), () => Object.values(donationAmounts)], syncAttendees, { deep: true })

watch(() => customerForm.name, (val) => {
  attendees.value.forEach(a => {
    if (!a.name) a.name = val
  })
})

watch(() => customerForm.email, (val) => {
  attendees.value.forEach(a => {
    if (!a.email) a.email = val
  })
})

onMounted(async () => {
  try {
    const res = await api.get(`/public/events/${route.params.slug}`)
    event.value = res.data

    if (route.query.ticket) {
      ticketQuantities[parseInt(route.query.ticket)] = 1
    }
  } catch (e) {
    console.error('Failed to load event:', e)
  }
})

async function handleSubmit() {
  if (totalQty.value === 0) return

  submitting.value = true
  try {
    const tickets = selectedTickets.value.map(t => ({
      ticket_id: t.id,
      quantity: t.qty,
      price: t.price
    }))

    const data = {
      customer_name: customerForm.name,
      customer_email: customerForm.email,
      customer_phone: customerForm.phone || null,
      tickets,
      attendees: attendees.value.map(a => ({
        name: a.name,
        email: a.email,
        phone: a.phone || null
      })),
      form_data: Object.keys(customFormData).length ? customFormData : null
    }

    const res = await api.post(`/public/events/${route.params.slug}/register`, data)
    router.push(`/order/${res.data.order.order_number}`)
  } catch (e) {
    alert('报名失败：' + (e.response?.data?.message || '未知错误'))
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.sticky-top {
  position: sticky;
  top: 20px;
}
</style>
