<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick, onUnmounted } from 'vue'
import { useStore } from 'vuex'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, Download } from '@element-plus/icons-vue'
import * as echarts from 'echarts'
import {
  statisticsApi,
  type PeriodStatItem,
  type CategoryStatItem,
  type CategoryTimeItem,
  type CategoryCompletionByPeriodItem,
  type PeriodType,
} from '../api/database'

// ==================== Store & Router ====================
const store = useStore()
const router = useRouter()
const userId = computed(() => store.getters['user/userId'] as number | null)

// ==================== 响应式数据 ====================
const loading = ref(false)
const period = ref<PeriodType>('day')

// 默认最近 30 天
const now = new Date()
const defaultEnd = formatDateStr(now)
const defaultStart = formatDateStr(new Date(now.getTime() - 29 * 86400000))
const dateRange = ref<[string, string]>([defaultStart, defaultEnd])

// 统计数据
const periodStats = ref<PeriodStatItem[]>([])
const categoryStats = ref<CategoryStatItem[]>([])
const timeDistribution = ref<CategoryTimeItem[]>([])
const categoryByPeriod = ref<CategoryCompletionByPeriodItem[]>([])

// ECharts 实例引用
const trendChartRef = ref<HTMLDivElement>()
const categoryPieRef = ref<HTMLDivElement>()
const timePieRef = ref<HTMLDivElement>()
const barChartRef = ref<HTMLDivElement>()

let trendChart: echarts.ECharts | null = null
let categoryPieChart: echarts.ECharts | null = null
let timePieChart: echarts.ECharts | null = null
let barChart: echarts.ECharts | null = null

// ==================== 工具函数 ====================
function formatDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ==================== 数据加载 ====================
async function loadData() {
  if (!userId.value) return
  loading.value = true
  try {
    const [start, end] = dateRange.value
    const [pStats, cStats, tDist, cByP] = await Promise.all([
      statisticsApi.getByPeriod(userId.value, start, end, period.value),
      statisticsApi.getByCategory(userId.value),
      statisticsApi.getTimeDistribution(userId.value),
      statisticsApi.getCategoryByPeriod(userId.value, start, end, period.value),
    ])
    periodStats.value = pStats
    categoryStats.value = cStats
    timeDistribution.value = tDist
    categoryByPeriod.value = cByP

    await nextTick()
    renderTrendChart()
    renderCategoryPie()
    renderTimePie()
    renderBarChart()
  } catch (e) {
    ElMessage.error('加载统计数据失败')
  } finally {
    loading.value = false
  }
}

// ==================== 图表渲染 ====================

/** 折线图：任务创建/完成趋势 */
function renderTrendChart() {
  if (!trendChartRef.value) return
  if (!trendChart) {
    trendChart = echarts.init(trendChartRef.value)
  }
  const labels = periodStats.value.map(i => i.period)
  const created = periodStats.value.map(i => i.created_count)
  const completed = periodStats.value.map(i => i.completed_count)

  trendChart.setOption({
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255,255,255,0.8)',
      borderColor: 'rgba(0,0,0,0.05)',
      backdropFilter: 'blur(20px)',
      textStyle: { color: '#1d1d1f', fontSize: 13, fontFamily: '-apple-system' },
      padding: [12, 16],
      extraCssText: 'box-shadow: 0 8px 24px rgba(0,0,0,0.12); border-radius: 12px;',
    },
    legend: {
      data: ['创建数', '完成数'],
      textStyle: { color: '#86868b', fontSize: 12 },
      top: 0,
      icon: 'circle',
    },
    grid: { left: 40, right: 20, top: 40, bottom: 30, containLabel: true },
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: { color: '#86868b', fontSize: 11, fontFamily: '-apple-system' },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLabel: { color: '#86868b', fontSize: 11, fontFamily: '-apple-system' },
      splitLine: { lineStyle: { color: 'rgba(0,0,0,0.04)', type: 'dashed' } },
    },
    series: [
      {
        name: '创建数',
        type: 'line',
        data: created,
        smooth: 0.4,
        symbol: 'none',
        clickable: false,
        itemStyle: { color: '#007AFF' },
        lineStyle: { width: 3, shadowColor: 'rgba(0, 122, 255, 0.3)', shadowBlur: 10 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(0, 122, 255, 0.2)' },
            { offset: 1, color: 'rgba(0, 122, 255, 0)' },
          ]),
        },
      },
      {
        name: '完成数',
        type: 'line',
        data: completed,
        smooth: 0.4,
        symbol: 'none',
        itemStyle: { color: '#34C759' },
        lineStyle: { width: 3, shadowColor: 'rgba(52, 199, 89, 0.3)', shadowBlur: 10 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(52, 199, 89, 0.2)' },
            { offset: 1, color: 'rgba(52, 199, 89, 0)' },
          ]),
        },
      },
    ],
  }, true)
}

