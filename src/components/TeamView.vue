<script setup>
import { ref, computed } from 'vue'
import { useEventStore } from '@/store/event'
const store = useEventStore()
const cur = ref('all')
const statusFilter = ref('approved')   // approved 参赛名单 / pending 待审核 / other 退报驳回撤销 / all 全部

const teamRows = computed(() => store.teams.filter(t => {
  if (cur.value !== 'all' && t.sport_id !== Number(cur.value)) return false
  if (statusFilter.value === 'approved') return t.status === 'approved'
  if (statusFilter.value === 'pending') return t.status === 'pending'
  if (statusFilter.value === 'other') return ['rejected', 'withdrawn', 'revoked'].includes(t.status)
  return true
}))
const athleteRows = computed(() => store.athletes.filter(a => {
  if (cur.value !== 'all' && a.sport_id !== Number(cur.value)) return false
  if (statusFilter.value === 'approved') return a.status === 'approved'
  if (statusFilter.value === 'pending') return a.status === 'pending'
  if (statusFilter.value === 'other') return ['rejected', 'withdrawn', 'revoked'].includes(a.status)
  return true
}))
const teams = teamRows
const athletes = athleteRows
const groupBy = (arr, k) => {
  const m = {}
  arr.forEach(x => { m[x[k]] = m[x[k]] || []; m[x[k]].push(x) })
  return m
}
const stTabs = [['approved', '✅ 参赛名单'], ['pending', '⏳ 待审核'], ['other', '🚫 退报/撤销'], ['all', '全部']]
</script>

<template>
  <div v-if="store.loaded">
    <div class="page-h">
      <div><h2>👥 队伍与运动员</h2><div class="sub">参赛名单为资格审核通过的队伍与单项运动员</div></div>
      <div class="filters">
        <button class="chip" :class="{ on: cur === 'all' }" @click="cur = 'all'">全部</button>
        <button v-for="s in store.sports" :key="s.id" class="chip" :class="{ on: cur === String(s.id) }" @click="cur = String(s.id)">{{ s.name }}</button>
      </div>
    </div>

    <div class="filters" style="margin-bottom:16px">
      <button v-for="t in stTabs" :key="t[0]" class="chip" :class="{ on: statusFilter === t[0] }" @click="statusFilter = t[0]">{{ t[1] }}</button>
    </div>

    <div class="grid g2">
      <div class="card">
        <div class="caption">🏀 参赛队伍 <span class="hint">{{ teams.length }} 支</span></div>
        <div class="pad">
          <div style="display:flex;flex-direction:column;gap:10px">
            <div v-for="(list, uid) in groupBy(teams, 'unit_id')" :key="uid" class="mcard">
              <div class="mheader"><span><span class="dot" :style="{ background: store.unitOfUid(Number(uid))?.color }"></span> {{ store.unitOfUid(Number(uid))?.name }}</span><span class="tag o">{{ list.length }} 支</span></div>
              <div class="row wrap" style="margin-top:8px">
                <span v-for="t in list" :key="t.id" class="tag b" :style="t.status!=='approved' ? { opacity: .65 } : {}">
                  {{ t.name }}
                  <template v-if="t.status !== 'approved'">（{{ store.statusMeta(t.status).text }}）</template>
                </span>
              </div>
            </div>
            <div v-if="!teams.length" class="empty">暂无队伍</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="caption">🏃 运动员（田径等单项） <span class="hint">{{ athletes.length }} 人</span></div>
        <div class="pad">
          <table>
            <thead><tr><th>姓名</th><th>参赛项目</th><th>单位</th><th>状态</th></tr></thead>
            <tbody>
              <tr v-for="a in athletes" :key="a.id">
                <td><b>{{ a.name }}</b></td>
                <td>{{ store.sports.find(s=>s.id===a.sport_id)?.name }}</td>
                <td><span class="badge"><span class="dot" :style="{ background: store.unitOfUid(a.unit_id)?.color }"></span>{{ a.unit }}</span></td>
                <td><span class="tag" :class="store.statusMeta(a.status).cls">{{ store.statusMeta(a.status).icon }} {{ store.statusMeta(a.status).text }}</span></td>
              </tr>
              <tr v-if="!athletes.length"><td colspan="4" class="empty">暂无运动员</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
