<template>
  <div class="component-form-view">
    <div class="page-header">
      <h2 class="page-title">{{ isEdit ? '编辑元件' : '添加元件' }}</h2>
      <div class="page-actions">
        <Button 
          label="返回" 
          icon="pi pi-arrow-left" 
          severity="secondary" 
          @click="router.back()"
        />
      </div>
    </div>
    
    <div class="form-container">
      <form @submit.prevent="handleSubmit">
        <div class="form-section">
          <h3>基本信息</h3>
          <div class="form-grid">
            <div class="form-field">
              <label for="name">名称 <span class="required">*</span></label>
              <InputText id="name" v-model="form.name" required />
            </div>
            <div class="form-field">
              <label for="part_number">型号</label>
              <InputText id="part_number" v-model="form.part_number" />
            </div>
            <div class="form-field">
              <label for="category">类别</label>
              <Dropdown 
                id="category" 
                v-model="form.category" 
                :options="categories"
                placeholder="选择或输入类别"
                editable
                optionLabel="label"
                optionValue="value"
              />
            </div>
            <div class="form-field">
              <label for="package">封装</label>
              <Dropdown 
                id="package" 
                v-model="form.package" 
                :options="packages"
                placeholder="选择或输入封装"
                editable
                optionLabel="label"
                optionValue="value"
              />
            </div>
            <div class="form-field">
              <label for="value">值</label>
              <InputText id="value" v-model="form.value" placeholder="例如: 1kΩ, 100nF" />
            </div>
            <div class="form-field">
              <label for="tolerance">容差</label>
              <InputText id="tolerance" v-model="form.tolerance" placeholder="例如: ±1%, ±5%" />
            </div>
            <div class="form-field">
              <label for="voltage_rating">耐压</label>
              <InputText id="voltage_rating" v-model="form.voltage_rating" placeholder="例如: 50V" />
            </div>
            <div class="form-field">
              <label for="power_rating">功率</label>
              <InputText id="power_rating" v-model="form.power_rating" placeholder="例如: 1/8W" />
            </div>
            <div class="form-field full-width">
              <label for="description">描述</label>
              <Textarea id="description" v-model="form.description" :rows="3" />
            </div>
          </div>
        </div>
        
        <div class="form-section">
          <h3>库存与供应商</h3>
          <div class="form-grid">
            <div class="form-field">
              <label for="supplier_id">供应商</label>
              <Dropdown 
                id="supplier_id" 
                v-model="form.supplier_id" 
                :options="suppliers"
                placeholder="选择供应商"
                clearable
                optionLabel="label"
                optionValue="value"
              />
            </div>
            <div class="form-field">
              <label for="quantity">当前库存</label>
              <InputNumber id="quantity" v-model="form.quantity" :min="0" />
            </div>
            <div class="form-field">
              <label for="min_stock">最低库存 (告警阈值)</label>
              <InputNumber id="min_stock" v-model="form.min_stock" :min="0" />
            </div>
            <div class="form-field">
              <label for="unit_price">单价 (¥)</label>
              <InputNumber 
                id="unit_price" 
                v-model="form.unit_price" 
                :min="0" 
                mode="currency" 
                currency="CNY" 
                :minFractionDigits="2"
              />
            </div>
            <div class="form-field full-width">
              <label for="location">存放位置</label>
              <InputText id="location" v-model="form.location" placeholder="例如: Shelf-A-01" />
            </div>
          </div>
        </div>
        
        <div class="form-section">
          <h3>数据手册</h3>
          <div class="form-grid">
            <div class="form-field">
              <label for="datasheet_url">数据手册链接 (URL)</label>
              <InputText id="datasheet_url" v-model="form.datasheet_url" placeholder="https://..." />
            </div>
            <div class="form-field">
              <label for="datasheet_file">数据手册文件 (路径)</label>
              <InputText id="datasheet_file" v-model="form.datasheet_file" placeholder="/uploads/datasheets/..." />
            </div>
          </div>
        </div>
        
        <div class="form-actions">
          <Button 
            type="submit" 
            :label="isEdit ? '保存修改' : '创建元件'" 
            icon="pi pi-check"
            :loading="loading"
          />
          <Button 
            type="button" 
            label="取消" 
            icon="pi pi-times" 
            severity="secondary"
            @click="router.back()"
          />
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
import { componentApi, supplierApi } from '@/api'
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
  part_number: '',
  category: '',
  package: '',
  value: '',
  tolerance: '',
  voltage_rating: '',
  power_rating: '',
  description: '',
  datasheet_url: '',
  datasheet_file: '',
  supplier_id: null,
  quantity: 0,
  min_stock: 10,
  unit_price: null,
  location: ''
})

const categories = ref([])
const packages = ref([])
const suppliers = ref([])
const loading = ref(false)

const loadMetadata = async () => {
  try {
    const [catRes, pkgRes, supRes] = await Promise.all([
      componentApi.getCategories(),
      componentApi.getPackages(),
      supplierApi.getAll({ perPage: 100 })
    ])
    
    categories.value = catRes.data.data.map(c => ({ label: c, value: c }))
    packages.value = pkgRes.data.data.map(p => ({ label: p, value: p }))
    suppliers.value = supRes.data.data.map(s => ({ label: s.name, value: s.id }))
  } catch (error) {
    console.error('Failed to load metadata:', error)
  }
}

const loadComponent = async () => {
  if (!id) return
  loading.value = true
  try {
    const response = await componentApi.getById(id)
    const data = response.data.data
    Object.assign(form, {
      name: data.name,
      part_number: data.part_number || '',
      category: data.category || '',
      package: data.package || '',
      value: data.value || '',
      tolerance: data.tolerance || '',
      voltage_rating: data.voltage_rating || '',
      power_rating: data.power_rating || '',
      description: data.description || '',
      datasheet_url: data.datasheet_url || '',
      datasheet_file: data.datasheet_file || '',
      supplier_id: data.supplier_id || null,
      quantity: data.quantity || 0,
      min_stock: data.min_stock || 10,
      unit_price: data.unit_price || null,
      location: data.location || ''
    })
  } catch (error) {
    toast.add({ severity: 'error', summary: '加载失败', detail: '无法加载元件信息' })
  } finally {
    loading.value = false
  }
}

const handleSubmit = async () => {
  if (!form.name.trim()) {
    toast.add({ severity: 'error', summary: '请输入元件名称' })
    return
  }
  
  loading.value = true
  try {
    const payload = { ...form }
    
    if (isEdit.value) {
      await componentApi.update(id, payload)
      toast.add({ severity: 'success', summary: '已保存', detail: '元件已更新' })
    } else {
      await componentApi.create(payload)
      toast.add({ severity: 'success', summary: '已创建', detail: '元件已创建' })
    }
    router.push('/components')
  } catch (error) {
    toast.add({ severity: 'error', summary: '操作失败', detail: error.response?.data?.error || '请稍后重试' })
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await loadMetadata()
  if (isEdit.value) {
    await loadComponent()
  }
})
</script>

<style scoped>
.component-form-view {
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

.page-actions {
  display: flex;
  gap: 0.75rem;
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

.form-section h3 {
  margin: 0 0 1rem;
  color: #333;
  font-size: 1.1rem;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
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
</style>
