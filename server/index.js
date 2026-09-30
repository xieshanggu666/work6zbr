import express from 'express'
import { db, run, all, get } from './db.js'

const app = express()
app.use(express.json())
const PORT = 4170

/* ================= 种子数据 ================= */
function seed() {
  if (get('SELECT COUNT(*) c FROM sports').c > 0) return
  const NOW = new Date().toISOString()

  // 单位
  const units = [['雷霆学院', '#ff7a2f'], ['飞鹰学院', '#2f9bff'], ['雄狮学院', '#2ecc71'], ['星河学院', '#9b59b6']]
  const unitId = {}
  units.forEach((u, i) => { run('INSERT INTO units (name,color) VALUES (?,?)', u[0], u[1]); unitId[u[0]] = i + 1 })

  // 场地
  const venues = ['中心篮球馆', '五人足球场', '羽毛球馆', '田径场', '备用2号场']
  venues.forEach(v => run('INSERT INTO venues (name,type) VALUES (?,?)', v, 'arena'))

  // 裁判
  const refs = ['王裁判', '李裁判', '张裁判', '赵裁判', '陈裁判', '孙裁判']
  refs.forEach(r => run('INSERT INTO referees (name) VALUES (?)', r))

  // 项目（quota：参赛名额，组委会可在资格审核页调整）
  const sp = (name, cat, fmt, venue, tq, aq) => { const r = run('INSERT INTO sports (name,category,format,venue,team_quota,athlete_quota) VALUES (?,?,?,?,?,?)', name, cat, fmt, venue, tq, aq); return Number(r.lastInsertRowid) }
  const spBasket = sp('篮球', '球类', 'roundrobin', '中心篮球馆', 8, 12)
  const spFoot = sp('五人制足球', '球类', 'group_knockout', '五人足球场', 6, 12)
  const spBad = sp('羽毛球', '球类', 'knockout', '羽毛球馆', 6, 8)
  const sp100 = sp('田径 · 100米', '田径', 'track', '田径场', 0, 10)

  // 队伍
  const mk = (name, unit, status = 'approved', sport = 0) => { const r = run('INSERT INTO teams (name,unit_id,sport_id,status,reviewed_at) VALUES (?,?,?,?,?)', name, unitId[unit], sport, status, status === 'approved' ? NOW : null); return Number(r.lastInsertRowid) }
  // 篮球 4 队
  const B = ['雷霆学院', '飞鹰学院', '雄狮学院', '星河学院'].map(u => mk(u === '雷霆学院' ? '雷霆队' : u === '飞鹰学院' ? '飞鹰队' : u === '雄狮学院' ? '雄狮队' : '星河队', u))
  B.forEach(id => run('UPDATE teams SET sport_id=? WHERE id=?', spBasket, id))
  // 足球 6 队
  const F = [
    ['雷霆队', '雷霆学院'], ['飞鹰队', '飞鹰学院'], ['雄狮队', '雄狮学院'],
    ['星河队', '星河学院'], ['闪电队', '雷霆学院'], ['烈焰队', '雄狮学院']
  ].map(([n, u]) => mk(n, u))
  F.forEach(id => run('UPDATE teams SET sport_id=? WHERE id=?', spFoot, id))
  // 羽毛球 4 队（同名队伍）
  const G = ['雷霆队', '飞鹰队', '雄狮队', '星河队'].map((n, i) => mk(n, units[i][0]))
  G.forEach(id => run('UPDATE teams SET sport_id=? WHERE id=?', spBad, id))
  // 田径 8 名运动员（已通过审核，纳入 100 米名单）
  const runners = [['林一', '雷霆学院'], ['周楠', '飞鹰学院'], ['陈晨', '雄狮学院'], ['顾言', '星河学院'], ['徐凯', '雷霆学院'], ['韩雪', '飞鹰学院'], ['陆鸣', '雄狮学院'], ['宋词', '星河学院']]
  const timeSlots = ['09:00', '09:20', '09:40', '10:00', '10:20', '10:40', '11:00', '11:20']
  const runnerIds = []
  runners.forEach(([n, u]) => { const r = run('INSERT INTO athletes (name,unit_id,sport_id,status,reviewed_at) VALUES (?,?,?,?,?)', n, unitId[u], sp100, 'approved', NOW); runnerIds.push(Number(r.lastInsertRowid)) })

  // —— 报名待审核演示数据（各单位提交，等待组委会审核资格与名额） ——
  // 篮球名额 6：现 4 队，2 支待审（通过后即满额），第 3 支将触发名额超限拦截
  mk('疾风队', '飞鹰学院', 'pending', spBasket); mk('晨曦队', '星河学院', 'pending', spBasket); mk('角力队', '雄狮学院', 'pending', spBasket)
  // 羽毛球名额 6：现 4 队，新增 1 支待审
  mk('闪电羽毛球队', '雷霆学院', 'pending', spBad)
  // 田径 100 米名额 10：现 8 人，新增 2 人待审 + 1 人（名额通过后将超限，可驳回演示）
  run('INSERT INTO athletes (name,unit_id,sport_id,status) VALUES (?,?,?,?)', '许诺', unitId['飞鹰学院'], sp100, 'pending')
  run('INSERT INTO athletes (name,unit_id,sport_id,status) VALUES (?,?,?,?)', '丁力', unitId['雄狮学院'], sp100, 'pending')
  run('INSERT INTO athletes (name,unit_id,sport_id,status,review_note) VALUES (?,?,?,?,?)', '高翔', unitId['星河学院'], sp100, 'pending', '年龄资格存疑')

  // 循环赛助手
  const pairs = arr => { const p = []; for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) p.push([arr[i], arr[j]]); return p }

  const venueById = get('SELECT id FROM venues LIMIT 1').id

  // —— 篮球：4队 单循环 6 场
  let ono = 0
  pairs(B).forEach(([a, b]) => {
    ono++
    run('INSERT INTO matches (sport_id,stage,team_a,team_b,venue_id,order_no,time_label,status) VALUES (?,?,?,?,?,?,?,?)', spBasket, '循环', a, b, venueById, ono, timeSlots[(ono - 1) % 8], 'scheduled')
  })

  // —— 足球：分 AB 两组（A: 雷霆/雄狮/闪电  B: 飞鹰/星河/烈焰），组内循环 6 场
  const grpA = [F[0], F[2], F[4]]
  const grpB = [F[1], F[3], F[5]]
  ono = 0
  pairs(grpA).forEach(([a, b]) => { ono++; run('INSERT INTO matches (sport_id,stage,group_name,team_a,team_b,venue_id,order_no,time_label,status) VALUES (?,?,?,?,?,?,?,?,?)', spFoot, '小组', 'A组', a, b, 2, ono, timeSlots[(ono - 1) % 8], 'scheduled') })
  pairs(grpB).forEach(([a, b]) => { ono++; run('INSERT INTO matches (sport_id,stage,group_name,team_a,team_b,venue_id,order_no,time_label,status) VALUES (?,?,?,?,?,?,?,?,?)', spFoot, '小组', 'B组', a, b, 2, ono, timeSlots[(ono - 1) % 8], 'scheduled') })

  // —— 羽毛球：半决赛 2 场（固定对位），决赛/季军由编排按钮产生
  run('INSERT INTO matches (sport_id,stage,team_a,team_b,venue_id,order_no,time_label,status) VALUES (?,?,?,?,?,?,?,?)', spBad, '半决赛', G[0], G[1], 3, 1, '09:30', 'scheduled')
  run('INSERT INTO matches (sport_id,stage,team_a,team_b,venue_id,order_no,time_label,status) VALUES (?,?,?,?,?,?,?,?)', spBad, '半决赛', G[2], G[3], 3, 2, '10:00', 'scheduled')

  rebuildStandings()

  // —— 预录部分成绩（演示看板有内容）
  const sc = (sport, a, b, sa, sb) => { const m = get('SELECT id FROM matches WHERE sport_id=? AND team_a=? AND team_b=? AND status=\'scheduled\'', sport, a, b); if (m) finishMatch(m.id, sa, sb) }
  // 篮球全录 → 决出冠军
  sc(spBasket, B[0], B[1], 78, 70); sc(spBasket, B[2], B[3], 65, 71)
  sc(spBasket, B[0], B[2], 82, 60); sc(spBasket, B[1], B[3], 69, 74)
  sc(spBasket, B[0], B[3], 58, 66); sc(spBasket, B[1], B[2], 88, 77)
  // 足球小组录 4 场，留 2 场未赛
  sc(spFoot, grpA[0], grpA[1], 3, 1); sc(spFoot, grpA[1], grpA[2], 2, 2); sc(spFoot, grpA[0], grpA[2], 4, 2)
  sc(spFoot, grpB[0], grpB[1], 1, 3); sc(spFoot, grpB[1], grpB[2], 2, 1); sc(spFoot, grpB[0], grpB[2], 0, 2)
  // 羽毛球两场半决赛都录 → 可编排决赛
  sc(spBad, G[0], G[1], 21, 16); sc(spBad, G[2], G[3], 18, 21)
  // 田径成绩
  const marks = [10.62, 10.88, 11.05, 11.21, 11.35, 11.42, 11.58, 11.79]
  runnerIds.forEach((aid, i) => run('INSERT INTO entries (sport_id,athlete_id,mark,rank,unit_id) VALUES (?,?,?,?,?)', sp100, aid, marks[i], i + 1, get('SELECT unit_id FROM athletes WHERE id=?', aid).unit_id))

  recomputeMedals()
}
/* ================= 积分与奖牌 ================= */
function rebuildStandings(sportId) {
  const sports = sportId ? [sportId] : all('SELECT * FROM sports').map(s => s.id)
  sports.forEach(sid => {
    all('SELECT id FROM standings WHERE sport_id=?', sid).forEach(r => run('DELETE FROM standings WHERE id=?', r.id))
    // 积分榜仅纳入资格审核通过（approved）的队伍；退报/撤销/驳回/待审均不入榜
    const teams = all(`SELECT id FROM teams WHERE sport_id=? AND status='approved'`, sid).map(t => t.id)
    teams.forEach(t => run('INSERT INTO standings (sport_id,team_id) VALUES (?,?)', sid, t))
    const done = all(`SELECT * FROM matches WHERE sport_id=? AND status='finished'`, sid)
    done.forEach(m => {
      const rowA = get('SELECT * FROM standings WHERE sport_id=? AND team_id=?', sid, m.team_a)
      const rowB = get('SELECT * FROM standings WHERE sport_id=? AND team_id=?', sid, m.team_b)
      if (!rowA || !rowB) return
      const sa = m.score_a, sb = m.score_b
      // 已存在记录则不重复累加
      if (m._acc) return
      rowA.play += 1; rowB.play += 1
      rowA.gf += sa; rowA.ga += sb; rowB.gf += sb; rowB.ga += sa
      if (sa > sb) { rowA.win++; rowB.lose++; rowA.points += 3 }
      else if (sa < sb) { rowB.win++; rowA.lose++; rowB.points += 3 }
      else { rowA.draw++; rowB.draw++; rowA.points += 1; rowB.points += 1 }
      run('UPDATE standings SET play=?,win=?,draw=?,lose=?,gf=?,ga=?,points=? WHERE id=?',
        rowA.play, rowA.win, rowA.draw, rowA.lose, rowA.gf, rowA.ga, rowA.points, rowA.id)
      run('UPDATE standings SET play=?,win=?,draw=?,lose=?,gf=?,ga=?,points=? WHERE id=?',
        rowB.play, rowB.win, rowB.draw, rowB.lose, rowB.gf, rowB.ga, rowB.points, rowB.id)
      m._acc = 1
    })
    // 排名
    const rows = all('SELECT * FROM standings WHERE sport_id=?', sid).sort((x, y) => y.points - x.points || (y.gf - y.ga) - (x.gf - x.ga) || x.id - y.id)
    rows.forEach((r, i) => run('UPDATE standings SET rank=? WHERE id=?', i + 1, r.id))
  })
}
function unitOfTeam(teamId) {
  const t = teamId == null ? null : get('SELECT unit_id FROM teams WHERE id=?', teamId)
  return t ? t.unit_id : null
}
function recomputeMedals() {
  all('SELECT unit_id FROM medals').forEach(r => run('DELETE FROM medals WHERE unit_id=?', r.unit_id))
  const add = (uid, medal) => { if (!uid) return; const row = get('SELECT * FROM medals WHERE unit_id=?', uid); const k = medal === 'gold' ? 'gold' : medal === 'silver' ? 'silver' : 'bronze'; if (row) run(`UPDATE medals SET ${k}=${k}+1 WHERE unit_id=?`, uid); else run(`INSERT INTO medals (unit_id,${k}) VALUES (?,1)`, uid) }
  const sports = all('SELECT * FROM sports')
  sports.forEach(spo => {
    if (spo.format === 'track') {
      const tops = all('SELECT * FROM entries WHERE sport_id=? AND mark IS NOT NULL ORDER BY mark ASC LIMIT 3', spo.id)
      add(tops[0]?.unit_id, 'gold'); add(tops[1]?.unit_id, 'silver'); add(tops[2]?.unit_id, 'bronze')
    } else if (spo.format === 'roundrobin') {
      const champ = get("SELECT s.*, t.unit_id FROM standings s JOIN teams t ON t.id=s.team_id WHERE s.sport_id=? AND s.rank=1 AND t.status='approved'", spo.id)
      const second = get("SELECT s.*, t.unit_id FROM standings s JOIN teams t ON t.id=s.team_id WHERE s.sport_id=? AND s.rank=2 AND t.status='approved'", spo.id)
      const third = get("SELECT s.*, t.unit_id FROM standings s JOIN teams t ON t.id=s.team_id WHERE s.sport_id=? AND s.rank=3 AND t.status='approved'", spo.id)
      if (all('SELECT * FROM standings WHERE sport_id=?', spo.id).some(r => r.play > 0)) { add(champ?.unit_id, 'gold'); add(second?.unit_id, 'silver'); add(third?.unit_id, 'bronze') }
    } else {
      const fin = get(`SELECT * FROM matches WHERE sport_id=? AND status='finished' AND stage='决赛'`, spo.id)
      if (fin && fin.winner != null) {
        add(unitOfTeam(fin.winner), 'gold')
        const loser = fin.winner === fin.team_a ? fin.team_b : fin.team_a
        if (get("SELECT status FROM teams WHERE id=?", loser)?.status === 'approved') add(unitOfTeam(loser), 'silver')
      }
      const thirdM = get(`SELECT * FROM matches WHERE sport_id=? AND status='finished' AND stage='季军'`, spo.id)
      if (thirdM && thirdM.winner != null) add(unitOfTeam(thirdM.winner), 'bronze')
    }
  })
}
/* ================= 编排下一轮（KO） ================= */
const STAGE_ORDER = { '小组': 1, '循环': 1, '半决赛': 2, '决赛': 3, '季军': 3 }
const KO_STAGES = ['半决赛', '决赛', '季军']   // 淘汰赛阶段：不允许平分收场
const loserOf = m => (m.winner === m.team_a ? m.team_b : m.team_a)
function finishMatch(id, sa, sb, tbA = null, tbB = null) {
  const m = get('SELECT * FROM matches WHERE id=?', id)
  let winner = null, ta = null, tb = null
  if (sa > sb) winner = m.team_a
  else if (sb > sa) winner = m.team_b
  else if (KO_STAGES.includes(m.stage)) {
    // 淘汰赛常规时间平分：必须录入加时/点球决胜比分，且决胜不能再次持平
    ta = tbA === null || tbA === undefined || tbA === '' ? null : Number(tbA)
    tb = tbB === null || tbB === undefined || tbB === '' ? null : Number(tbB)
    if (!Number.isInteger(ta) || !Number.isInteger(tb) || ta < 0 || tb < 0) {
      throw new Error('淘汰赛常规时间平分，需录入加时/点球决胜比分')
    }
    if (ta === tb) throw new Error('决胜比分不能再次持平')
    winner = ta > tb ? m.team_a : m.team_b
  }
  // 小组/循环允许平局（winner 为 NULL）；决胜比分不计入进失球
  run(`UPDATE matches SET score_a=?, score_b=?, tb_a=?, tb_b=?, winner=?, status='finished' WHERE id=?`, sa, sb, ta, tb, winner, id)
  rebuildStandings(m.sport_id)
  recomputeMedals()
}
function generateKO(sportId) {
  const spo = get('SELECT * FROM sports WHERE id=?', sportId)
  // 半决赛/决赛“已结算”口径：完赛或因资格联动取消（取消时 winner 已置为另一方）
  const settled = m => m.status === 'finished' || m.status === 'cancelled'
  const koWinner = m => m.winner
  const koLoser = m => (m.winner == null ? null : loserOf(m))
  if (spo.format === 'knockout') {
    // 羽毛球：半决赛是否已全部完成
    const semis = all(`SELECT * FROM matches WHERE sport_id=? AND stage='半决赛'`, sportId)
    const hasFinal = get(`SELECT id FROM matches WHERE sport_id=? AND stage='决赛'`, sportId)
    if (semis.length && semis.every(settled) && !hasFinal) {
      if (semis.some(s => s.status === 'finished' && s.winner == null)) return '半决赛存在平分未决胜场次，请先补录加时/点球决胜比分'
      const w1 = koWinner(semis[0]), w2 = koWinner(semis[1])
      const l1 = koLoser(semis[0]), l2 = koLoser(semis[1])
      run('INSERT INTO matches (sport_id,stage,team_a,team_b,venue_id,order_no,time_label,status) VALUES (?,?,?,?,?,?,?,?)', sportId, '决赛', w1, w2, 3, 9, '13:00', 'scheduled')
      // 双方负者均有效（非取消/轮空）才设季军战
      if (l1 != null && l2 != null && get("SELECT status FROM teams WHERE id=?", l1)?.status === 'approved' && get("SELECT status FROM teams WHERE id=?", l2)?.status === 'approved') {
        run('INSERT INTO matches (sport_id,stage,team_a,team_b,venue_id,order_no,time_label,status) VALUES (?,?,?,?,?,?,?,?)', sportId, '季军', l1, l2, 5, 10, '12:30', 'scheduled')
      }
      return '已生成羽毛球 决赛 与 季军战'
    }
    return null
  }
  // group_knockout：小组完成后生成半决赛，半决赛完成后生成决赛
  const groups = ['A组', 'B组']
  const done = {}
  groups.forEach(g => {
    const gms = all(`SELECT * FROM matches WHERE sport_id=? AND group_name=?`, sportId, g)
    done[g] = gms.length === 0 || gms.every(m => m.status === 'finished' || m.status === 'cancelled')
  })
  const hasSemi = get(`SELECT id FROM matches WHERE sport_id=? AND stage='半决赛'`, sportId)
  if (groups.every(g => done[g]) && !hasSemi) {
    const rankOf = g => {
      // 积分榜只有 approved 队伍，排名口径与榜单一致
      const ids = all(`SELECT s.team_id id FROM standings s JOIN teams t ON t.id=s.team_id WHERE s.sport_id=? AND t.status='approved'`, sportId)
        .map(r => r.id)
        .filter(id => all(`SELECT id FROM matches WHERE sport_id=? AND group_name=? AND (team_a=? OR team_b=?)`, sportId, g, id, id).length > 0)
      return ids.map(id => ({ id, rank: get('SELECT rank r FROM standings WHERE sport_id=? AND team_id=?', sportId, id)?.r ?? 999 })).sort((a, b) => a.rank - b.rank).map(r => r.id)
    }
    const A = rankOf('A组'), B = rankOf('B组')
    if (A.length >= 2 && B.length >= 2) {
      run('INSERT INTO matches (sport_id,stage,team_a,team_b,venue_id,order_no,time_label,status) VALUES (?,?,?,?,?,?,?,?)', sportId, '半决赛', A[0], B[1], 2, 99, '14:00', 'scheduled')
      run('INSERT INTO matches (sport_id,stage,team_a,team_b,venue_id,order_no,time_label,status) VALUES (?,?,?,?,?,?,?,?)', sportId, '半决赛', B[0], A[1], 2, 100, '14:30', 'scheduled')
      return '已按小组排名生成足球半决赛'
    }
    return null
  }
  const semis = all(`SELECT * FROM matches WHERE sport_id=? AND stage='半决赛'`, sportId)
  const hasFinal = get(`SELECT id FROM matches WHERE sport_id=? AND stage='决赛'`, sportId)
  if (semis.length && semis.every(settled) && !hasFinal) {
    if (semis.some(s => s.status === 'finished' && s.winner == null)) return '半决赛存在平分未决胜场次，请先补录加时/点球决胜比分'
    const w1 = koWinner(semis[0]), w2 = koWinner(semis[1])
    const l1 = koLoser(semis[0]), l2 = koLoser(semis[1])
    run('INSERT INTO matches (sport_id,stage,team_a,team_b,venue_id,order_no,time_label,status) VALUES (?,?,?,?,?,?,?,?)', sportId, '决赛', w1, w2, 2, 101, '16:00', 'scheduled')
    if (l1 != null && l2 != null && get("SELECT status FROM teams WHERE id=?", l1)?.status === 'approved' && get("SELECT status FROM teams WHERE id=?", l2)?.status === 'approved') {
      run('INSERT INTO matches (sport_id,stage,team_a,team_b,venue_id,order_no,time_label,status) VALUES (?,?,?,?,?,?,?,?)', sportId, '季军', l1, l2, 5, 102, '15:30', 'scheduled')
    }
    return '已生成决赛 与 季军战'
  }
  return null
}
function finishTrack(sportId, body) {
  // body: [{athlete_id, mark}] 按顺序；仅审核通过的运动员可参与排名
  const valid = body.filter(b => get("SELECT id FROM athletes WHERE id=? AND sport_id=? AND status='approved'", Number(b.athlete_id), sportId) && Number.isFinite(Number(b.mark)))
  const sorted = valid.slice().sort((a, b) => Number(a.mark) - Number(b.mark))
  // 先清空该项目名次，再按成绩升序重排（退报/撤销者自动出榜）
  run('UPDATE entries SET rank=NULL WHERE sport_id=?', sportId)
  sorted.forEach((b, i) => run('UPDATE entries SET mark=?, rank=? WHERE athlete_id=? AND sport_id=?', Number(b.mark), i + 1, Number(b.athlete_id), sportId))
  run('UPDATE sports SET finished=1 WHERE id=?', sportId)

  recomputeMedals()
}
seed()

