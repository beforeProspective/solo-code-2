<template>
  <div>
    <v-row class="mb-4">
      <v-col class="d-flex align-center">
        <v-btn icon class="mr-3" router-link="/events">
          <v-icon>mdi-arrow-left</v-icon>
        </v-btn>
        <h2 class="text-h5 font-weight-medium mb-0">
          {{ isEdit ? '编辑活动' : '创建活动' }}
        </h2>
      </v-col>
    </v-row>

    <v-card>
      <v-card-text>
        <v-form ref="form" v-model="valid">
          <v-row>
            <v-col cols="12" md="8">
              <v-text-field
                v-model="form.title"
                label="活动名称"
                :rules="titleRules"
                required
                class="mb-4"
              ></v-text-field>
              <v-textarea
                v-model="form.description"
                label="活动描述"
                rows="4"
                class="mb-4"
              ></v-textarea>
            </v-col>
            <v-col cols="12" md="4">
              <v-card class="pa-4" outlined>
                <p class="text-subtitle-2 font-weight-medium mb-3">封面图片</p>
                <div
                  class="d-flex align-center justify-center bg-grey-lighten-4 rounded"
                  style="height: 180px;"
                >
                  <v-img
                    v-if="form.cover_image"
                    :src="form.cover_image"
                    aspect-ratio="16/9"
                    cover
                  ></v-img>
                  <div v-else class="text-grey">
                    <v-icon size="48">mdi-image-plus</v-icon>
                    <p class="mt-2">上传封面图片</p>
                  </div>
                </div>
                <input
                  type="file"
                  ref="fileInput"
                  accept="image/*"
                  style="display: none"
                  @change="handleFileUpload"
                />
                <v-btn block class="mt-3" @click="triggerUpload">
                  选择图片
                </v-btn>
              </v-card>
            </v-col>
          </v-row>

          <v-row>
            <v-col cols="12" md="6">
              <v-text-field
                v-model="form.location"
                label="活动地点"
                :rules="locationRules"
                required
                class="mb-4"
              ></v-text-field>
            </v-col>
            <v-col cols="12" md="6">
              <v-text-field
                v-model="form.address"
                label="详细地址"
                class="mb-4"
              ></v-text-field>
            </v-col>
          </v-row>

          <v-row>
            <v-col cols="12" md="6">
              <v-text-field
                v-model="form.start_time"
                label="开始时间"
                type="datetime-local"
                :rules="timeRules"
                required
                class="mb-4"
              ></v-text-field>
            </v-col>
            <v-col cols="12" md="6">
              <v-text-field
                v-model="form.end_time"
                label="结束时间"
                type="datetime-local"
                :rules="endTimeRules"
                required
                class="mb-4"
              ></v-text-field>
            </v-col>
          </v-row>

          <v-row>
            <v-col cols="12" md="6">
              <v-switch
                v-model="form.is_published"
                label="发布活动（发布后公开可见）"
                color="primary"
              ></v-switch>
              <v-switch
                v-model="form.registration_open"
                label="开放报名"
                color="primary"
              ></v-switch>
            </v-col>
            <v-col cols="12" md="6">
              <v-text-field
                v-model="form.max_attendees"
                label="最大参会人数（不填则不限制）"
                type="number"
                class="mb-4"
              ></v-text-field>
            </v-col>
          </v-row>

          <v-divider class="my-6"></v-divider>

          <h3 class="text-h6 font-weight-medium mb-4">自定义报名表单</h3>
          <v-row>
            <v-col cols="12">
              <v-alert type="info" class="mb-4">
                添加额外的报名问题，例如：您的公司名称、是否需要发票等。
              </v-alert>
              <div v-for="(field, index) in form.custom_fields" :key="index" class="mb-3 d-flex align-center">
                <v-text-field
                  v-model="field.label"
                  label="问题标签"
                  class="flex-grow-1 mr-3"
                ></v-text-field>
                <v-select
                  v-model="field.type"
                  :items="fieldTypes"
                  label="类型"
                  class="mr-3"
                  style="width: 150px;"
                ></v-select>
                <v-switch
                  v-model="field.required"
                  label="必填"
                  class="mr-3"
                ></v-switch>
                <v-btn icon @click="removeCustomField(index)">
                  <v-icon color="error">mdi-delete</v-icon>
                </v-btn>
              </div>
              <v-btn variant="outlined" @click="addCustomField">
                <v-icon class="mr-2">mdi-plus</v-icon>
                添加自定义问题
              </v-btn>
            </v-col>
          </v-row>
        </v-form>
      </v-card-text>
      <v-card-actions class="px-4 pb-4">
        <v-spacer></v-spacer>
        <v-btn variant="outlined" router-link="/events">取消</v-btn>
        <v-btn color="primary" :loading="eventStore.loading" @click="handleSave">
          保存活动
        </v-btn>
      </v-card-actions>
    </v-card>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import dayjs from 'dayjs'
