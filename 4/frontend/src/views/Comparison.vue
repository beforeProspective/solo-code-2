<template>
  <div class="comparison-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>烘焙批次对比</span>
          <el-button type="primary" @click="doCompare" :disabled="selectedBatches.length < 2">
            开始对比 (已选 {{ selectedBatches.length }} 个)
          </el-button>
        </div>
      </template>
      
      <div style="margin-bottom: 20px">
        <el-alert
          title="提示"
          type="info"
          :closable="false"
        >
          请在下方选择至少2个烘焙批次进行对比
        </el-alert>
      </div>

      <el-table :data="roastingList" stripe border @selection-change="handleSelectionChange">
        <el-table-column type="selection" width="55" />
        <el-table-column prop="batch_number" label="批次号" width="140" />
        <el-table-column prop="green_bean_name" label="生豆名称" min-width="180" />
        <el-table-column prop="roast_date" label="烘焙日期" width="160">
          <template #default="{ row }">
            {{ formatDate(row.roast_date) }}
          </template>
        </el-table-column>
        <el-table-column prop="roast_level" label="烘焙度" width="100" />
        <el-table-column prop="input_weight" label="入豆(g)" width="90">
          <template #default="{ row }">
            {{ Number(row.input_weight).toFixed(0) }}
          </template>
        </el-table-column>
        <el-table-column prop="drop_time" label="总时间(秒)" width="100" />
        <el-table-column prop="drop_temp" label="下豆温度(℃)" width="110" />
      </el-table>
    </el-card>

    <el-card v-if="comparisonData" style="margin-top: 20px">
      <template #header>
        <span>对比结果</span>
      </template>

      <el-tabs v-model="activeTab">
        <el-tab-pane label="烘焙曲线对比" name="chart">
          <div v-show="activeTab === 'chart'" ref="chartRef" style="width: 100%; height: 500px"></div>
        </el-tab-pane>

        <el-tab-pane label="参数对比" name="params">
          <el-table :data="comparisonData.data" stripe border>
            <el-table-column label="批次号" min-width="140">
              <template #default="{ row }">
                <strong>{{ row.profile.batch_number }}</strong>
              </template>
            </el-table-column>
            <el-table-column label="生豆名称" min-width="180">
              <template #default="{ row }">
                {{ row.profile.green_bean_name }}
              </template>
            </el-table-column>
            <el-table-column label="烘焙度" width="100">
              <template #default="{ row }">
                {{ row.profile.roast_level || '-' }}
              </template>
            </el-table-column>
            <el-table-column label="入豆重量(g)" width="120">
              <template #default="{ row }">
                {{ row.profile.input_weight }}
              </template>
            </el-table-column>
            <el-table-column label="出豆重量(g)" width="120">
              <template #default="{ row }">
                {{ row.profile.output_weight || '-' }}
              </template>
            </el-table-column>
            <el-table-column label="失重率(%)" width="110">
              <template #default="{ row }">
                {{ row.profile.weight_loss !== null ? row.profile.weight_loss : '-' }}
              </template>
            </el-table-column>
            <el-table-column label="入豆温度(℃)" width="120">
              <template #default="{ row }">
                {{ row.profile.charge_temp || '-' }}
              </template>
            </el-table-column>
            <el-table-column label="脱水结束(秒)" width="120">
              <template #default="{ row }">
                {{ row.profile.dry_end_time || '-' }}
              </template>
            </el-table-column>
            <el-table-column label="一爆开始(秒)" width="120">
              <template #default="{ row }">
                {{ row.profile.fc_start_time || '-' }}
              </template>
            </el-table-column>
            <el-table-column label="二爆开始(秒)" width="120">
              <template #default="{ row }">
                {{ row.profile.sc_start_time || '-' }}
              </template>
            </el-table-column>
            <el-table-column label="下豆时间(秒)" width="120">
              <template #default="{ row }">
                {{ row.profile.drop_time }}
              </template>
            </el-table-column>
            <el-table-column label="下豆温度(℃)" width="120">
              <template #default="{ row }">
                {{ row.profile.drop_temp }}
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="杯测评分对比" name="cupping">
          <el-table :data="cuppingComparisonData" stripe border v-if="cuppingComparisonData.length > 0">
            <el-table-column label="项目" width="120" fixed="left">
              <template #default="{ row }">
                <strong>{{ row.name }}</strong>
              </template>
            </el-table-column>
            <el-table-column
              v-for="item in comparisonData.data"
              :key="item.profile.id"
              :label="item.profile.batch_number"
              width="140"
            >
              <template #default="{ row }">
                {{ row.values[item.profile.batch_number] || '-' }}
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-else description="暂无杯测数据" />
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { ElMessage } from 'element-plus'
import * as echarts from 'echarts'
import { roastingAPI, comparisonAPI } from '../api'

