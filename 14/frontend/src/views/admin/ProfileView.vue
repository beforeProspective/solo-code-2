<template>
  <div>
    <v-row class="mb-4">
      <v-col>
        <h2 class="text-h5 font-weight-medium mb-0">个人资料</h2>
      </v-col>
    </v-row>

    <v-card>
      <v-card-title>基本信息</v-card-title>
      <v-card-text>
        <v-form v-model="valid" @submit.prevent="handleUpdate">
          <v-row>
            <v-col cols="12" md="6">
              <v-text-field
                v-model="form.name"
                label="姓名"
                :rules="nameRules"
                required
                class="mb-4"
              ></v-text-field>
            </v-col>
            <v-col cols="12" md="6">
              <v-text-field
                v-model="form.email"
                label="邮箱"
                :rules="emailRules"
                required
                class="mb-4"
              ></v-text-field>
            </v-col>
          </v-row>
          <v-row>
            <v-col cols="12" md="6">
              <v-text-field
                v-model="form.organization"
                label="组织名称"
                class="mb-4"
              ></v-text-field>
            </v-col>
            <v-col cols="12" md="6">
              <v-text-field
                v-model="form.phone"
                label="联系电话"
                class="mb-4"
              ></v-text-field>
            </v-col>
          </v-row>

          <v-divider class="my-6"></v-divider>

          <h3 class="text-subtitle-1 font-weight-medium mb-4">修改密码</h3>
          <v-row>
            <v-col cols="12" md="6">
              <v-text-field
                v-model="form.password"
                label="新密码（留空则不修改）"
                :type="showPassword ? 'text' : 'password'"
                :append-icon="showPassword ? 'mdi-eye' : 'mdi-eye-off'"
                @click:append="showPassword = !showPassword"
                class="mb-4"
              ></v-text-field>
            </v-col>
            <v-col cols="12" md="6">
              <v-text-field
                v-model="form.password_confirmation"
                label="确认新密码"
                :type="showConfirmPassword ? 'text' : 'password'"
                :append-icon="showConfirmPassword ? 'mdi-eye' : 'mdi-eye-off'"
                @click:append="showConfirmPassword = !showConfirmPassword"
                :rules="confirmPasswordRules"
                class="mb-4"
              ></v-text-field>
            </v-col>
          </v-row>

          <v-card-actions class="px-0">
            <v-spacer></v-spacer>
            <v-btn
              type="submit"
              color="primary"
              :loading="authStore.loading"
            >
              保存修改
            </v-btn>
          </v-card-actions>
        </v-form>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useAuthStore } from '../../stores/auth'

const authStore = useAuthStore()

const valid = ref(false)
const showPassword = ref(false)
const showConfirmPassword = ref(false)

const user = computed(() => authStore.user)

const form = reactive({
  name: '',
  email: '',
  organization: '',
  phone: '',
  password: '',
  password_confirmation: ''
})

const nameRules = [
  v => !!v || '请输入姓名'
]

const emailRules = [
  v => !!v || '请输入邮箱',
  v => /.+@.+/.test(v) || '请输入有效的邮箱地址'
]

const confirmPasswordRules = [
  v => !form.password || v === form.password || '两次输入的密码不一致'
]

onMounted(() => {
  if (user.value) {
    form.name = user.value.name
    form.email = user.value.email
    form.organization = user.value.organization || ''
    form.phone = user.value.phone || ''
  }
})

async function handleUpdate() {
  const data = { ...form }
  if (!data.password) {
    delete data.password
    delete data.password_confirmation
  }

  try {
    await authStore.updateProfile(data)
    alert('资料更新成功')
  } catch (e) {
    alert('更新失败：' + (e.response?.data?.message || '未知错误'))
  }
}
</script>