/* ================= 参赛资格审核 ================= */
const nowTs = () => new Date().toISOString()

// 名额使用：approved + pending 均占位（驳回/退报/撤销释放名额）
function quotaUsage(sportId) {
  const spo = get('SELECT * FROM sports WHERE id=?', sportId)
  const teamUsed = get(`SELECT COUNT(*) c FROM teams WHERE sport_id=? AND status IN ('approved','pending')`, sportId)?.c || 0
  const athUsed = get(`SELECT COUNT(*) c FROM athletes WHERE sport_id=? AND status IN ('approved','pending')`, sportId)?.c || 0
  return { teamQuota: spo.team_quota || 0, athleteQuota: spo.athlete_quota || 0, teamUsed, athUsed }
}
// 审核通过口径：仅统计 approved + 当前这条记录（其他待审记录尚未获得名额）
function approveQuotaOk(sportId, kind, selfPending) {
  const spo = get('SELECT * FROM sports WHERE id=?', sportId)
  const table = kind === 'team' ? 'teams' : 'athletes'
  const quota = kind === 'team' ? (spo.team_quota || 0) : (spo.athlete_quota || 0)
  if (!quota) return true
  const approved = get(`SELECT COUNT(*) c FROM ${table} WHERE sport_id=? AND status='approved'`, sportId)?.c || 0
  // selfPending 本身是待审：通过后占用 1 个名额
  return approved + (selfPending ? 1 : 0) <= quota
}

