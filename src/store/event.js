import { defineStore } from 'pinia'

const j = (p, o) => fetch(p, o).then(r => r.json())
const post = (p, body) => j(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })

export const useEventStore = defineStore('event', {
  state: () => ({
    sports: [], teams: [], units: [], venues: [], referees: [],
    athletes: [], matches: [], entries: [], medals: [], overview: null,
    standings: {}, review: null, loaded: false
  }),
  getters: {
    teamOf: s => id => s.teams.find(t => t.id === id),
    unitOfUid: s => id => s.units.find(u => u.id === id),
    // 资格状态展示
    statusMeta: () => st => ({
      pending:   { text: '待审核', cls: 'y', icon: '⏳' },
      approved:  { text: '已通过', cls: 'g', icon: '✅' },
      rejected:  { text: '已驳回', cls: 'r', icon: '⛔' },
      withdrawn: { text: '已退报', cls: 'gray', icon: '↩️' },
      revoked:   { text: '资格撤销', cls: 'r', icon: '🚫' }
    }[st] || { text: st, cls: 'gray', icon: '•' })
  },
  actions: {
    async init() {
      const [sports, teams, units, venues, referees, athletes, matches, entries, medals, overview, review] = await Promise.all([
        j('/api/sports'), j('/api/teams'), j('/api/units'), j('/api/venues'), j('/api/referees'),
        j('/api/athletes'), j('/api/matches'), j('/api/entries'), j('/api/medals'), j('/api/overview'),
        j('/api/review/summary')
      ])
      Object.assign(this, { sports, teams, units, venues, referees, athletes, matches, entries, medals, overview, review })
      const st = {}
      for (const s of sports) st[s.id] = await j('/api/standings/' + s.id)
      this.standings = st
      this.loaded = true
    },
    async refresh() {
      const [matches, entries, medals, overview, review, teams, athletes, sports] = await Promise.all([
        j('/api/matches'), j('/api/entries'), j('/api/medals'), j('/api/overview'),
        j('/api/review/summary'), j('/api/teams'), j('/api/athletes'), j('/api/sports')
      ])
      Object.assign(this, { matches, entries, medals, overview, review, teams, athletes, sports })
      const st = {}
      for (const s of this.sports) st[s.id] = await j('/api/standings/' + s.id)
      this.standings = st
    },
    async score(mid, sa, sb, tbA = null, tbB = null) {
      const r = await post('/api/matches/' + mid + '/score', { score_a: sa, score_b: sb, tb_a: tbA, tb_b: tbB })
      if (r && r.error) throw new Error(r.error)
      await this.refresh()
    },
    async genKO(sid) { const r = await post('/api/ko/' + sid); await this.refresh(); return r.msg },
    async saveTrack(sid, list) { await post('/api/track/' + sid, list); await this.refresh() },
    // —— 参赛资格审核 ——
    async registerTeam(payload) { const r = await post('/api/teams/register', payload); if (r.error) throw new Error(r.error); await this.refresh(); return r },
    async registerAthlete(payload) { const r = await post('/api/athletes/register', payload); if (r.error) throw new Error(r.error); await this.refresh(); return r },
    async setQuota(sid, payload) { const r = await post(`/api/sports/${sid}/quota`, payload); if (r.error) throw new Error(r.error); await this.refresh() },
    async approveTeam(id) { const r = await post(`/api/review/teams/${id}/approve`); if (r.error) throw new Error(r.error); await this.refresh(); return r },
    async approveAthlete(id) { const r = await post(`/api/review/athletes/${id}/approve`); if (r.error) throw new Error(r.error); await this.refresh(); return r },
    async rejectTeam(id, note) { const r = await post(`/api/review/teams/${id}/reject`, { note }); if (r.error) throw new Error(r.error); await this.refresh() },
    async rejectAthlete(id, note) { const r = await post(`/api/review/athletes/${id}/reject`, { note }); if (r.error) throw new Error(r.error); await this.refresh() },
    async withdrawTeam(id, note) { const r = await post(`/api/review/teams/${id}/withdraw`, { note }); if (r.error) throw new Error(r.error); await this.refresh(); return r },
    async withdrawAthlete(id, note) { const r = await post(`/api/review/athletes/${id}/withdraw`, { note }); if (r.error) throw new Error(r.error); await this.refresh() },
    async revokeTeam(id, note) { const r = await post(`/api/review/teams/${id}/revoke`, { note }); if (r.error) throw new Error(r.error); await this.refresh(); return r },
    async revokeAthlete(id, note) { const r = await post(`/api/review/athletes/${id}/revoke`, { note }); if (r.error) throw new Error(r.error); await this.refresh() },
    async reset() { await j('/api/reset'); await this.init() }
  }
})
