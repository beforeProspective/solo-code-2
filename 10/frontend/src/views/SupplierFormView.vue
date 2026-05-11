<template>
  <div class="supplier-form-view">
    <div class="page-header">
      <h2 class="page-title">{{ isEdit ? '编辑供应商' : '添加供应商' }}</h2>
      <Button label="返回" icon="pi pi-arrow-left" severity="secondary" @click="router.back()" />
    </div>
    
    <div class="form-container">
      <form @submit.prevent="handleSubmit">
        <div class="form-grid">
          <div class="form-field">
            <label for="name">名称 <span class="required">*</span></label>
            <InputText id="name" v-model="form.name" required />
          </div>
          <div class="form-field">
            <label for="contact_person">联系人</label>
            <InputText id="contact_person" v-model="form.contact_person" />
          </div>
          <div class="form-field">
            <label for="phone">电话</label>
            <InputText id="phone" v-model="form.phone" />
          </div>
          <div class="form-field">
            <label for="email">邮箱</label>
            <InputText id="email" v-model="form.email" type="email" />
          </div>
          <div class="form-field">
            <label for="website">网站</label>
            <InputText id="website" v-model="form.website" placeholder="https://..." />
          </div>
          <div class="form-field full-width">
            <label for="address">地址</label>
            <Textarea id="address" v-model="form.address" :rows="2" />
          </div>
        </div>
        
        <div class="form-actions">
          <Button type="submit" :label="isEdit ? '保存修改' : '创建供应商'" icon="pi pi-check" :loading="loading" />
          <Button type="button" label="取消" icon="pi pi-times" severity="secondary" @click="router.back()" />
        </div>
      </form>
    </div>
    
    <Toast />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { supplierApi } from '@/api'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Toast from 'primevue/toast'

const router = useRouter()
const route = useRoute()
const toast = useToast()

const id = route.params.id
const isEdit = computed(() => !!id)

const form = reactive({
  name: '',
  contact_person: '',
  phone: '',
  email: '',
  address: '',
  website: ''
})

const loading = ref(false)

const loadSupplier = async () => {
  if (!id) return
  loading.value = true
  try {
    const response = await supplierApi.getById(id)
    Object.assign(form, response.data.data)
  } catch (error) {
    toast.add({ severity: 'error', summary: '加载失败' })
  } finally {
    loading.value = false
  }
}

const handleSubmit = async () => {
  if (!form.name.trim()) {
    toast.add({ severity: 'error', summary: '请输入供应商名称' })
    return
  }
  
  loading.value = true
  try {
    if (isEdit.value) {
      await supplierApi.update(id, form)
      toast.add({ severity: 'success', summary: '已保存' })
    } else {
      await supplierApi.create(form)
      toast.add({ severity: 'success', summary: '已创建' })
    }
    router.push('/suppliers')
  } catch (error) {
    toast.add({ severity: 'error', summary: '操作失败' })
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (isEdit.value) loadSupplier()
})
</script>

<style scoped>
.supplier-form-view {
  padding: 0;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.page-title {
  margin: 0;
  color: #333;
  font-size: 1.75rem;
}

.form-container {
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1rem;
  margin-bottom: 1rem;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-field.full-width {
  grid-column: 1 / -1;
}

.form-field label {
  font-size: 0.875rem;
  font-weight: 600;
  color: #333;
}

.required {
  color: #f44336;
}

.form-actions {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
  padding-top: 1rem;
  border-top: 1px solid #e9ecef;
  margin-top: 1rem;
}
</style>