// 退报/资格撤销：联动处理受影响的对阵与成绩
//  - 未赛场次：直接删除
//  - 已完赛场次：作废旧成绩（status=cancelled，清空比分/胜方），积分榜与奖牌重算
//  - 淘汰赛：含该队的半决赛作废后，其另一方轮空晋级；依赖这些场次的后续对阵（决赛/季军）同步删除
function cascadeTeamOut(teamId, reason) {
  const team = get('SELECT * FROM teams WHERE id=?', teamId)
  if (!team) return { removed: 0, voided: 0, downstream: 0 }
  const sid = team.sport_id
  let removed = 0, voided = 0, downstream = 0
  const affected = all('SELECT * FROM matches WHERE team_a=? OR team_b=?', teamId, teamId)

  affected.forEach(m => {
    if (m.status === 'scheduled') {
      run('DELETE FROM matches WHERE id=?', m.id)
      removed++
    } else {
      // 已完赛：作废成绩。半决赛若另一方有效，置其轮空晋级（winner=另一方）
      const other = m.team_a === teamId ? m.team_b : m.team_a
      const byeWinner = (m.stage === '半决赛' && other && get("SELECT status FROM teams WHERE id=?", other)?.status === 'approved') ? other : null
      run(`UPDATE matches SET status='cancelled', score_a=NULL, score_b=NULL, tb_a=NULL, tb_b=NULL, winner=?, note=? WHERE id=?`,
        byeWinner, reason, m.id)
      voided++
    }
  })

  // 含作废半决赛的项目，其后续轮次（决赛/季军）未赛场次失效
  const touchedSemi = affected.some(m => m.stage === '半决赛')
  if (touchedSemi) {
    const later = all(`SELECT * FROM matches WHERE sport_id=? AND stage IN ('决赛','季军') AND status='scheduled'`, sid)
    later.forEach(m => { run('DELETE FROM matches WHERE id=?', m.id); downstream++ })
  }

  rebuildStandings(sid)
  recomputeMedals()
  return { removed, voided, downstream }
}