import { useEventStore } from '../../stores/event'

const router = useRouter()
const route = useRoute()
const eventStore = useEventStore()

const valid = ref(false)
const fileInput = ref(null)
const isEdit = computed(() => !!route.params.id)

const form = reactive({
  title: '',
  description: '',
  cover_image: '',
  location: '',
  address: '',
  start_time: '',
  end_time: '',
  is_published: false,
  registration_open: true,
  max_attendees: null,
  custom_fields: []
})

const fieldTypes = [
  { title: '文本', value: 'text' },
  { title: '多行文本', value: 'textarea' },
  { title: '数字', value: 'number' },
  { title: '选择框', value: 'select' },
  { title: '复选框', value: 'checkbox' }
]

const titleRules = [
  v => !!v || '请输入活动名称',
  v => (v && v.length <= 255) || '名称不能超过255个字符'
]

const locationRules = [
  v => !!v || '请输入活动地点'
]

const timeRules = [
  v => !!v || '请选择开始时间'
]

const endTimeRules = [
  v => !!v || '请选择结束时间',
  v => v > form.start_time || '结束时间必须晚于开始时间'
]

function formatForInput(date) {
  if (!date) return ''
  return dayjs(date).format('YYYY-MM-DDTHH:mm')
}

function formatForApi(date) {
  if (!date) return ''
  return dayjs(date).format('YYYY-MM-DD HH:mm:ss')
}

onMounted(async () => {
  if (isEdit.value) {
    try {
      const event = await eventStore.fetchEvent(route.params.id)
      form.title = event.title
      form.description = event.description || ''
      form.cover_image = event.cover_image || ''
      form.location = event.location
      form.address = event.address || ''
      form.start_time = formatForInput(event.start_time)
      form.end_time = formatForInput(event.end_time)
      form.is_published = event.is_published
      form.registration_open = event.registration_open
      form.max_attendees = event.max_attendees
      form.custom_fields = event.custom_fields || []
    } catch (e) {
      alert('加载活动失败')
    }
  }
})

function triggerUpload() {
  fileInput.value.click()
}

async function handleFileUpload(e) {
  const file = e.target.files[0]
  if (!file) return
  try {
    const result = await eventStore.uploadImage(file)
    form.cover_image = result.url
  } catch (e) {
    alert('上传失败')
  }
}

function addCustomField() {
  form.custom_fields.push({
    label: '',
    type: 'text',
    required: false
  })
}

function removeCustomField(index) {
  form.custom_fields.splice(index, 1)
}

async function handleSave() {
  const data = {
    ...form,
    start_time: formatForApi(form.start_time),
    end_time: formatForApi(form.end_time),
    max_attendees: form.max_attendees ? parseInt(form.max_attendees) : null
  }

  try {
    if (isEdit.value) {
      await eventStore.updateEvent(route.params.id, data)
    } else {
      const result = await eventStore.createEvent(data)
    }
    router.push('/events')
  } catch (e) {
    alert('保存失败：' + (e.response?.data?.message || '未知错误'))
  }
}
</script>
