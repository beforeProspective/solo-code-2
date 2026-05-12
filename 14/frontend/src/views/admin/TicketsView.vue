<template>
  <div>
    <v-row class="mb-4">
      <v-col class="d-flex align-center">
        <v-btn icon class="mr-3" router-link="/events">
          <v-icon>mdi-arrow-left</v-icon>
        </v-btn>
        <h2 class="text-h5 font-weight-medium mb-0">
          门票管理 - {{ event?.title || '加载中...' }}
        </h2>
      </v-col>
      <v-col class="text-right">
        <v-btn color="primary" @click="openDialog()" prepend-icon="mdi-plus">
          添加门票
        </v-btn>
      </v-col>
    </v-row>

    <v-card>
      <v-data-table
        :loading="loading"
        :headers="headers"
        :items="tickets"
        :items-per-page="10"
        class="elevation-1"
      >
        <template v-slot:item.type="{ item }">
          <v-chip
            :color="getTypeColor(item.type)"
            size="small"
            label
          >
            {{ getTypeLabel(item.type) }}
          </v-chip>
        </template>
        <template v-slot:item.price="{ item }">
          <span v-if="item.type === 'free'">免费</span>
          <span v-else-if="item.type === 'donation'">最低 ¥{{ item.min_donation }}</span>
          <span v-else>¥{{ item.price }}</span>
        </template>
        <template v-slot:item.quantity="{ item }">
          {{ item.quantity ? item.quantity : '不限' }}
        </template>
        <template v-slot:item.is_active="{ item }">
          <v-chip :color="item.is_active ? 'green' : 'grey'" size="small" label>
            {{ item.is_active ? '启用' : '停用' }}
          </v-chip>
        </template>
        <template v-slot:item.actions="{ item }">
          <v-btn icon small class="mr-1" @click="openDialog(item)">
            <v-icon>mdi-pencil</v-icon>
          </v-btn>
          <v-btn icon small color="error" @click="confirmDelete(item)">
            <v-icon>mdi-delete</v-icon>
          </v-btn>
        </template>
      </v-data-table>
    </v-card>

    <v-dialog v-model="dialogVisible" max-width="600">
      <v-card>
        <v-card-title>
          {{ editingTicket ? '编辑门票' : '添加门票' }}
        </v-card-title>
        <v-card-text>
          <v-form ref="ticketForm" v-model="ticketValid">
            <v-text-field
              v-model="ticketForm.name"
              label="门票名称"
              required
              class="mb-4"
            ></v-text-field>
            <v-textarea
              v-model="ticketForm.description"
              label="门票描述"
              class="mb-4"
              rows="2"
            ></v-textarea>
            <v-select
              v-model="ticketForm.type"
              label="门票类型"
              :items="ticketTypes"
              required
              class="mb-4"
            ></v-select>
            <v-text-field
              v-if="ticketForm.type === 'paid'"
              v-model.number="ticketForm.price"
              label="价格"
              type="number"
              min="0"
              step="0.01"
              required
              class="mb-4"
            ></v-text-field>
            <v-text-field
              v-if="ticketForm.type === 'donation'"
              v-model.number="ticketForm.min_donation"
              label="最低捐赠金额"
              type="number"
              min="0"
              step="0.01"
              class="mb-4"
            ></v-text-field>
            <v-text-field
              v-model.number="ticketForm.quantity"
              label="可售数量（不填则不限）"
              type="number"
              min="1"
              class="mb-4"
            ></v-text-field>
            <v-row>
              <v-col cols="6">
                <v-text-field
                  v-model="ticketForm.start_sale_at"
                  label="开售时间"
                  type="datetime-local"
                  class="mb-4"
                ></v-text-field>
              </v-col>
              <v-col cols="6">
                <v-text-field
                  v-model="ticketForm.end_sale_at"
                  label="停售时间"
                  type="datetime-local"
                  class="mb-4"
                ></v-text-field>
              </v-col>
            </v-row>
            <v-switch
              v-model="ticketForm.is_active"
              label="启用此门票"
              color="primary"
            ></v-switch>
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn variant="outlined" @click="dialogVisible = false">取消</v-btn>
          <v-btn color="primary" :disabled="!ticketValid" @click="saveTicket">
            保存
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import dayjs from 'dayjs'
import api from '../../services/api'

