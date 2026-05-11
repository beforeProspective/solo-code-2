<template>
  <div class="bom-form-view">
    <div class="page-header">
      <h2 class="page-title">{{ isEdit ? '编辑 BOM' : '创建 BOM' }}</h2>
      <Button label="返回" icon="pi pi-arrow-left" severity="secondary" @click="router.back()" />
    </div>
    
    <div class="form-container">
      <div class="form-section">
        <h3>基本信息</h3>
        <div class="form-grid">
          <div class="form-field">
            <label>BOM 名称 <span class="required">*</span></label>
            <InputText v-model="form.name" required />
          </div>
          <div class="form-field">
            <label>项目名称</label>
            <InputText v-model="form.project_name" />
          </div>
          <div class="form-field full-width">
            <label>描述</label>
            <Textarea v-model="form.description" :rows="2" />
          </div>
        </div>
      </div>
      
      <div class="form-section">
        <div class="section-header">
          <h3>BOM 项目</h3>
          <Button label="添加项目" icon="pi pi-plus" @click="addBomItem" size="small" />
        </div>
        
        <div v-if="form.items.length === 0" class="empty-state">
          <p>暂无项目，点击"添加项目"按钮添加</p>
        </div>
        
        <div v-else class="items-table">
          <div v-for="(item, index) in form.items" :key="index" class="item-row">
            <div class="item-field">
              <label>位号</label>
              <InputText v-model="item.reference_designator" placeholder="例如: R1, C2" />
            </div>
            <div class="item-field" style="flex: 2;">
              <label>元件</label>
              <Dropdown 
                v-model="item.component_id" 
                :options="components"
                optionLabel="label"
                optionValue="value"
                placeholder="选择元件"
                filter
                showClear
                style="width: 100%;"
              />
            </div>
            <div class="item-field">
              <label>数量</label>
              <InputNumber v-model="item.quantity" :min="1" size="small" style="width: 100%;" />
            </div>
            <div class="item-field" style="flex: 1.5;">
              <label>备注</label>
              <InputText v-model="item.notes" placeholder="备注..." />
            </div>
            <div class="item-field item-actions">
              <Button icon="pi pi-trash" text severity="danger" size="small" @click="removeItem(index)" />
            </div>
          </div>
        </div>
      </div>
      
      <div class="form-actions">
        <Button :label="isEdit ? '保存修改' : '创建 BOM'" icon="pi pi-check" @click="handleSubmit" :loading="loading" />
        <Button label="取消" icon="pi pi-times" severity="secondary" @click="router.back()" />
      </div>
    </div>
    
    <Toast />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { bomApi, componentApi } from '@/api'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import InputNumber from 'primevue/inputnumber'
import Dropdown from 'primevue/dropdown'
import Toast from 'primevue/toast'

const router = useRouter()
const route = useRoute()
const toast = useToast()

const id = route.params.id
const isEdit = computed(() => !!id)

const form = reactive({
  name: '',
  project_name: '',
  description: '',
  items: []
})

const components = ref([])
const loading = ref(false)

const addBomItem = () => {
  form.items.push({
    component_id: null,
    quantity: 1,
    reference_designator: '',
    notes: ''
  })
}

const removeItem = (index) => {
  form.items.splice(index, 1)
}

const loadComponents = async () => {
  try {
    const response = await componentApi.getAll({ perPage: 500 })
    components.value = response.data.data.map(c => ({
      label: `${c.name}${c.part_number ? ' (' + c.part_number + ')' : ''}`,
      value: c.id
    }))
  } catch (error) {
    console.error('Failed to load components:', error)
  }
}

const loadBom = async () => {
  if (!id) return
  loading.value = true
  try {
    const response = await bomApi.getById(id)
    const data = response.data.data
    Object.assign(form, {
      name: data.name,
      project_name: data.project_name || '',
      description: data.description || '',
      items: data.items?.map(item => ({
        component_id: item.component_id,
        quantity: item.quantity,
        reference_designator: item.reference_designator || '',
        notes: item.notes || ''
      })) || []
    })
  } catch (error) {
    toast.add({ severity: 'error', summary: '加载失败' })
  } finally {
    loading.value = false
  }
}

const handleSubmit = async () => {
  if (!form.name.trim()) {
    toast.add({ severity: 'error', summary: '请输入 BOM 名称' })
    return
  }
  
  loading.value = true
  try {
    const payload = { ...form }
    payload.items = payload.items.filter(item => item.component_id)
    
    if (isEdit.value) {
      await bomApi.update(id, payload)
      toast.add({ severity: 'success', summary: '已保存' })
    } else {
      await bomApi.create(payload)
      toast.add({ severity: 'success', summary: '已创建' })
    }
    router.push('/boms')
  } catch (error) {
    toast.add({ severity: 'error', summary: '操作失败' })
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await loadComponents()
  if (isEdit.value) {
    await loadBom()
  }
})
</script>

<style scoped>
.bom-form-view {
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

.form-section {
  margin-bottom: 1.5rem;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.form-section h3 {
  margin: 0 0 1rem;
  color: #333;
  font-size: 1.1rem;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1rem;
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

.empty-state {
  text-align: center;
  padding: 2rem;
  color: #666;
}

.items-table {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.item-row {
  display: flex;
  gap: 0.75rem;
  padding: 0.5rem;
  background: #f8f9fa;
  border-radius: 4px;
  align-items: flex-end;
}

.item-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 100px;
}

.item-field label {
  font-size: 0.75rem;
  color: #666;
}

.item-actions {
  min-width: 40px;
}
</style>