// 运动员退报/撤销：清除其成绩与名次，重新排名并结算奖牌
function cascadeAthleteOut(athleteId) {
  const a = get('SELECT * FROM athletes WHERE id=?', athleteId)
  if (!a) return
  run('DELETE FROM entries WHERE athlete_id=?', athleteId)
  rerankTrack(a.sport_id)
  recomputeMedals()
}
function rerankTrack(sportId) {
  const rows = all(`SELECT e.* FROM entries e JOIN athletes a ON a.id=e.athlete_id
                    WHERE e.sport_id=? AND a.status='approved' AND e.mark IS NOT NULL ORDER BY e.mark ASC`, sportId)
  rows.forEach((r, i) => run('UPDATE entries SET rank=? WHERE id=?', i + 1, r.id))
}

// 审核通过后把队伍纳入对阵：
//  - 循环/小组项目尚无任何场次 → 自动按当前在审名单完成编排
//  - 已有赛程 → 补充新队与在册队伍的未排对阵（小组项目补入人数较少的组）
function integrateTeamIntoSchedule(sportId, teamId) {
  const spo = get('SELECT * FROM sports WHERE id=?', sportId)
  const liveIds = () => all(`SELECT id FROM teams WHERE sport_id=? AND status='approved' ORDER BY id`, sportId).map(t => t.id)
  const venueRow = get('SELECT id FROM venues ORDER BY id LIMIT 1')
  const venueId = venueRow?.id ?? null
  let added = 0

  const nextOrder = (stage, group) => {
    const row = group
      ? get('SELECT COALESCE(MAX(order_no),0) m FROM matches WHERE sport_id=? AND stage=? AND group_name=?', sportId, stage, group)
      : get("SELECT COALESCE(MAX(order_no),0) m FROM matches WHERE sport_id=? AND stage=? AND group_name IS NULL", sportId, stage)
    return (row?.m || 0) + 1
  }
  const pairExists = (a, b) => get('SELECT id FROM matches WHERE sport_id=? AND ((team_a=? AND team_b=?) OR (team_a=? AND team_b=?))', sportId, a, b, b, a)

  if (spo.format === 'roundrobin') {
    // 无任何比赛记录（含已取消）时整轮生成；否则只补新队的对阵
    const ids = liveIds()
    if (!get('SELECT id FROM matches WHERE sport_id=?', sportId)) {
      let ono = 0
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
        ono++
        run(`INSERT INTO matches (sport_id,stage,team_a,team_b,venue_id,order_no,time_label,status) VALUES (?,?,?,?,?,?,?,?)`,
          sportId, '循环', ids[i], ids[j], venueId, ono, '待编排', 'scheduled')
        added++
      }
    } else {
      liveIds().filter(id => id !== teamId).forEach(opp => {
        if (!pairExists(teamId, opp)) {
          run(`INSERT INTO matches (sport_id,stage,team_a,team_b,venue_id,order_no,time_label,status) VALUES (?,?,?,?,?,?,?,?)`,
            sportId, '循环', teamId, opp, venueId, nextOrder('循环'), '待编排', 'scheduled')
          added++
        }
      })
    }
  } else if (spo.format === 'group_knockout') {
    if (get("SELECT id FROM matches WHERE sport_id=? AND stage!='小组'", sportId)) return { added, note: '淘汰赛已启动，新通过队伍请由组委会人工编入' }
    // 编入人数较少的组（无组信息时默认 A 组）
    const cntA = get(`SELECT COUNT(DISTINCT t) c FROM (SELECT team_a t FROM matches WHERE sport_id=? AND group_name='A组' UNION SELECT team_b FROM matches WHERE sport_id=? AND group_name='A组')`, sportId, sportId)?.c || 0
    const cntB = get(`SELECT COUNT(DISTINCT t) c FROM (SELECT team_a t FROM matches WHERE sport_id=? AND group_name='B组' UNION SELECT team_b FROM matches WHERE sport_id=? AND group_name='B组')`, sportId, sportId)?.c || 0
    const group = cntA <= cntB ? 'A组' : 'B组'
    const mates = new Set()
    all(`SELECT team_a a, team_b b FROM matches WHERE sport_id=? AND group_name=?`, sportId, group).forEach(m => { mates.add(m.a); mates.add(m.b) })
    ;[...mates].filter(Boolean).forEach(opp => {
      if (opp !== teamId && !pairExists(teamId, opp)) {
        run(`INSERT INTO matches (sport_id,stage,group_name,team_a,team_b,venue_id,order_no,time_label,status) VALUES (?,?,?,?,?,?,?,?,?)`,
          sportId, '小组', group, teamId, opp, venueId, nextOrder('小组', group), '待编排', 'scheduled')
        added++
      }
    })
  }
  // knockout（单败淘汰）：种子对位固定，不自动插入，由组委会在赛程页处理
  rebuildStandings(sportId)
  return { added }
}

