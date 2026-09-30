<script setup>
import { ref, computed, reactive } from 'vue'
import { useEventStore } from '@/store/event'

const store = useEventStore()
const toast = ref('')
const tab = ref('pending')            // pending / approved / history
const regType = ref('team')           // team / athlete
const showReg = ref(false)

const ballSports = computed(() => store.sports.filter(s => s.format !== 'track'))
const trackSports = computed(() => store.sports.filter(s => s.format === 'track'))

const say = (msg, ok = true) => { toast.value = (ok ? '✅ ' : '⚠️ ') + msg; setTimeout(() => toast.value = '', 3200) }

/* —— 单位报名表单 —— */
const form = reactive({ name: '', unit_id: '', sport_id: '' })
function openReg(type) {
  regType.value = type
  form.name = ''
  form.unit_id = store.units[0]?.id || ''
  form.sport_id = (type === 'team' ? ballSports.value[0]?.id : store.sports[0]?.id) || ''
  showReg.value = true
}
async function submitReg() {
  try {
    if (regType.value === 'team') {
      await store.registerTeam({ name: form.name, unit_id: Number(form.unit_id), sport_id: Number(form.sport_id) })
      say(`队伍「${form.name}」已提交，等待组委会审核`)
    } else {
      await store.registerAthlete({ name: form.name, unit_id: Number(form.unit_id), sport_id: Number(form.sport_id) })
      say(`运动员「${form.name}」已提交，等待组委会审核`)
    }
    showReg.value = false
  } catch (e) { say(e.message, false) }
}

/* —— 审核操作 —— */
const noteBox = reactive({ id: null, type: '', val: '' })
function askNote(id, type) { noteBox.id = id; noteBox.type = type; noteBox.val = '' }
function closeNote() { noteBox.id = null }

async function approveTeam(t) {
  try { const r = await store.approveTeam(t.id); say(`已通过「${t.name}」资格审核，纳入参赛名单与赛程${r.added ? `（自动补排 ${r.added} 场）` : ''}`) }
  catch (e) { say(e.message, false) }
}
async function approveAthlete(a) {
  try { await store.approveAthlete(a.id); say(`已通过「${a.name}」资格，纳入参赛名单`) }
  catch (e) { say(e.message, false) }
}
async function rejectTeam(t) {
  try { await store.rejectTeam(t.id, noteBox.val || '资格/材料不符'); say(`已驳回「${t.name}」`); closeNote() }
  catch (e) { say(e.message, false) }
}
async function rejectAthlete(a) {
  try { await store.rejectAthlete(a.id, noteBox.val || '资格/材料不符'); say(`已驳回「${a.name}」`); closeNote() }
  catch (e) { say(e.message, false) }
}
async function withdrawTeam(t) {
  try {
    const r = await store.withdrawTeam(t.id, noteBox.val)
    say(`「${t.name}」已退报 · 删除未赛 ${r.removed} 场 / 作废成绩 ${r.voided} 场${r.downstream ? ` / 连带失效后续对阵 ${r.downstream} 场` : ''}`)
    closeNote()
  } catch (e) { say(e.message, false) }
}
async function revokeTeam(t) {
  try {
    const r = await store.revokeTeam(t.id, noteBox.val || '资格不符')
    say(`已撤销「${t.name}」资格 · 删除未赛 ${r.removed} 场 / 作废成绩 ${r.voided} 场${r.downstream ? ` / 连带失效后续 ${r.downstream} 场` : ''}`)
    closeNote()
  } catch (e) { say(e.message, false) }
}
async function withdrawAthlete(a) {
  try { await store.withdrawAthlete(a.id, noteBox.val); say(`「${a.name}」已退报，成绩已清除并重排`); closeNote() }
  catch (e) { say(e.message, false) }
}
async function revokeAthlete(a) {
  try { await store.revokeAthlete(a.id, noteBox.val || '资格不符'); say(`已撤销「${a.name}」资格，成绩与名次已重算`); closeNote() }
  catch (e) { say(e.message, false) }
}