/** 饼图：分类任务占比 */
function renderCategoryPie() {
  if (!categoryPieRef.value) return
  if (!categoryPieChart) {
    categoryPieChart = echarts.init(categoryPieRef.value)
  }
  const data = categoryStats.value
    .filter(i => i.total_tasks > 0)
    .map(i => ({ name: i.category_name, value: i.total_tasks }))

  categoryPieChart.setOption({
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(255,255,255,0.8)',
      borderColor: 'rgba(0,0,0,0.05)',
      backdropFilter: 'blur(20px)',
      textStyle: { color: '#1d1d1f', fontSize: 13 },
      padding: [12, 16],
      extraCssText: 'box-shadow: 0 8px 24px rgba(0,0,0,0.12); border-radius: 12px;',
      formatter: '{b}: {c} ({d}%)',
    },
    legend: {
      orient: 'vertical',
      right: 0,
      top: 'center',
      itemWidth: 10,
      itemHeight: 10,
      icon: 'circle',
      textStyle: { color: '#86868b', fontSize: 12 },
    },
    color: ['#007AFF', '#34C759', '#FF9500', '#FF3B30', '#AF52DE', '#5856D6', '#32ADE6'],
    series: [{
      type: 'pie',
      radius: ['50%', '80%'],
      center: ['30%', '50%'],
      avoidLabelOverlap: false,
      itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
      label: { show: false },
      emphasis: {
        itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0, 0, 0, 0.1)' },
        label: { show: false },
      },
      data,
    }],
  }, true)
}

/** 饼图：分类耗时占比 */
function renderTimePie() {
  if (!timePieRef.value) return
  if (!timePieChart) {
    timePieChart = echarts.init(timePieRef.value)
  }
  const hasTime = timeDistribution.value.some(i => i.total_time > 0)
  if (!hasTime) {
    timePieChart.setOption({
      title: {
        text: '暂无耗时数据',
        left: 'center',
        top: 'center',
        textStyle: { color: '#8b8fa3', fontSize: 14, fontWeight: 'normal' },
      },
      series: [],
    }, true)
    return
  }
  const data = timeDistribution.value
    .filter(i => i.total_time > 0)
    .map(i => ({ name: i.category_name, value: i.total_time }))

  timePieChart.setOption({
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(255,255,255,0.8)',
      borderColor: 'rgba(0,0,0,0.05)',
      backdropFilter: 'blur(20px)',
      textStyle: { color: '#1d1d1f', fontSize: 13 },
      padding: [12, 16],
      extraCssText: 'box-shadow: 0 8px 24px rgba(0,0,0,0.12); border-radius: 12px;',
      formatter: (p: any) => `${p.name}: ${p.value} 分钟 (${p.percent}%)`,
    },
    legend: {
      orient: 'vertical',
      right: 0,
      top: 'center',
      itemWidth: 10,
      itemHeight: 10,
      icon: 'circle',
      textStyle: { color: '#86868b', fontSize: 12 },
    },
    color: ['#007AFF', '#34C759', '#FF9500', '#FF3B30', '#AF52DE', '#5856D6', '#32ADE6'],
    series: [{
      type: 'pie',
      radius: ['50%', '80%'],
      center: ['30%', '50%'],
      avoidLabelOverlap: false,
      itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
      label: { show: false },
      emphasis: {
        itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0, 0, 0, 0.1)' },
      },
      data,
    }],
  }, true)
}