/* ================= API ================= */
const joinMatch = m => {
  if (!m) return null
  return {
    ...m,
    teamA: m.team_a ? get('SELECT id,name,unit_id FROM teams WHERE id=?', m.team_a) : null,
    teamB: m.team_b ? get('SELECT id,name,unit_id FROM teams WHERE id=?', m.team_b) : null,
    venue: get('SELECT * FROM venues WHERE id=?', m.venue_id) || null
  }
}
app.get('/api/sports', (_, res) => res.json(all('SELECT * FROM sports')))
app.get('/api/teams', (_, res) => res.json(all('SELECT t.*, u.name unit, u.color FROM teams t JOIN units u ON u.id=t.unit_id')))
app.get('/api/units', (_, res) => res.json(all('SELECT * FROM units')))
app.get('/api/venues', (_, res) => res.json(all('SELECT * FROM venues')))
app.get('/api/referees', (_, res) => res.json(all('SELECT * FROM referees')))
app.get('/api/athletes', (_, res) => res.json(all('SELECT a.*, u.name unit FROM athletes a JOIN units u ON u.id=a.unit_id')))
app.get('/api/matches', (_, res) => res.json(all('SELECT * FROM matches').map(joinMatch)))
app.get('/api/entries', (_, res) => res.json(all(`SELECT e.*, a.name aname, u.name unit, a.status astatus FROM entries e JOIN athletes a ON a.id=e.athlete_id JOIN units u ON u.id=a.unit_id WHERE a.status='approved'`)))
app.get('/api/standings/:sid', (req, res) => res.json(all('SELECT s.*, t.name tname, u.name unit, u.color FROM standings s JOIN teams t ON t.id=s.team_id JOIN units u ON u.id=t.unit_id WHERE s.sport_id=? ORDER BY s.rank', Number(req.params.sid))))
app.get('/api/medals', (_, res) => res.json(all('SELECT m.*, u.name FROM medals m JOIN units u ON u.id=m.unit_id ORDER BY m.gold DESC, m.silver DESC')))

