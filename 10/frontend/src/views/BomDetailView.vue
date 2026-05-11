<template>
  <div class="bom-detail-view">
    <div class="page-header">
      <div>
        <h2 class="page-title">{{ bom?.name }}</h2>
        <p v-if="bom?.project_name">{{ bom.project_name }}</p>
      </div>
      <div class="page-actions">
        <Button label="返回" icon="pi pi-arrow-left" severity="secondary" @click="router.back()" />
        <Button label="导出 CSV" icon="pi pi-download" severity="success" @click="exportBom" />
      </div>
    </div>
    
    <div v-if="loading" class="loading"><i class="pi pi-spin pi-spinner"></i></div>
    
    <div v-else-if="bom" class="detail-content">
      <Card v-if="bom.description">
        <template #title>描述</template>
        <p>{{ bom.description }}</p>
      </Card>
      
      <Card>
        <template #title>
          BOM 项目 ({{ bom.items?.length || 0 }} 项)
        </template>
        <DataTable :value="bom.items || []" stripedRows>
          <Column field="reference_designator" header="位号" style="width: 100px;" />
          <Column header="元件">
            <template #body="slotProps">
              <div class="component-info">
                <span class="name">{{ slotProps.data.name }}</span>
                <span class="part-number">{{ slotProps.data.part_number }}</span>
              </div>
            </template>
          </Column>
          <Column field="category" header="类别" style="width: 120px;">
            <template #body="slotProps">
              <Tag :value="slotProps.data.category" severity="info" />
            </template>
          </Column>
          <Column field="package" header="封装" style="width: 100px;" />
          <Column field="value" header="值" style="width: 100px;" />
          <Column field="quantity" header="需要数量" style="width: 100px;">
            <template #body="slotProps">
              <span class="qty-badge">{{ slotProps.data.quantity }}</span>
            </template>
          </Column>
          <Column field="stock_quantity" header="库存" style="width: 100px;">
            <template #body="slotProps">
              <Tag 
                :value="slotProps.data.stock_quantity || 0" 
                :severity="(slotProps.data.stock_quantity || 0) >= slotProps.data.quantity ? 'success' : 'danger'" 
              />
            </template>
          </Column>
          <Column field="notes" header="备注" />
        </DataTable>
      </Card>
    </div>
    
    <Toast />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { bomApi } from '@/api'
import Button from 'primevue/button'
import Card from 'primevue/card'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'
import Toast from 'primevue/toast'

const router = useRouter()
const route = useRoute()
const toast = useToast()

const bom = ref(null)
const loading = ref(true)

const loadBom = async () => {
  loading.value = true
  try {
    const response = await bomApi.getById(route.params.id)
    bom.value = response.data.data
  } catch (error) {
    toast.add({ severity: 'error', summary: '加载失败' })
  } finally {
    loading.value = false
  }
}

const exportBom = async () => {
  try {
    const response = await bomApi.export(route.params.id)
    const url = window.URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `${bom.value.name}.csv`)
    document.body.appendChild(link)
    link.click()
    link.remove()
    toast.add({ severity: 'success', summary: '已导出' })
  } catch (error) {
    toast.add({ severity: 'error', summary: '导出失败' })
  }
}

onMounted(() => {
  loadBom()
})
</script>

<style scoped>
.bom-detail-view { padding: 0; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
.page-title { margin: 0; color: #333; font-size: 1.75rem; }
.page-header p { margin: 0.25rem 0 0; color: #666; }
.page-actions { display: flex; gap: 0.75rem; }
.loading { display: flex; justify-content: center; align-items: center; padding: 3rem; font-size: 2rem; }
.component-info { display: flex; flex-direction: column; }
.component-info .name { font-weight: 500; }
.component-info .part-number { font-size: 0.75rem; color: #666; }
.qty-badge { background: #e3f2fd; color: #1976d2; padding: 0.25rem 0.75rem; border-radius: 9999px; font-weight: 600; }
</style>