const roastingList = ref([])
const selectedBatches = ref([])
const comparisonData = ref(null)
const chartRef = ref(null)
const activeTab = ref('chart')
let chartInstance = null

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('zh-CN')
}

const cuppingComparisonData = computed(() => {
  if (!comparisonData.value) return []
  
  const metrics = [
    { key: 'aroma', name: '香气' },
    { key: 'flavor', name: '风味' },
    { key: 'aftertaste', name: '余韵' },
    { key: 'acidity', name: '酸度' },
    { key: 'body', name: '醇厚度' },
    { key: 'balance', name: '平衡感' },
    { key: 'uniformity', name: '一致性' },
    { key: 'clean_cup', name: '干净度' },
    { key: 'sweetness', name: '甜感' },
    { key: 'overall', name: '综合评价' },
    { key: 'total_score', name: '总分' }
  ]
  
  return metrics.map(metric => {
    const values = {}
    comparisonData.value.data.forEach(item => {
      if (item.cupping_records && item.cupping_records.length > 0) {
        const avgScore = item.cupping_records.reduce((sum, r) => sum + (r[metric.key] || 0), 0) / item.cupping_records.length
        values[item.profile.batch_number] = avgScore.toFixed(2)
      }
    })
    return { ...metric, values }
  })
})

const loadData = async () => {
  try {
    const res = await roastingAPI.getAll()
    roastingList.value = res.data.results || res.data
  } catch (error) {
    ElMessage.error('加载数据失败')
  }
}

const handleSelectionChange = (selection) => {
  selectedBatches.value = selection
}

const doCompare = async () => {
  if (selectedBatches.value.length < 2) {
    ElMessage.warning('请至少选择2个批次进行对比')
    return
  }
  
  try {
    const batchIds = selectedBatches.value.map(item => item.id)
    console.log('请求参数:', batchIds)
    const res = await comparisonAPI.compareRoasts(batchIds)
    console.log('响应数据:', res.data)
    comparisonData.value = res.data
    activeTab.value = 'chart'
    
    await nextTick()
    await nextTick()
    renderChart()
  } catch (error) {
    console.error('对比失败:', error)
    ElMessage.error('对比失败')
  }
}

const renderChart = () => {
  console.log('renderChart called, comparisonData:', comparisonData.value)
  console.log('renderChart called, chartRef:', chartRef.value)
  
  if (!comparisonData.value) {
    console.log('comparisonData is null')
    return
  }
  
  if (!chartRef.value) {
    console.log('chartRef is null, waiting...')
    setTimeout(() => renderChart(), 100)
    return
  }
  
  if (chartInstance) {
    chartInstance.dispose()
  }
  chartInstance = echarts.init(chartRef.value)
  
  const colors = ['#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de']
  const series = comparisonData.value.data.map((item, index) => {
    const points = item.temperature_points || []
    return {
      name: item.profile.batch_number,
      type: 'line',
      smooth: true,
      color: colors[index % colors.length],
      data: points.map(p => [p.time_seconds, Number(p.temperature)])
    }
  })
  
  const option = {
    title: {
      text: '烘焙曲线对比',
      left: 'center'
    },
    tooltip: {
      trigger: 'axis'
    },
    legend: {
      data: series.map(s => s.name),
      bottom: 10
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '15%',
      containLabel: true
    },
    xAxis: {
      type: 'value',
      name: '时间(秒)'
    },
    yAxis: {
      type: 'value',
      name: '温度(℃)'
    },
    series
  }
  
  chartInstance.setOption(option)
}

watch(activeTab, (newVal) => {
  if (newVal === 'chart' && comparisonData.value) {
    nextTick(() => {
      renderChart()
    })
  }
})

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