/* —— 列表筛选 —— */
const pendingTeams = computed(() => store.teams.filter(t => t.status === 'pending'))
const pendingAthletes = computed(() => store.athletes.filter(a => a.status === 'pending'))
const approvedTeams = computed(() => store.teams.filter(t => t.status === 'approved'))
const approvedAthletes = computed(() => store.athletes.filter(a => a.status === 'approved'))
const historyTeams = computed(() => store.teams.filter(t => ['rejected', 'withdrawn', 'revoked'].includes(t.status)))
const historyAthletes = computed(() => store.athletes.filter(a => ['rejected', 'withdrawn', 'revoked'].includes(a.status)))

const sportName = id => store.sports.find(s => s.id === id)?.name || '-'
const sportQuota = id => store.review?.perSport?.find(s => s.id === id)

/* —— 名额编辑 —— */
const quotaEdit = reactive({ id: null, tq: 0, aq: 0 })
function openQuota(s) { quotaEdit.id = s.id; quotaEdit.tq = s.teamQuota; quotaEdit.aq = s.athleteQuota }
async function saveQuota() {
  try { await store.setQuota(quotaEdit.id, { team_quota: quotaEdit.tq, athlete_quota: quotaEdit.aq }); say('名额已更新'); quotaEdit.id = null }
  catch (e) { say(e.message, false) }
}
const quotaPct = (used, max) => max ? Math.min(100, Math.round(used / max * 100)) : 0
const quotaCls = (used, max) => !max ? '' : used >= max ? 'r' : used >= max - 1 ? 'y' : 'g'
</script>