/** 柱状图：各分类完成数对比 */
function renderBarChart() {
  if (!barChartRef.value) return
  if (!barChart) {
    barChart = echarts.init(barChartRef.value)
  }
  // 提取唯一的周期和分类
  const periods = [...new Set(categoryByPeriod.value.map(i => i.period))]
  const categories = [...new Set(categoryByPeriod.value.map(i => i.category_name))]

  const series = categories.map(cat => ({
    name: cat,
    type: 'bar' as const,
    stack: 'total',
    emphasis: { focus: 'series' as const },
    data: periods.map(p => {
      const item = categoryByPeriod.value.find(i => i.period === p && i.category_name === cat)
      return item ? item.completed_count : 0
    }),
  }))

  barChart.setOption({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: 'rgba(255,255,255,0.8)',
      borderColor: 'rgba(0,0,0,0.05)',
      backdropFilter: 'blur(20px)',
      textStyle: { color: '#1d1d1f', fontSize: 13 },
      padding: [12, 16],
      extraCssText: 'box-shadow: 0 8px 24px rgba(0,0,0,0.12); border-radius: 12px;',
    },
    legend: {
      textStyle: { color: '#86868b', fontSize: 12 },
      top: 0,
      icon: 'circle',
    },
    grid: { left: 40, right: 20, top: 40, bottom: 30, containLabel: true },
    xAxis: {
      type: 'category',
      data: periods,
      axisLabel: { color: '#86868b', fontSize: 11, fontFamily: '-apple-system' },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLabel: { color: '#86868b', fontSize: 11 },
      splitLine: { lineStyle: { color: 'rgba(0,0,0,0.04)', type: 'dashed' } },
    },
    color: ['#007AFF', '#34C759', '#FF9500', '#FF3B30', '#AF52DE'],
    series: series.map(s => ({
      ...s,
      barMaxWidth: 24,
      itemStyle: { borderRadius: [4, 4, 0, 0] },
    })),
  }, true)
}

// ==================== 导出功能 ====================
const exporting = ref(false)

async function handleExport() {
  if (!userId.value) return
  exporting.value = true
  try {
    const [start, end] = dateRange.value
    const result = await statisticsApi.exportExcel(userId.value, start, end, period.value)
    if (result.success && result.filePath) {
      ElMessage.success(`导出成功：${result.filePath}`)
    } else if (result.error === 'cancelled') {
      // 用户取消，静默
    } else {
      ElMessage.error(`导出失败：${result.error || '未知错误'}`)
    }
  } catch {
    ElMessage.error('导出失败')
  } finally {
    exporting.value = false
  }
}

// ==================== 返回 ====================
function goBack() {
  router.push('/')
}

// ==================== 窗口 resize ====================
function handleResize() {
  trendChart?.resize()
  categoryPieChart?.resize()
  timePieChart?.resize()
  barChart?.resize()
}

// ==================== 生命周期 ====================
watch([dateRange, period], () => {
  loadData()
})

onMounted(() => {
  if (!userId.value) {
    router.push('/login')
    return
  }
  loadData()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  trendChart?.dispose()
  categoryPieChart?.dispose()
  timePieChart?.dispose()
  barChart?.dispose()
})
</script>

<template>
  <div class="statistics-page" v-loading="loading" element-loading-text="加载统计数据中...">
    <!-- 顶部控制栏 -->
    <header class="stats-header">
      <div class="stats-header-left">
        <button class="stats-btn icon" @click="goBack" title="返回">
          <el-icon><ArrowLeft /></el-icon>
        </button>
        <h2 class="stats-title">数据统计</h2>
      </div>
      <div class="stats-header-right">
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
          size="small"
          style="width: 260px"
        />
        <el-radio-group v-model="period" size="small">
          <el-radio-button value="day">日</el-radio-button>
          <el-radio-button value="week">周</el-radio-button>
          <el-radio-button value="month">月</el-radio-button>
        </el-radio-group>
        <button class="stats-btn primary" @click="handleExport" :disabled="exporting">
          <el-icon><Download /></el-icon>
          <span>{{ exporting ? '导出中...' : '导出 Excel' }}</span>
        </button>
      </div>
    </header>

    <!-- 图表区域 -->
    <div class="stats-grid">
      <!-- 折线图：任务趋势 -->
      <div class="stats-card full-width">
        <h3 class="card-title">📈 任务创建/完成趋势</h3>
        <div ref="trendChartRef" class="chart-container" style="height: 320px"></div>
      </div>

      <!-- 饼图：分类任务占比 -->
      <div class="stats-card">
        <h3 class="card-title">📊 分类任务占比</h3>
        <div ref="categoryPieRef" class="chart-container" style="height: 280px"></div>
      </div>

      <!-- 饼图：分类耗时占比 -->
      <div class="stats-card">
        <h3 class="card-title">⏱️ 分类耗时占比</h3>
        <div ref="timePieRef" class="chart-container" style="height: 280px"></div>
      </div>

      <!-- 柱状图：各分类完成数对比 -->
      <div class="stats-card full-width">
        <h3 class="card-title">📋 各分类完成数对比</h3>
        <div ref="barChartRef" class="chart-container" style="height: 320px"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.statistics-page {
  width: 100%;
  min-height: 100vh;
  background: #fbfbfd; /* iOS 浅色背景 */
  padding: 40px 48px;
  overflow-y: auto;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif;
  color: #1d1d1f;
}