app.get('/api/overview', (_, res) => {
  const sp = all('SELECT * FROM sports')
  const mats = all('SELECT * FROM matches')
  const done = mats.filter(m => m.status === 'finished')
  const pend = mats.filter(m => m.status === 'scheduled')
  const cancelled = mats.filter(m => m.status === 'cancelled')
  res.json({
    sports: sp.length,
    finishedMatches: done.length,
    pendingMatches: pend.length,
    cancelledMatches: cancelled.length,
    teams: get(`SELECT COUNT(*) c FROM teams WHERE status='approved'`).c || 0,
    pendingTeams: get(`SELECT COUNT(*) c FROM teams WHERE status='pending'`).c || 0,
    athletes: get(`SELECT COUNT(*) c FROM athletes WHERE status='approved'`).c || 0,
    pendingAthletes: get(`SELECT COUNT(*) c FROM athletes WHERE status='pending'`).c || 0,
    sportDone: sp.map(s => ({ ...s, total: mats.filter(m => m.sport_id === s.id && m.status !== 'cancelled').length, done: done.filter(m => m.sport_id === s.id).length })),
    recent: all('SELECT * FROM matches ORDER BY id DESC LIMIT 5').map(joinMatch)
  })
})
app.post('/api/matches/:id/score', (req, res) => {
  const { score_a, score_b, tb_a, tb_b } = req.body
  const m = get('SELECT * FROM matches WHERE id=?', Number(req.params.id))
  if (!m) return res.status(404).json({ error: '场次不存在' })
  if (m.status === 'cancelled') return res.status(400).json({ error: '该场次已因退报/资格撤销作废' })
  if (m.team_a == null || m.team_b == null) return res.status(400).json({ error: '对阵尚未编排，先编排淘汰赛' })
  const ta = get('SELECT status FROM teams WHERE id=?', m.team_a)
  const tb = get('SELECT status FROM teams WHERE id=?', m.team_b)
  if (!ta || !tb || ta.status !== 'approved' || tb.status !== 'approved') return res.status(400).json({ error: '对阵队伍资格未通过审核，不能录入成绩' })
  const sa = Number(score_a), sb = Number(score_b)
  if (!Number.isInteger(sa) || !Number.isInteger(sb) || sa < 0 || sb < 0) return res.status(400).json({ error: '比分必须为非负整数' })
  try {
    finishMatch(m.id, sa, sb, tb_a, tb_b)
  } catch (e) {
    return res.status(400).json({ error: e.message })
  }
  res.json({ ok: true })
})
app.post('/api/ko/:sportId', (req, res) => {
  const msg = generateKO(Number(req.params.sportId))
  res.json({ ok: !!msg, msg })
})
app.post('/api/track/:sportId', (req, res) => {
  finishTrack(Number(req.params.sportId), req.body)
  res.json({ ok: true })
})