<template>
  <div v-if="store.loaded">
    <div class="page-h">
      <div><h2>🛂 参赛资格审核</h2><div class="sub">各单位提交队伍/运动员报名 · 组委会审核资格与名额 · 通过即纳入名单与赛程</div></div>
      <div class="row">
        <button class="btn ghost sm" @click="openReg('athlete')">🏃 报名运动员</button>
        <button class="btn primary sm" @click="openReg('team')">👥 报名队伍</button>
      </div>
    </div>

    <div v-if="toast" class="toast">{{ toast }}</div>

    <!-- 顶部统计 -->
    <div class="grid g4">
      <div class="card stat"><span class="bar" style="background:linear-gradient(90deg,#ffb92b,#ffd87e)"></span><span class="ic">⏳</span><b>{{ store.review?.pendingTeams || 0 }}</b><em>待审核队伍</em></div>
      <div class="card stat"><span class="bar" style="background:linear-gradient(90deg,#ff7a2f,#ffb27e)"></span><span class="ic">📝</span><b>{{ store.review?.pendingAthletes || 0 }}</b><em>待审核运动员</em></div>
      <div class="card stat"><span class="bar" style="background:linear-gradient(90deg,#22c15e,#7edda4)"></span><span class="ic">✅</span><b>{{ store.review?.approvedTeams || 0 }}</b><em>已通过队伍</em></div>
      <div class="card stat"><span class="bar" style="background:linear-gradient(90deg,#2f9bff,#79c4ff)"></span><span class="ic">🏃</span><b>{{ store.review?.approvedAthletes || 0 }}</b><em>已通过运动员</em></div>
    </div>

    <!-- 名额看板 -->
    <div class="card mt">
      <div class="caption"><span class="badge">🎫 各项目名额（已报名 = 已通过 + 待审核）</span><span class="hint">名额满后报名与审核均会被拦截</span></div>
      <div class="pad grid g4">
        <div v-for="s in store.review?.perSport || []" :key="s.id" class="quota-box">
          <div class="row spread"><b>{{ s.name }}</b>
            <button class="btn ghost sm" @click="openQuota(s)">✏️ 名额</button>
          </div>
          <template v-if="s.teamQuota > 0">
            <div class="row spread mt8"><span class="hint">队伍</span><span class="tag" :class="quotaCls(s.teamUsed, s.teamQuota)">{{ s.teamUsed }}/{{ s.teamQuota }}</span></div>
            <div class="hbar mt8"><i :style="{ width: quotaPct(s.teamUsed, s.teamQuota) + '%' }"></i></div>
          </template>
          <template v-if="s.athleteQuota > 0">
            <div class="row spread mt8"><span class="hint">运动员</span><span class="tag" :class="quotaCls(s.athUsed, s.athleteQuota)">{{ s.athUsed }}/{{ s.athleteQuota }}</span></div>
            <div class="hbar mt8"><i :style="{ width: quotaPct(s.athUsed, s.athleteQuota) + '%', background: 'var(--accent3)' }"></i></div>
          </template>
        </div>
      </div>
    </div>

    <!-- 审核标签页 -->
    <div class="filters mt" style="margin-bottom:14px">
      <button class="chip" :class="{ on: tab==='pending' }" @click="tab='pending'">⏳ 待审核 ({{ pendingTeams.length + pendingAthletes.length }})</button>
      <button class="chip" :class="{ on: tab==='approved' }" @click="tab='approved'">✅ 已通过 ({{ approvedTeams.length + approvedAthletes.length }})</button>
      <button class="chip" :class="{ on: tab==='history' }" @click="tab='history'">🗂️ 退报/驳回/撤销 ({{ historyTeams.length + historyAthletes.length }})</button>
    </div>

    <div class="grid g2">
      <!-- 队伍 -->
      <div class="card">
        <div class="caption"><span class="badge">🏀 队伍报名</span>
          <span class="hint">{{ tab === 'pending' ? pendingTeams.length : tab === 'approved' ? approvedTeams.length : historyTeams.length }} 支</span>
        </div>
        <div class="pad" style="display:flex;flex-direction:column;gap:10px">
          <template v-if="tab==='pending'">
            <div v-for="t in pendingTeams" :key="t.id" class="mcard">
              <div class="mheader">
                <span class="badge"><span class="dot" :style="{ background: store.unitOfUid(t.unit_id)?.color }"></span>{{ t.unit }}</span>
                <span class="tag b">{{ sportName(t.sport_id) }}</span>
              </div>
              <div class="mrow"><span class="t" style="font-size:15px">{{ t.name }}</span>
                <span class="tag" :class="store.statusMeta(t.status).cls">{{ store.statusMeta(t.status).icon }} {{ store.statusMeta(t.status).text }}</span>
              </div>
              <div v-if="noteBox.id===t.id && noteBox.type==='reject-team'" class="notebar">
                <input v-model="noteBox.val" placeholder="驳回原因（如资格/材料不符）" style="flex:1">
                <button class="btn ghost sm" @click="closeNote">取消</button>
                <button class="btn primary sm" @click="rejectTeam(t)">确认驳回</button>
              </div>
              <div v-else class="row mt8" style="justify-content:flex-end">
                <button class="btn ghost sm" @click="askNote(t.id,'reject-team')">⛔ 驳回</button>
                <button class="btn green sm" @click="approveTeam(t)">✅ 审核通过</button>
              </div>
            </div>
            <div v-if="!pendingTeams.length" class="empty">暂无待审核队伍</div>
          </template>

          <template v-else-if="tab==='approved'">
            <div v-for="t in approvedTeams" :key="t.id" class="mcard done">
              <div class="mheader">
                <span class="badge"><span class="dot" :style="{ background: store.unitOfUid(t.unit_id)?.color }"></span>{{ t.unit }}</span>
                <span class="tag b">{{ sportName(t.sport_id) }}</span>
              </div>
              <div class="mrow"><span class="t" style="font-size:15px">{{ t.name }}</span><span class="tag g">✅ 在册参赛</span></div>
              <div v-if="noteBox.id===t.id" class="notebar">
                <input v-model="noteBox.val" :placeholder="noteBox.type==='revoke-team' ? '撤销原因（如违规/冒名）' : '退报原因（可选）'" style="flex:1">
                <button class="btn ghost sm" @click="closeNote">取消</button>
                <button v-if="noteBox.type==='revoke-team'" class="btn primary sm" style="background:#e5484d;box-shadow:none" @click="revokeTeam(t)">确认撤销</button>
                <button v-else class="btn primary sm" @click="withdrawTeam(t)">确认退报</button>
              </div>
              <div v-else class="row mt8" style="justify-content:flex-end">
                <button class="btn ghost sm" @click="askNote(t.id,'withdraw-team')">↩️ 退报</button>
                <button class="btn primary sm" style="background:#e5484d;box-shadow:none" @click="askNote(t.id,'revoke-team')">🚫 撤销资格</button>
              </div>
            </div>
            <div v-if="!approvedTeams.length" class="empty">暂无已通过队伍</div>
          </template>

          <template v-else>
            <div v-for="t in historyTeams" :key="t.id" class="mcard">
              <div class="mheader"><span class="badge"><span class="dot" :style="{ background: store.unitOfUid(t.unit_id)?.color }"></span>{{ t.unit }}</span><span class="tag b">{{ sportName(t.sport_id) }}</span></div>
              <div class="mrow">
                <span class="t">{{ t.name }}</span>
                <span class="tag" :class="store.statusMeta(t.status).cls">{{ store.statusMeta(t.status).icon }} {{ store.statusMeta(t.status).text }}</span>
              </div>
              <div v-if="t.review_note" class="reason">{{ t.review_note }}</div>
            </div>
            <div v-if="!historyTeams.length" class="empty">暂无历史记录</div>
          </template>
        </div>
      </div>

      <!-- 运动员 -->
      <div class="card">
        <div class="caption"><span class="badge">🏃 运动员报名（田径等单项）</span>
          <span class="hint">{{ tab === 'pending' ? pendingAthletes.length : tab === 'approved' ? approvedAthletes.length : historyAthletes.length }} 人</span>
        </div>
        <div class="pad" style="display:flex;flex-direction:column;gap:10px">
          <template v-if="tab==='pending'">
            <div v-for="a in pendingAthletes" :key="a.id" class="mcard">
              <div class="mheader">
                <span class="badge"><span class="dot" :style="{ background: store.unitOfUid(a.unit_id)?.color }"></span>{{ a.unit }}</span>
                <span class="tag b">{{ sportName(a.sport_id) }}</span>
              </div>
              <div class="mrow"><span class="t" style="font-size:15px">{{ a.name }}<span v-if="a.review_note" class="reason-inline">· 备注：{{ a.review_note }}</span></span>
                <span class="tag y">⏳ 待审核</span>
              </div>
              <div v-if="noteBox.id===a.id && noteBox.type==='reject-ath'" class="notebar">
                <input v-model="noteBox.val" placeholder="驳回原因（如资格/材料不符）" style="flex:1">
                <button class="btn ghost sm" @click="closeNote">取消</button>
                <button class="btn primary sm" @click="rejectAthlete(a)">确认驳回</button>
              </div>
              <div v-else class="row mt8" style="justify-content:flex-end">
                <button class="btn ghost sm" @click="askNote(a.id,'reject-ath')">⛔ 驳回</button>
                <button class="btn green sm" @click="approveAthlete(a)">✅ 审核通过</button>
              </div>
            </div>
            <div v-if="!pendingAthletes.length" class="empty">暂无待审核运动员</div>
          </template>

          <template v-else-if="tab==='approved'">
            <div v-for="a in approvedAthletes" :key="a.id" class="mcard done">
              <div class="mheader">
                <span class="badge"><span class="dot" :style="{ background: store.unitOfUid(a.unit_id)?.color }"></span>{{ a.unit }}</span>
                <span class="tag b">{{ sportName(a.sport_id) }}</span>
              </div>
              <div class="mrow"><span class="t" style="font-size:15px">{{ a.name }}</span><span class="tag g">✅ 在册参赛</span></div>
              <div v-if="noteBox.id===a.id" class="notebar">
                <input v-model="noteBox.val" :placeholder="noteBox.type==='revoke-ath' ? '撤销原因（如违规）' : '退报原因（可选）'" style="flex:1">
                <button class="btn ghost sm" @click="closeNote">取消</button>
                <button v-if="noteBox.type==='revoke-ath'" class="btn primary sm" style="background:#e5484d;box-shadow:none" @click="revokeAthlete(a)">确认撤销</button>
                <button v-else class="btn primary sm" @click="withdrawAthlete(a)">确认退报</button>
              </div>
              <div v-else class="row mt8" style="justify-content:flex-end">
                <button class="btn ghost sm" @click="askNote(a.id,'withdraw-ath')">↩️ 退报</button>
                <button class="btn primary sm" style="background:#e5484d;box-shadow:none" @click="askNote(a.id,'revoke-ath')">🚫 撤销资格</button>
              </div>
            </div>
            <div v-if="!approvedAthletes.length" class="empty">暂无已通过运动员</div>
          </template>

          <template v-else>
            <div v-for="a in historyAthletes" :key="a.id" class="mcard">
              <div class="mheader"><span class="badge"><span class="dot" :style="{ background: store.unitOfUid(a.unit_id)?.color }"></span>{{ a.unit }}</span><span class="tag b">{{ sportName(a.sport_id) }}</span></div>
              <div class="mrow">
                <span class="t">{{ a.name }}</span>
                <span class="tag" :class="store.statusMeta(a.status).cls">{{ store.statusMeta(a.status).icon }} {{ store.statusMeta(a.status).text }}</span>
              </div>
              <div v-if="a.review_note" class="reason">{{ a.review_note }}</div>
            </div>
            <div v-if="!historyAthletes.length" class="empty">暂无历史记录</div>
          </template>
        </div>
      </div>
    </div>

    <!-- 报名弹层 -->
    <div v-if="showReg" class="modal-mask" @click.self="showReg=false">
      <div class="modal">
        <div class="caption"><span class="badge">{{ regType === 'team' ? '👥 队伍报名' : '🏃 运动员报名' }}</span><button class="btn ghost sm" @click="showReg=false">✕</button></div>
        <div class="pad" style="display:flex;flex-direction:column;gap:12px">
          <label class="fld"><span>参赛单位</span>
            <select v-model="form.unit_id">
              <option v-for="u in store.units" :key="u.id" :value="u.id">{{ u.name }}</option>
            </select>
          </label>
          <label class="fld"><span>比赛项目</span>
            <select v-model="form.sport_id">
              <option v-for="s in (regType==='team' ? ballSports : store.sports)" :key="s.id" :value="s.id">
                {{ s.name }}（名额 {{ sportQuota(s.id)?.teamQuota || sportQuota(s.id)?.athleteQuota }}）
              </option>
            </select>
          </label>
          <label class="fld"><span>{{ regType === 'team' ? '队伍名称' : '运动员姓名' }}</span>
            <input v-model="form.name" :placeholder="regType === 'team' ? '如：疾风队' : '如：许诺'" @keyup.enter="submitReg">
          </label>
          <div class="hint">提交后状态为「待审核」，由组委会审核资格与名额，通过后自动纳入参赛名单。</div>
          <div class="row" style="justify-content:flex-end">
            <button class="btn ghost" @click="showReg=false">取消</button>
            <button class="btn primary" @click="submitReg">📨 提交报名</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 名额编辑弹层 -->
    <div v-if="quotaEdit.id" class="modal-mask" @click.self="quotaEdit.id=null">
      <div class="modal" style="max-width:380px">
        <div class="caption"><span class="badge">🎫 设置名额</span><button class="btn ghost sm" @click="quotaEdit.id=null">✕</button></div>
        <div class="pad" style="display:flex;flex-direction:column;gap:12px">
          <label class="fld"><span>队伍名额（0 = 不适用）</span><input v-model.number="quotaEdit.tq" type="number" min="0"></label>
          <label class="fld"><span>运动员名额（0 = 不适用）</span><input v-model.number="quotaEdit.aq" type="number" min="0"></label>
          <div class="row" style="justify-content:flex-end">
            <button class="btn ghost" @click="quotaEdit.id=null">取消</button>
            <button class="btn primary" @click="saveQuota">保存</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.quota-box { border: 1px solid var(--line); border-radius: 14px; padding: 13px 15px; background: #fff; }
.hint { font-size: 12px; color: var(--muted); }
.reason { font-size: 12px; color: #e5484d; background: #ffecec; border-radius: 8px; padding: 6px 9px; margin-top: 6px; }
.reason-inline { font-size: 12px; color: var(--muted); margin-left: 6px; }
.notebar { display: flex; gap: 8px; align-items: center; margin-top: 8px; }
.fld { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 600; }
.fld select, .fld input { width: 100%; }
.modal-mask { position: fixed; inset: 0; background: rgba(29,39,51,.42); display: grid; place-items: center; z-index: 900; }
.modal { background: #fff; border-radius: 18px; width: 460px; max-width: calc(100vw - 40px); box-shadow: 0 20px 60px rgba(20,30,50,.25); overflow: hidden; }
</style>