/* ===== 顶部控制栏 ===== */
.stats-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 40px;
  flex-wrap: wrap;
  gap: 20px;
}
.stats-header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}
.stats-header-right {
  display: flex;
  align-items: center;
  gap: 16px;
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(20px);
  padding: 6px;
  border-radius: 16px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
  border: 1px solid rgba(0,0,0,0.03);
}

.stats-title {
  font-size: 32px;
  font-weight: 700;
  color: #1d1d1f;
  letter-spacing: -0.01em;
}

/* ===== 按钮 ===== */
.stats-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 12px;
  border: none;
  background: rgba(0, 0, 0, 0.04);
  color: #1d1d1f;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.25, 0.1, 0.25, 1);
}
.stats-btn:hover {
  background: rgba(0, 0, 0, 0.08);
  transform: scale(1.02);
}
.stats-btn:active {
  transform: scale(0.96);
}

.stats-btn.icon {
  width: 36px;
  height: 36px;
  padding: 0;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}
.stats-btn.icon:hover {
  background: #f5f5f7;
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
}

.stats-btn.primary {
  background: #007AFF;
  color: #fff;
  box-shadow: 0 4px 12px rgba(0, 122, 255, 0.25);
}
.stats-btn.primary:hover {
  background: #006ce6;
  box-shadow: 0 6px 16px rgba(0, 122, 255, 0.35);
}

/* ===== 图表网格 ===== */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 24px;
  padding-bottom: 40px;
}

.stats-card {
  background: rgba(255, 255, 255, 0.75);
  backdrop-filter: blur(40px);
  -webkit-backdrop-filter: blur(40px);
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 24px;
  padding: 32px;
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.02),
    0 8px 24px rgba(0, 0, 0, 0.04);
  transition: all 0.4s cubic-bezier(0.25, 0.1, 0.25, 1);
}

.stats-card:hover {
  transform: translateY(-4px);
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.03),
    0 24px 48px rgba(0, 0, 0, 0.08);
}

.stats-card.full-width {
  grid-column: 1 / -1;
}

.card-title {
  font-size: 19px;
  font-weight: 600;
  color: #1d1d1f;
  margin-bottom: 24px;
  letter-spacing: -0.015em;
  display: flex;
  align-items: center;
  gap: 8px;
}

.chart-container {
  width: 100%;
  /* 确保图表容器有最小高度，避免塌陷 */
  min-height: 280px;
}

/* ===== Element Plus 覆盖 (iOS 风格适配) ===== */
:deep(.el-date-editor.el-input__wrapper),
:deep(.el-range-editor.el-input__wrapper) {
  background-color: transparent !important;
  box-shadow: none !important;
  padding: 0 10px;
}

:deep(.el-range-input) {
  color: #1d1d1f;
  font-weight: 500;
  font-size: 13px;
}
:deep(.el-range-separator),
:deep(.el-input__icon) {
  color: #86868b;
}

:deep(.el-radio-group) {
  display: flex !important;
  background: rgba(118, 118, 128, 0.12);
  padding: 3px;
  border-radius: 10px;
}

:deep(.el-radio-button__inner) {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  color: #1d1d1f;
  border-radius: 7px !important;
  padding: 6px 16px;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s;
}

:deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  background: #fff !important;
  color: #000 !important;
  box-shadow: 0 2px 6px rgba(0,0,0,0.12) !important;
}

:deep(.el-loading-mask) {
  background-color: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(10px);
  border-radius: 24px;
}
:deep(.el-loading-spinner .path) {
  stroke: #007AFF;
}

/* ===== 响应式 ===== */
@media (max-width: 900px) {
  .statistics-page {
    padding: 24px;
  }
  .stats-header {
    flex-direction: column;
    align-items: stretch;
    gap: 16px;
  }
  .stats-header-right {
    background: transparent;
    padding: 0;
    box-shadow: none;
    border: none;
    justify-content: space-between;
  }
  .stats-grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }
  .stats-card {
    padding: 24px;
    border-radius: 20px;
  }
}
</style>