/* —— 参赛资格审核 —— */
// 名额总览（供审核页头部与各项目卡片）
app.get('/api/review/summary', (_, res) => {
  const perSport = all('SELECT * FROM sports').map(s => ({ id: s.id, name: s.name, format: s.format, ...quotaUsage(s.id) }))
  res.json({
    pendingTeams: get(`SELECT COUNT(*) c FROM teams WHERE status='pending'`).c,
    pendingAthletes: get(`SELECT COUNT(*) c FROM athletes WHERE status='pending'`).c,
    approvedTeams: get(`SELECT COUNT(*) c FROM teams WHERE status='approved'`).c,
    approvedAthletes: get(`SELECT COUNT(*) c FROM athletes WHERE status='approved'`).c,
    perSport
  })
})
// 设置项目名额
app.post('/api/sports/:id/quota', (req, res) => {
  const sid = Number(req.params.id)
  const teamQuota = Math.max(0, Number(req.body.team_quota) || 0)
  const athleteQuota = Math.max(0, Number(req.body.athlete_quota) || 0)
  const usage = quotaUsage(sid)
  if (teamQuota > 0 && teamQuota < usage.teamUsed) return res.status(400).json({ error: `队伍名额不能低于当前已报名数（${usage.teamUsed}）` })
  if (athleteQuota > 0 && athleteQuota < usage.athUsed) return res.status(400).json({ error: `运动员名额不能低于当前已报名数（${usage.athUsed}）` })
  run('UPDATE sports SET team_quota=?, athlete_quota=? WHERE id=?', teamQuota, athleteQuota, sid)
  res.json({ ok: true })
})
// 单位报名：队伍 / 运动员
app.post('/api/teams/register', (req, res) => {
  const name = String(req.body.name || '').trim()
  const unitId = Number(req.body.unit_id), sportId = Number(req.body.sport_id)
  if (!name) return res.status(400).json({ error: '请填写队伍名称' })
  if (!get('SELECT id FROM units WHERE id=?', unitId)) return res.status(400).json({ error: '请选择参赛单位' })
  const spo = get('SELECT * FROM sports WHERE id=?', sportId)
  if (!spo) return res.status(400).json({ error: '请选择比赛项目' })
  if (spo.format === 'track') return res.status(400).json({ error: '田径等单项项目请报名运动员' })
  const u = quotaUsage(sportId)
  if (u.teamQuota && u.teamUsed >= u.teamQuota) return res.status(400).json({ error: `「${spo.name}」队伍名额 ${u.teamQuota} 已满，无法报名` })
  run(`INSERT INTO teams (name,unit_id,sport_id,status) VALUES (?,?,?,'pending')`, name, unitId, sportId)
  res.json({ ok: true })
})
app.post('/api/athletes/register', (req, res) => {
  const name = String(req.body.name || '').trim()
  const unitId = Number(req.body.unit_id), sportId = Number(req.body.sport_id)
  if (!name) return res.status(400).json({ error: '请填写运动员姓名' })
  if (!get('SELECT id FROM units WHERE id=?', unitId)) return res.status(400).json({ error: '请选择参赛单位' })
  const spo = get('SELECT * FROM sports WHERE id=?', sportId)
  if (!spo) return res.status(400).json({ error: '请选择比赛项目' })
  const u = quotaUsage(sportId)
  if (u.athleteQuota && u.athUsed >= u.athleteQuota) return res.status(400).json({ error: `「${spo.name}」运动员名额 ${u.athleteQuota} 已满，无法报名` })
  const r = run(`INSERT INTO athletes (name,unit_id,sport_id,status) VALUES (?,?,?,'pending')`, name, unitId, sportId)
  // 田径类：先建空成绩行，审核通过后才有 mark/rank
  if (spo.format === 'track') run('INSERT INTO entries (sport_id,athlete_id,unit_id) VALUES (?,?,?)', sportId, Number(r.lastInsertRowid), unitId)
  res.json({ ok: true })
})
// 审核通过（资格 + 名额双校验）
app.post('/api/review/teams/:id/approve', (req, res) => {
  const t = get('SELECT * FROM teams WHERE id=?', Number(req.params.id))
  if (!t) return res.status(404).json({ error: '报名记录不存在' })
  if (t.status !== 'pending') return res.status(400).json({ error: '仅待审核记录可执行通过' })
  if (!approveQuotaOk(t.sport_id, 'team', true)) return res.status(400).json({ error: `队伍名额已满（${get('SELECT * FROM sports WHERE id=?', t.sport_id).team_quota}），无法通过` })
  run(`UPDATE teams SET status='approved', reviewed_at=?, review_note=NULL WHERE id=?`, nowTs(), t.id)
  const integ = integrateTeamIntoSchedule(t.sport_id, t.id)
  recomputeMedals()
  res.json({ ok: true, ...integ })
})
app.post('/api/review/athletes/:id/approve', (req, res) => {
  const a = get('SELECT * FROM athletes WHERE id=?', Number(req.params.id))
  if (!a) return res.status(404).json({ error: '报名记录不存在' })
  if (a.status !== 'pending') return res.status(400).json({ error: '仅待审核记录可执行通过' })
  if (!approveQuotaOk(a.sport_id, 'athlete', true)) return res.status(400).json({ error: `运动员名额已满（${get('SELECT * FROM sports WHERE id=?', a.sport_id).athlete_quota}），无法通过` })
  run(`UPDATE athletes SET status='approved', reviewed_at=?, review_note=NULL WHERE id=?`, nowTs(), a.id)
  if (!get('SELECT id FROM entries WHERE athlete_id=?', a.id)) run('INSERT INTO entries (sport_id,athlete_id,unit_id) VALUES (?,?,?)', a.sport_id, a.id, a.unit_id)
  res.json({ ok: true })
})
// 审核驳回
app.post('/api/review/teams/:id/reject', (req, res) => {
  const t = get('SELECT * FROM teams WHERE id=?', Number(req.params.id))
  if (!t) return res.status(404).json({ error: '报名记录不存在' })
  if (t.status !== 'pending') return res.status(400).json({ error: '仅待审核记录可驳回' })
  run(`UPDATE teams SET status='rejected', reviewed_at=?, review_note=? WHERE id=?`, nowTs(), String(req.body.note || '资格/材料不符'), t.id)
  res.json({ ok: true })
})
app.post('/api/review/athletes/:id/reject', (req, res) => {
  const a = get('SELECT * FROM athletes WHERE id=?', Number(req.params.id))
  if (!a) return res.status(404).json({ error: '报名记录不存在' })
  if (a.status !== 'pending') return res.status(400).json({ error: '仅待审核记录可驳回' })
  run(`UPDATE athletes SET status='rejected', reviewed_at=?, review_note=? WHERE id=?`, nowTs(), String(req.body.note || '资格/材料不符'), a.id)
  run('DELETE FROM entries WHERE athlete_id=?', a.id)
  res.json({ ok: true })
})
// 退报（单位主动；仅 pending/approved 可退）
app.post('/api/review/teams/:id/withdraw', (req, res) => {
  const t = get('SELECT * FROM teams WHERE id=?', Number(req.params.id))
  if (!t) return res.status(404).json({ error: '队伍不存在' })
  if (!['pending', 'approved'].includes(t.status)) return res.status(400).json({ error: '当前状态不可退报' })
  const reason = `队伍退报${req.body.note ? '：' + req.body.note : ''}`
  let impact = { removed: 0, voided: 0, downstream: 0 }
  // 先改状态再联动：积分/奖牌重算时该队已不在 approved 名单
  run(`UPDATE teams SET status='withdrawn', review_note=? WHERE id=?`, reason, t.id)
  if (t.status === 'approved') impact = cascadeTeamOut(t.id, reason)
  res.json({ ok: true, ...impact })
})
app.post('/api/review/athletes/:id/withdraw', (req, res) => {
  const a = get('SELECT * FROM athletes WHERE id=?', Number(req.params.id))
  if (!a) return res.status(404).json({ error: '运动员不存在' })
  if (!['pending', 'approved'].includes(a.status)) return res.status(400).json({ error: '当前状态不可退报' })
  const reason = `运动员退报${req.body.note ? '：' + req.body.note : ''}`
  const wasApproved = a.status === 'approved'
  run(`UPDATE athletes SET status='withdrawn', review_note=? WHERE id=?`, reason, a.id)
  run('DELETE FROM entries WHERE athlete_id=?', a.id)
  if (wasApproved) rerankTrack(a.sport_id)
  recomputeMedals()
  res.json({ ok: true })
})
// 资格撤销（组委会；approved → revoked，联动处理对阵与成绩）
app.post('/api/review/teams/:id/revoke', (req, res) => {
  const t = get('SELECT * FROM teams WHERE id=?', Number(req.params.id))
  if (!t) return res.status(404).json({ error: '队伍不存在' })
  if (t.status !== 'approved') return res.status(400).json({ error: '仅审核通过的队伍可撤销资格' })
  const reason = `资格撤销${req.body.note ? '：' + req.body.note : ''}`
  // 先标记撤销，再联动清理对阵/成绩/积分/奖牌
  run(`UPDATE teams SET status='revoked', review_note=? WHERE id=?`, reason, t.id)
  const impact = cascadeTeamOut(t.id, reason)
  res.json({ ok: true, ...impact })
})
app.post('/api/review/athletes/:id/revoke', (req, res) => {
  const a = get('SELECT * FROM athletes WHERE id=?', Number(req.params.id))
  if (!a) return res.status(404).json({ error: '运动员不存在' })
  if (a.status !== 'approved') return res.status(400).json({ error: '仅审核通过的运动员可撤销资格' })
  const reason = `资格撤销${req.body.note ? '：' + req.body.note : ''}`
  run(`UPDATE athletes SET status='revoked', review_note=? WHERE id=?`, reason, a.id)
  cascadeAthleteOut(a.id)
  res.json({ ok: true })
})

app.get('/api/reset', (_, res) => {
  ['entries', 'standings', 'medals', 'matches', 'referees', 'venues', 'athletes', 'teams', 'units', 'sports'].forEach(t => { try { run(`DELETE FROM ${t}`) } catch (e) {} })
  seed()
  res.json({ ok: true })
})

app.listen(PORT, () => console.log(`[SPORT] API running at http://localhost:${PORT}`))