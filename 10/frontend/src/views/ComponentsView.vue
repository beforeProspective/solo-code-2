<template>
  <div class="components-view">
    <h2 class="page-title">元件管理</h2>
    
    <div class="page-actions">
      <Button 
        label="高级搜索" 
        icon="pi pi-sliders-h" 
        :outlined="!showAdvanced" 
        severity="secondary"
        @click="showAdvanced = !showAdvanced"
      />
      <Button 
        label="添加元件" 
        icon="pi pi-plus" 
        @click="router.push('/components/new')"
      />
    </div>
    
    <div v-if="showAdvanced" class="search-section">
      <h3>高级搜索条件</h3>
      <div class="search-form">
        <div class="form-grid">
          <div class="form-field">
            <label>类别</label>
            <Dropdown 
              v-model="searchFilters.category" 
              :options="categories" 
              placeholder="选择类别" 
              clearable
              optionLabel="label"
              optionValue="value"
            />
          </div>
          <div class="form-field">
            <label>封装</label>
            <Dropdown 
              v-model="searchFilters.package" 
              :options="packages" 
              placeholder="选择封装" 
              clearable
              optionLabel="label"
              optionValue="value"
            />
          </div>
          <div class="form-field">
            <label>值 (精确匹配)</label>
            <InputText 
              v-model="searchFilters.value" 
              placeholder="例如: 1kΩ, 100nF"
            />
          </div>
        </div>
        <div class="search-actions">
          <Button 
            label="应用搜索" 
            icon="pi pi-search" 
            @click="applyAdvancedSearch"
          />
          <Button 
            label="清除条件" 
            icon="pi pi-times" 
            severity="secondary" 
            @click="clearAdvancedSearch"
          />
        </div>
      </div>
    </div>
    
    <div class="table-section">
      <h3>元件列表</h3>
      <DataTable :value="components" :loading="loading" stripedRows>
        <Column field="id" header="ID" style="width: 80px;" />
        <Column field="name" header="名称" />
        <Column field="category" header="类别" style="width: 120px;" />
        <Column field="package" header="封装" style="width: 100px;" />
        <Column field="value" header="值" style="width: 120px;" />
        <Column field="quantity" header="库存" style="width: 100px;" />
        <Column field="supplier_name" header="供应商" style="width: 120px;" />
        <Column field="unit_price" header="单价" style="width: 100px;" />
      </DataTable>
    </div>
    
    <ConfirmDialog />
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { componentApi } from '@/api'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Dropdown from 'primevue/dropdown'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import ConfirmDialog from 'primevue/confirmdialog'

const router = useRouter()
const toast = useToast()
const confirm = useConfirm()

const components = ref([])
const loading = ref(false)
const totalRecords = ref(0)
const categories = ref([])
const packages = ref([])
const showAdvanced = ref(false)

const searchFilters = ref({
  search: '',
  category: null,
  package: null,
  value: null,
  page: 1,
  perPage: 10
})

const activeFilters = computed(() => {
  const filters = []
  if (searchFilters.value.category) filters.push('类别')
  if (searchFilters.value.package) filters.push('封装')
  if (searchFilters.value.value) filters.push('值')
  return filters
})

const loadComponents = async () => {
  loading.value = true
  try {
    const params = { ...searchFilters.value }
    Object.keys(params).forEach(key => {
      if (params[key] === null || params[key] === undefined || params[key] === '') {
        delete params[key]
      }
    })
    
    const response = await componentApi.getAll(params)
    components.value = response.data.data
    totalRecords.value = response.data.pagination.total
  } catch (error) {
    console.error('Failed to load components:', error)
    toast.add({ severity: 'error', summary: '加载失败', detail: '无法加载元件列表' })
  } finally {
    loading.value = false
  }
}

const loadMetadata = async () => {
  try {
    const [catRes, pkgRes] = await Promise.all([
      componentApi.getCategories(),
      componentApi.getPackages()
    ])
    
    categories.value = catRes.data.data.map(c => ({ label: c, value: c }))
    packages.value = pkgRes.data.data.map(p => ({ label: p, value: p }))
  } catch (error) {
    console.error('Failed to load metadata:', error)
  }
}

const applyAdvancedSearch = () => {
  searchFilters.value.page = 1
  loadComponents()
  toast.add({ severity: 'info', summary: '搜索已应用', detail: `找到 ${totalRecords.value} 个元件` })
}

const clearAdvancedSearch = () => {
  searchFilters.value = {
    search: '',
    category: null,
    package: null,
    value: null,
    page: 1,
    perPage: 10
  }
  loadComponents()
  toast.add({ severity: 'info', summary: '已清除搜索条件' })
}

onMounted(() => {
  loadMetadata()
  loadComponents()
})
</script>

<style scoped>
.components-view {
  padding: 0;
}

.page-title {
  margin: 0 0 1.5rem;
  color: #333;
  font-size: 1.75rem;
}

.page-actions {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.search-section {
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.search-section h3 {
  margin: 0 0 1rem;
  color: #333;
  font-size: 1.1rem;
}

.search-form {
  padding: 0;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 1rem;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-field label {
  font-size: 0.875rem;
  font-weight: 600;
  color: #333;
}

.search-actions {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
}

.table-section {
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.table-section h3 {
  margin: 0 0 1rem;
  color: #333;
  font-size: 1.1rem;
}
</style>