const route = useRoute()

const loading = ref(true)
const event = ref(null)
const tickets = ref([])
const dialogVisible = ref(false)
const editingTicket = ref(null)
const ticketValid = ref(false)

const ticketTypes = [
  { title: '免费', value: 'free' },
  { title: '付费', value: 'paid' },
  { title: '捐赠', value: 'donation' }
]

const headers = [
  { title: '名称', value: 'name' },
  { title: '类型', value: 'type' },
  { title: '价格', value: 'price' },
  { title: '数量', value: 'quantity' },
  { title: '状态', value: 'is_active' },
  { title: '操作', value: 'actions', sortable: false }
]

const ticketForm = reactive({
  name: '',
  description: '',
  type: 'free',
  price: 0,
  min_donation: 0,
  quantity: null,
  start_sale_at: '',
  end_sale_at: '',
  is_active: true
})

function formatForInput(date) {
  if (!date) return ''
  return dayjs(date).format('YYYY-MM-DDTHH:mm')
}

function formatForApi(date) {
  if (!date) return null
  return dayjs(date).format('YYYY-MM-DD HH:mm:ss')
}

function getTypeLabel(type) {
  const labels = { free: '免费', paid: '付费', donation: '捐赠' }
  return labels[type] || type
}

function getTypeColor(type) {
  const colors = { free: 'green', paid: 'primary', donation: 'orange' }
  return colors[type] || 'grey'
}

async function loadData() {
  loading.value = true
  try {
    const eventRes = await api.get(`/events/${route.params.eventId}`)
    event.value = eventRes.data
    
    const ticketsRes = await api.get(`/events/${route.params.eventId}/tickets`)
    tickets.value = ticketsRes.data
  } catch (e) {
    console.error('Failed to load:', e)
  } finally {
    loading.value = false
  }
}

onMounted(loadData)

function resetTicketForm() {
  ticketForm.name = ''
  ticketForm.description = ''
  ticketForm.type = 'free'
  ticketForm.price = 0
  ticketForm.min_donation = 0
  ticketForm.quantity = null
  ticketForm.start_sale_at = ''
  ticketForm.end_sale_at = ''
  ticketForm.is_active = true
}

function openDialog(ticket = null) {
  resetTicketForm()
  editingTicket.value = ticket
  
  if (ticket) {
    ticketForm.name = ticket.name
    ticketForm.description = ticket.description || ''
    ticketForm.type = ticket.type
    ticketForm.price = ticket.price || 0
    ticketForm.min_donation = ticket.min_donation || 0
    ticketForm.quantity = ticket.quantity
    ticketForm.start_sale_at = formatForInput(ticket.start_sale_at)
    ticketForm.end_sale_at = formatForInput(ticket.end_sale_at)
    ticketForm.is_active = ticket.is_active
  }
  
  dialogVisible.value = true
}

async function saveTicket() {
  const data = {
    name: ticketForm.name,
    description: ticketForm.description,
    type: ticketForm.type,
    is_active: ticketForm.is_active,
    start_sale_at: formatForApi(ticketForm.start_sale_at),
    end_sale_at: formatForApi(ticketForm.end_sale_at),
    quantity: ticketForm.quantity || null
  }
  
  if (ticketForm.type === 'paid') {
    data.price = ticketForm.price
  }
  if (ticketForm.type === 'donation') {
    data.min_donation = ticketForm.min_donation
  }
  
  try {
    if (editingTicket.value) {
      await api.put(`/events/${route.params.eventId}/tickets/${editingTicket.value.id}`, data)
    } else {
      await api.post(`/events/${route.params.eventId}/tickets`, data)
    }
    dialogVisible.value = false
    await loadData()
  } catch (e) {
    alert('保存失败：' + (e.response?.data?.message || '未知错误'))
  }
}

async function confirmDelete(ticket) {
  if (confirm(`确定要删除门票"${ticket.name}"吗？`)) {
    try {
      await api.delete(`/events/${route.params.eventId}/tickets/${ticket.id}`)
      await loadData()
    } catch (e) {
      alert('删除失败')
    }
  }
}
</script>
