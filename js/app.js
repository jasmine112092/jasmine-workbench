/* =========================================================
   Jasmine的工作台  —  应用逻辑（纯前端 / 离线可用）
   ========================================================= */
'use strict';

const STORE_KEY = 'jasmine_workbench_v1';
const APP_NAME = 'Jasmine的工作台';

/* ---------- 工具 ---------- */
const $ = (s, r = document) => r.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = n => String(n).padStart(2, '0');

function todayDate() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function todayStr() { const d = todayDate(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function dateToStr(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function strToDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function daysBetween(a, b) { const d1 = strToDate(a), d2 = strToDate(b); return Math.round((d2 - d1) / 86400000); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function getMonday(d) { const x = new Date(d); const w = (x.getDay() + 6) % 7; return addDays(x, -w); }
function shiftDate(base, n) { return dateToStr(addDays(base, n)); }
function fmtMD(s) { const d = strToDate(s); return `${d.getMonth() + 1}月${d.getDate()}日`; }
function weekdayCn(s) { const w = strToDate(s).getDay(); return '日一二三四五六'[w]; }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

/* 轻提示 */
function toast(msg) {
  let box = document.getElementById('toast-box');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toast-box';
    box.className = 'toast-box';
    document.body.appendChild(box);
  }
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, 3200);
}

/* ---------- 状态 ---------- */
let STATE = null;
let route = 'home';
let calCursor = todayStr();      // 月历游标（默认今天）
let calSelected = todayStr();    // 月历选中日
let editingActivity = null;      // 正在编辑的活动 id
let editingGradeActivity = null; // 正在编辑的年级活动 id

function makeSchool(name, progress) {
  return {
    id: uid(), name, progress: progress === undefined ? 0 : progress,
    deadline: shiftDate(todayDate(), 30),
    materials: [
      { id: uid(), name: '护照', status: 'done' },
      { id: uid(), name: '成绩单', status: 'todo' },
      { id: uid(), name: '推荐信', status: 'todo' },
      { id: uid(), name: '个人陈述', status: 'todo' },
      { id: uid(), name: '语言成绩', status: 'todo' },
    ]
  };
}
function defaultState() {
  const t = todayDate();
  const plan = [
    { name: '王晴好', countries: ['美国', '英国', '澳洲', '加拿大'] },
    { name: '潘钰琳', countries: ['英国', '澳洲'] },
    { name: '龚绍钧', countries: ['美国', '加拿大'] },
    { name: '史瑞', countries: ['澳洲'] },
    { name: '赵诣', countries: ['美国'] },
    { name: '陈泽恺', countries: ['英国', '新加坡'] },
  ];
  const students = plan.map((p, i) => ({
    id: uid(), name: p.name,
    countries: p.countries.map(c => ({
      id: uid(), country: c,
      startDate: shiftDate(t, 5 + i * 4),
      schools: [makeSchool(c + '·示例院校', 10 + i * 12)]
    }))
  }));
  return { tasks:  [], events: [], students, deadlines: [], after: [], clubs: [], activity: { president: '', members: [], activities: [] }, classes: [], clubDept: { president: '', members: [] }, navOrder: null, grades: [], visits: [] };
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    STATE = raw ? JSON.parse(raw) : defaultState();
    if (!STATE.tasks) STATE.tasks = [];
    if (!STATE.events) STATE.events = [];
    if (!STATE.students || !STATE.students.length) STATE.students = defaultState().students;
    if (!STATE.deadlines) STATE.deadlines = [];
    if (!Array.isArray(STATE.after)) STATE.after = [];
    if (!Array.isArray(STATE.clubs)) STATE.clubs = [];
    if (!STATE.activity) STATE.activity = { president: '', members: [], activities: [] };
    if (!Array.isArray(STATE.activity.members)) STATE.activity.members = [];
    if (!Array.isArray(STATE.activity.activities)) STATE.activity.activities = [];
    if (!Array.isArray(STATE.classes)) STATE.classes = [];
    if (!STATE.clubDept) STATE.clubDept = { president: '', members: [] };
    if (!Array.isArray(STATE.clubDept.members)) STATE.clubDept.members = [];
    if (!Array.isArray(STATE.grades)) STATE.grades = [];
    if (!Array.isArray(STATE.visits) || (STATE.visits.length === 0 && typeof window !== 'undefined' && window.VISITS_PRESET)) { STATE.visits = seedVisits(); save(); }
    // 兼容旧数据：国家级 materials 迁移到学校级
    STATE.students.forEach(s => (s.countries || []).forEach(c => {
      if (!Array.isArray(c.schools)) {
        c.schools = Array.isArray(c.materials)
          ? [{ id: uid(), name: (c.country || '默认') + '·申请', progress: c.progress || 0, deadline: '', materials: c.materials }]
          : [];
        delete c.materials;
      }
    }));
    // 兼容旧数据：材料 done 布尔 → status 三态
    STATE.students.forEach(s => {
      (s.countries || []).forEach(c => {
        (c.schools || []).forEach(sc => {
          (sc.materials || []).forEach(m => {
            if (typeof m.done === 'boolean' && m.status == null) m.status = m.done ? 'done' : 'todo';
          });
        });
      });
    });
    // 自动同步：进度 100% 的院校进入「后申请追踪」
    syncAfter();
  } catch (e) { STATE = defaultState(); }
  rollover();
}
function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(STATE)); } catch (e) {} }

/* ---------- 大学来访 · 各校招生官 ---------- */
// 预设数据（从 Excel 导入，见 js/visits-data.js 的 window.VISITS_PRESET）
// 结构：visits = [ { id, country, schools: [ { id, name, officer, wechat, email, visiting, visitDate, visitTime } ] } ]
function seedVisits() {
  const preset = (typeof window !== 'undefined' && window.VISITS_PRESET) || [];
  return preset.map(c => ({
    id: uid(), country: c.country,
    schools: (c.schools || []).map(s => ({
      id: uid(), name: s.name, officer: s.officer || '', wechat: s.wechat || '', email: s.email || '',
      visiting: false, visitDate: '', visitTime: ''
    }))
  }));
}
function allVisitSchools() {
  return (STATE.visits || []).flatMap(c => c.schools || []);
}
function visitsToday() {
  const t = todayStr();
  return allVisitSchools().filter(s => s.visiting && s.visitDate === t);
}

/* 当天没完成的任务，自动移到第二天（成为「未完成」） */
function rollover() {
  const t = todayStr();
  let changed = false;
  STATE.tasks.forEach(tsk => {
    if (!tsk.done && tsk.date < t) { tsk.date = t; tsk.status = 'incomplete'; changed = true; }
  });
  if (changed) save();
}

/* ---------- 任务查询 ---------- */
function secTasks(sec) {
  const t = todayStr();
  if (sec === 'today') return STATE.tasks.filter(x => x.date === t && !x.done && x.status !== 'pending');
  if (sec === 'done') return STATE.tasks.filter(x => x.done);
  if (sec === 'pending') return STATE.tasks.filter(x => x.status === 'pending' && !x.done);
  if (sec === 'incomplete') return STATE.tasks.filter(x => x.date === t && !x.done && x.status === 'incomplete');
  return [];
}

/* ---------- 后申请追踪 ---------- */
// 每条后申请追踪项的结构：
// { id, sid, student, cid, country, schid, school, submitted, tasks: [{id, text, done}], note }
function afterKey(c) { return (c.sid || '') + '|' + (c.schid || ''); }
function afterSchools() { return STATE.after || []; }
function afterGet(sid, schid) {
  return afterSchools().find(x => x.sid === sid && x.schid === schid);
}
// 已录取的院校（用于录取情况看板）
function admittedSchools() { return afterSchools().filter(x => x.admitted); }
// 让「后申请追踪」与「进度100%院校」保持一致
function syncAfter() {
  STATE.after = STATE.after || [];
  const seen = {};
  STATE.students.forEach(s => {
    (s.countries || []).forEach(c => {
      (c.schools || []).forEach(sc => {
        const key = afterKey({ sid: s.id, schid: sc.id });
        const inAfter = afterGet(s.id, sc.id);
        if ((sc.progress || 0) >= 100) {
          if (!inAfter) {
            STATE.after.push({
              id: uid(), sid: s.id, student: s.name,
              cid: c.id, country: c.country,
              schid: sc.id, school: sc.name,
              submitted: todayStr(), tasks: [], note: '',
              admitted: false, admittedDate: '', condition: ''
            });
          } else {
            // 更新展示名（保留 admitted / admittedDate / condition 不丢失）
            inAfter.student = s.name; inAfter.school = sc.name;
            inAfter.country = c.country;
            if (inAfter.admitted == null) inAfter.admitted = false;
            if (inAfter.admittedDate == null) inAfter.admittedDate = '';
            if (inAfter.condition == null) inAfter.condition = '';
          }
          seen[key] = true;
        }
      });
    });
  });
  // 若某院校进度被调回 <100%，从后申请追踪移除
  STATE.after = STATE.after.filter(x => seen[afterKey(x)]);
}
const URG = { high: '高', mid: '中', low: '低' };
const URG_CLS = { high: 'urg-high', mid: 'urg-mid', low: 'urg-low' };
const MAT_STAT = { todo: '还没开始', doing: '正在准备', done: '完成' };
const STATUS_CLS = { todo: 'st-todo', doing: 'st-doing', done: 'st-done' };

/* =========================================================
   渲染
   ========================================================= */
function render() {
  $('#brand-name').textContent = APP_NAME;
  document.title = APP_NAME;
  // 同步导航激活状态
  document.querySelectorAll('.nav-item').forEach(el => {
    const sameRoute = el.dataset.act === 'nav' && el.dataset.route === route;
    el.classList.toggle('active', sameRoute);
  });
  // 导航徽标
  const navBadges = {
    daily: secTasks('today').length + secTasks('incomplete').length,
    students: STATE.students.length,
    deadlines: (STATE.deadlines || []).length,
    visits: (STATE.visits || []).reduce((n, c) => n + (c.schools || []).length, 0),
    after: afterSchools().length,
    admission: admittedSchools().length,
    club: (STATE.clubs || []).length,
    activity: (STATE.activity.activities || []).length,
    classes: (STATE.classes || []).length,
    grade: (STATE.grades || []).length,
  };
  document.querySelectorAll('.nav-item').forEach(el => {
    const r = el.dataset.route;
    const b = el.querySelector('.nav-badge');
    if (b && navBadges[r] != null) b.textContent = navBadges[r];
  });

  const v = $('#view');
  if (route === 'home') v.innerHTML = viewHome();
  else if (route === 'daily') v.innerHTML = viewDaily();
  else if (route === 'completion') v.innerHTML = viewCompletion();
  else if (route === 'students') v.innerHTML = viewStudents();
  else if (route === 'after') v.innerHTML = viewAfter();
  else if (route === 'admission') v.innerHTML = viewAdmission();
  else if (route === 'deadlines') v.innerHTML = viewDeadlines();
  else if (route === 'visits') v.innerHTML = viewVisits();
  else if (route === 'club') v.innerHTML = viewClub();
  else if (route === 'activity') v.innerHTML = viewActivity();
  else if (route === 'classes') v.innerHTML = viewClasses();
  else if (route === 'grade') v.innerHTML = viewGrade();
  else if (route === 'backup') v.innerHTML = viewBackup();
  renderWidget();
  tickClock();
}

/* 左侧导航：恢复保存的排序 */
function applyNavOrder() {
  const order = STATE.navOrder;
  if (!Array.isArray(order) || !order.length) return;
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;
  // 收集当前 nav-item（含挂件按钮）
  const items = Array.from(sidebar.querySelectorAll('.nav-item[data-route]'));
  // 按保存顺序重排（未出现在保存列表中的保持原位，追加在后）
  items.sort((a, b) => {
    const ia = order.indexOf(a.dataset.route);
    const ib = order.indexOf(b.dataset.route);
    const va = ia === -1 ? 999 : ia;
    const vb = ib === -1 ? 999 : ib;
    return va - vb;
  });
  const spacer = sidebar.querySelector('.spacer');
  const widgetBtn = sidebar.querySelector('[data-act="toggle-widget"]');
  items.forEach(el => sidebar.insertBefore(el, spacer || widgetBtn || null));
}
/* 左侧导航：记录拖拽后的排序 */
function captureNavOrder() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;
  STATE.navOrder = Array.from(sidebar.querySelectorAll('.nav-item[data-route]')).map(el => el.dataset.route);
  save();
}

/* ---------- 月历 ---------- */
function viewCalendar() {
  const start = getMonday(strToDate(calCursor));
  const dows = ['一', '二', '三', '四', '五', '六', '日'];
  let head = dows.map(d => `<div class="cal-dow">周${d}</div>`).join('');
  let cells = '';
  const t = todayStr();
  for (let i = 0; i < 35; i++) {
    const d = addDays(start, i);
    const ds = dateToStr(d);
    const other = d.getMonth() !== strToDate(calCursor).getMonth();
    let cls = 'cal-cell' + (other ? ' other' : '') + (ds === t ? ' today' : '') + (ds === calSelected ? ' selected' : '');
    // 汇总
    const tasks = STATE.tasks.filter(x => x.date === ds && !x.done).length;
    // 年级重要活动：按活动日期匹配，显示活动名称
    const gradeActs = (STATE.grades || []).flatMap(g => (g.activities || [])
      .filter(x => x.date === ds)
      .map(x => ({ name: x.title, grade: g.name, cls: 'grade', tag: '年级' })));
    // 学理会活动部活动：按活动日期匹配，显示活动名称
    const actActs = (STATE.activity && STATE.activity.activities || [])
      .filter(x => x.date === ds)
      .map(x => ({ name: x.title, grade: '', cls: 'act', tag: '活动部' }));
    // 重点院校申请截止时间：按截止日期匹配，显示院校名称
    const dlActs = (STATE.deadlines || [])
      .filter(x => x.deadline === ds)
      .map(x => ({ name: x.name, grade: '', cls: 'dl', tag: '截止' }));
    // 大学来访：按来访日期匹配，显示院校名称
    const visitActs = (STATE.visits || []).flatMap(g => (g.schools || [])
      .filter(x => x.visiting && x.visitDate === ds)
      .map(x => ({ name: x.name, grade: '', cls: 'visit', tag: '来访' })));
    const allActs = gradeActs.concat(actActs).concat(dlActs).concat(visitActs);
    let tags = '';
    if (tasks) tags += `<span class="cal-tag task">${tasks}计划</span>`;
    allActs.forEach(ga => {
      const label = (ga.grade ? ga.grade + '·' : '') + ga.name;
      tags += `<span class="cal-tag ${ga.cls}" title="${escapeHtml(label)}">${escapeHtml(label)}</span>`;
    });
    cells += `<div class="${cls}" data-act="cal-cell" data-date="${ds}">
      <div class="dnum">${d.getDate()}</div>${tags ? `<div class="tags">${tags}</div>` : ''}</div>`;
  }
  const cur = strToDate(calCursor);
  const title = `${cur.getFullYear()}年${cur.getMonth() + 1}月`;
  return `<div class="cal-head">
      <div class="title">${title}</div>
      <div class="cal-nav">
        <button data-act="cal-prev">‹ 上月</button>
        <button class="today-btn" data-act="cal-today">回到今天</button>
        <button data-act="cal-next">下月 ›</button>
      </div>
    </div>
    <div class="cal-grid">${head}${cells}</div>
    <div class="cal-legend">
      <span class="cal-tag task" style="cursor:default">计划</span>
      <span class="cal-tag grade" style="cursor:default">年级活动</span>
      <span class="cal-tag act" style="cursor:default">活动部</span>
      <span class="cal-tag dl" style="cursor:default">截止</span>
      <span class="cal-tag visit" style="cursor:default">来访</span>
    </div>`;
}

/* ---------- 每日英语名句词库（离线内置，按天稳定） ---------- */
const QUOTES = [
  { en: "The secret of getting ahead is getting started.", zh: "领先的秘诀，就是开始行动。", src: "Mark Twain", bio: "美国幽默文学大师，《汤姆·索亚历险记》作者" },
  { en: "Well begun is half done.", zh: "良好的开端是成功的一半。", src: "Aristotle 亚里士多德", bio: "古希腊哲学家，柏拉图的学生、亚历山大的老师" },
  { en: "Do the hard things first.", zh: "先把难的事做了。", src: "个人格言", bio: "行动自律" },
  { en: "Small steps every day lead to big changes.", zh: "每天一小步，终将成大变。", src: "个人格言", bio: "坚持积累" },
  { en: "Discipline is choosing between what you want now and what you want most.", zh: "自律，是在当下所欲与心中所向之间做选择。", src: "Abraham Lincoln 林肯", bio: "美国第16任总统，解放黑奴的《解放宣言》颁布者" },
  { en: "I am a slow walker, but I never walk backward.", zh: "我走得慢，但绝不回头。", src: "Abraham Lincoln 林肯", bio: "美国第16任总统，废除奴隶制的领袖" },
  { en: "Action is the foundational key to all success.", zh: "行动是一切成功的根本密钥。", src: "Pablo Picasso 毕加索", bio: "西班牙画家，立体主义开创者" },
  { en: "Stay hungry, stay foolish.", zh: "求知若饥，虚心若愚。", src: "Steve Jobs 乔布斯", bio: "苹果公司创始人，用iPhone改变世界" },
  { en: "The best way out is always through.", zh: "最好的出路，永远是穿过它。", src: "Robert Frost 弗罗斯特", bio: "美国诗人，《未选择的路》作者，四次普利策奖" },
  { en: "Make each day your masterpiece.", zh: "把每一天都过成杰作。", src: "John Wooden 约翰·伍登", bio: "美国传奇篮球教练，UCLA十次夺冠" },
  { en: "What you do today can improve all your tomorrows.", zh: "今日所为，皆利明日。", src: "Ralph Marston", bio: "美国作家，以励志短文见长" },
  { en: "Believe you can and you're halfway there.", zh: "相信自己能，你就已经成功一半。", src: "Theodore Roosevelt 罗斯福", bio: "美国第26任总统，自然保护运动推动者" },
  { en: "Quality is not an act, it is a habit.", zh: "品质不是一次行动，而是一种习惯。", src: "Aristotle 亚里士多德", bio: "古希腊哲学家，《尼各马可伦理学》作者" },
  { en: "Either you run the day, or the day runs you.", zh: "要么你驾驭这一天，要么被它驱使。", src: "Jim Rohn", bio: "美国商业哲学家，自我提升大师" },
  { en: "Done is better than perfect.", zh: "完成胜过完美。", src: "Sheryl Sandberg 谢丽尔·桑德伯格", bio: "Facebook前首席运营官，《向前一步》作者" },
  { en: "The future depends on what you do today.", zh: "未来取决于你今天做什么。", src: "Mahatma Gandhi 甘地", bio: "印度「圣雄」，非暴力运动领袖" },
  { en: "Energy and persistence conquer all things.", zh: "能量与坚持能征服一切。", src: "Benjamin Franklin 富兰克林", bio: "美国开国元勋，科学家、发明家、外交家" },
  { en: "Don't count the days, make the days count.", zh: "别数着过日子，要让日子有意义。", src: "Muhammad Ali 阿里", bio: "传奇拳王，奥运金牌得主" },
  { en: "A year from now you'll wish you started today.", zh: "一年后的你，会庆幸今天开了头。", src: "Karen Lamb", bio: "英国作家，以生活感悟名言知名" },
  { en: "Progress, not perfection.", zh: "要进步，而非完美。", src: "个人格言", bio: "成长心态" },
  { en: "Keep your face always toward the sunshine.", zh: "始终面向阳光。", src: "Walt Whitman 惠特曼", bio: "美国诗人，《草叶集》作者，自由诗先驱" },
  { en: "You don't have to be great to start.", zh: "不必伟大才能开始。", src: "Zig Ziglar", bio: "美国演说家，激励大师" },
  { en: "Turn your wounds into wisdom.", zh: "把伤口化为智慧。", src: "Oprah Winfrey 奥普拉", bio: "美国脱口秀女王，媒体大亨、慈善家" },
  { en: "The only way to do great work is to love what you do.", zh: "成就伟大的唯一途径，是热爱你所做。", src: "Steve Jobs 乔布斯", bio: "苹果公司创始人，创新与极致的代名词" },
  { en: "Courage is grace under pressure.", zh: "勇气，是压力下的从容。", src: "Ernest Hemingway 海明威", bio: "美国作家，《老人与海》作者，诺奖得主" },
  { en: "Rest is not a reward, it's a requirement.", zh: "休息不是奖赏，而是必需。", src: "个人格言", bio: "劳逸结合" },
  { en: "Comparison is the thief of joy.", zh: "比较，是快乐的窃贼。", src: "Theodore Roosevelt 罗斯福", bio: "美国第26任总统，诺贝尔和平奖得主" },
  { en: "Be where your feet are.", zh: "专注当下。", src: "个人格言", bio: "正念当下" },
  { en: "You are the author of your life.", zh: "你是自己人生的作者。", src: "常见引言", bio: "人生自主" },
  { en: "Let it be, and begin again.", zh: "放下，然后重新开始。", src: "个人格言", bio: "重新出发" },
  { en: "Kindness is a quiet kind of strength.", zh: "温柔是一种安静的力量。", src: "常见引言", bio: "温柔有力" },
  { en: "Breathe. You're doing better than you think.", zh: "深呼吸，你比以为的做得好。", src: "个人格言", bio: "自我宽慰" },
];

let quoteShift = 0;
function dailySeed() {
  const d = new Date();
  const start = new Date(d.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((d - start) / 86400000);
  return (dayOfYear + quoteShift) % QUOTES.length;
}
function dailyQuote() { return QUOTES[dailySeed()]; }

/* ---------- 职场处世小技巧词库（离线内置，按天轮换） ---------- */
const WORK_CATS = { people: '为人处世', boss: '与上级相处', team: '与下级相处' };
const WORK_TIPS = [
  // 为人处世
  { cat: 'people', title: '先听后说', tip: '分歧时先理解对方立场，再表达自己，别急着反驳。' },
  { cat: 'people', title: '守时守信', tip: '答应的事按时做，做不到及时说明，信任是靠一次次兑现攒起来的。' },
  { cat: 'people', title: '少抱怨多解决', tip: '遇到问题先想"我能做什么"，而不是先问"这是谁的错"。' },
  { cat: 'people', title: '学会拒绝', tip: '不勉强答应超出能力的事，明确边界反而更受尊重。' },
  { cat: 'people', title: '情绪留在门外', tip: '工作是大家的、情绪是自己的，把私事和坏情绪留在办公室外。' },
  { cat: 'people', title: '及时汇报', tip: '事情有进展或卡住了，主动同步进度，别让人反复追问。' },
  { cat: 'people', title: '换位思考', tip: '批评或提意见前，先想想如果是自己会怎么接受，措辞放委婉。' },
  { cat: 'people', title: '存好人情', tip: '平时多记挂同事，不求回报地搭把手，日后开口更容易。' },
  // 与上级相处
  { cat: 'boss', title: '带着方案汇报', tip: '提问题的同时带上几个解决方案，领导喜欢"做选择题"的人。' },
  { cat: 'boss', title: '定期同步进度', tip: '每周或每个节点主动汇报进展，让领导放心，别等他来问。' },
  { cat: 'boss', title: '分清重点', tip: '先做领导最关心的那件事，方向对了，努力才不白费。' },
  { cat: 'boss', title: '不越级', tip: '有异议先和直接领导沟通，避免绕过上级造成尴尬。' },
  { cat: 'boss', title: '学会展示成果', tip: '事情做成了，大方、恰当地让领导知道你的贡献。' },
  { cat: 'boss', title: '先懂"为什么"', tip: '动手前先弄清楚领导要的意图，能大幅减少返工。' },
  { cat: 'boss', title: '接任务先确认', tip: '把时间、标准、资源一次问清楚，避免中途误解返工。' },
  { cat: 'boss', title: '不做应声虫', tip: '有不同意见，用数据和例子温和表达，专业不等于盲从。' },
  // 与下级相处
  { cat: 'team', title: '把"我"变"我们"', tip: '布置任务多用"我们一起"，少用"你必须"，更易让人接受。' },
  { cat: 'team', title: '给方向也给自由', tip: '说清目标和底线，具体怎么做留给下属去发挥。' },
  { cat: 'team', title: '及时又恰当反馈', tip: '做得好当场肯定，做得不好私下单独谈，别当众批评。' },
  { cat: 'team', title: '多问"需要什么支持"', tip: '比起一味催促，一句"需要什么帮助"更能解决卡点。' },
  { cat: 'team', title: '对外扛责', tip: '团队出错时对外揽责，对内找方法，不向下甩锅。' },
  { cat: 'team', title: '说话算话', tip: '答应下属的加薪、假期、支持要兑现，失信一次就难有威信。' },
  { cat: 'team', title: '授人以渔', tip: '教方法比直接给答案更重要，让他下次自己能搞定。' },
  { cat: 'team', title: '一碗水端平', tip: '分任务、评绩效时公平透明，避免偏袒引发不满。' },
];
let workTipShift = 0;
function workTipSeed() {
  const d = new Date();
  const start = new Date(d.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((d - start) / 86400000);
  return (dayOfYear + workTipShift) % WORK_TIPS.length;
}
function dailyWorkTip() { return WORK_TIPS[workTipSeed()]; }

function tickClock() {
  const el = $('#clock');
  if (!el) return;
  const d = new Date();
  const w = '日一二三四五六'[d.getDay()];
  const pad = n => String(n).padStart(2, '0');
  el.textContent = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 周${w} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/* ---------- 首页 ---------- */
// 职场处世技巧卡片：按天一条 + 换一条 + 可展开全部
function workTipCard() {
  const cur = dailyWorkTip();
  const catLabel = WORK_CATS[cur.cat] || '';
  const catCls = { people: 'wt-people', boss: 'wt-boss', team: 'wt-team' }[cur.cat] || '';
  // 全部列表（用于展开）
  const allList = WORK_CATS && Object.keys(WORK_CATS).map(k => `
    <div class="wt-group">
      <div class="wt-group-title">${WORK_CATS[k]}</div>
      ${WORK_TIPS.filter(t => t.cat === k).map(t => `
        <div class="wt-item">
          <span class="wt-item-title">${escapeHtml(t.title)}</span>
          <span class="wt-item-tip">${escapeHtml(t.tip)}</span>
        </div>`).join('')}
    </div>`).join('');
  return `
  <div class="card wt-card">
    <div class="card-title">
      <span class="dot" style="background:var(--yellow)"></span>职场处世小技巧
      <span class="right">
        <button class="btn ghost" data-act="next-tip" style="padding:6px 12px;font-size:12px">换一条 ↻</button>
        <button class="btn ghost" data-act="toggle-worklist" data-on="0" style="padding:6px 12px;font-size:12px">展开全部</button>
      </span>
    </div>
    <div class="wt-daily">
      <span class="wt-cat ${catCls}">${catLabel}</span>
      <div class="wt-daily-title">${escapeHtml(cur.title)}</div>
      <div class="wt-daily-tip">${escapeHtml(cur.tip)}</div>
    </div>
    <div class="wt-all" id="work-all" style="display:none">
      ${allList}
    </div>
  </div>`;
}

function viewHome() {
  const q = dailyQuote();
  const greet = (() => {
    const h = new Date().getHours();
    if (h < 6) return '夜深了';
    if (h < 11) return '早上好';
    if (h < 14) return '中午好';
    if (h < 18) return '下午好';
    if (h < 22) return '晚上好';
    return '夜深了';
  })();

  const hero = `
  <div class="hero">
    <div class="hero-top">
      <div>
        <div class="greet">${greet}，Jasmine 👋</div>
        <div class="clock" id="clock"></div>
      </div>
      <button class="btn ghost" data-act="next-quote" style="align-self:flex-start">换一句 ↻</button>
    </div>
    <blockquote class="quote">
      “${escapeHtml(q.en)}”
      <div class="q-zh">${escapeHtml(q.zh)}</div>
      ${q.src ? `<div class="q-src">— ${escapeHtml(q.src)}${q.bio ? `<span class="q-bio"> · ${escapeHtml(q.bio)}</span>` : ''}</div>` : ''}
    </blockquote>
  </div>`;

  // 今日概览
  const t = todayStr();
  const todayTasks = secTasks('today');
  const incTasks = secTasks('incomplete');
  const pendTasks = secTasks('pending');

  const miniTasks = [...todayTasks, ...incTasks].slice(0, 5)
    .map(x => `<div class="mini-item"><span class="mk" style="background:var(--blue-400)"></span>${escapeHtml(x.text)}</div>`).join('')
    || '<div class="empty">今天还没有计划，去「每日计划」添加吧～</div>';

  const visits = visitsToday();
  const miniVisits = visits.length
    ? visits.slice(0, 4).map(x => `<div class="mini-item"><span class="mk" style="background:var(--yellow)"></span>🏰 ${escapeHtml(x.name)} · ${escapeHtml(x.visitTime || '—')}来访</div>`).join('')
    : '<div class="empty">今天没有大学来访</div>';

  // 班级总览
  const allC = STATE.students.flatMap(s => s.countries.flatMap(c => c.schools || []));
  const avg = allC.length ? Math.round(allC.reduce((a, c) => a + (c.progress || 0), 0) / allC.length) : 0;
  const doneC = allC.filter(c => (c.progress || 0) >= 100).length;

  return `
  ${hero}
  ${workTipCard()}
  <div class="card">
    <div class="card-title"><span class="dot"></span>${APP_NAME} · 月历</div>
    ${viewCalendar()}
  </div>

  <div class="home-modules">
    <div class="card">
      <div class="card-title"><span class="dot"></span>今日任务完成情况
        <span class="right"><button class="btn ghost" data-act="nav" data-route="completion" style="padding:6px 12px;font-size:12px">查看看板</button></span>
      </div>
      ${miniTasks}
      <div style="margin-top:10px" class="stat-row">
        <div class="stat red"><div class="n">${todayTasks.length + incTasks.length}</div><div class="t">未完成</div></div>
        <div class="stat green"><div class="n">${secTasks('done').filter(x=>x.date===t).length}</div><div class="t">已完成</div></div>
        <div class="stat blue"><div class="n">${pendTasks.length}</div><div class="t">待完成</div></div>
      </div>
    </div>

    <div class="card">
      <div class="card-title"><span class="dot" style="background:var(--yellow)"></span>今日大学来访
        <span class="right"><button class="btn ghost" data-act="nav" data-route="visits" style="padding:6px 12px;font-size:12px">全部</button></span>
      </div>
      ${miniVisits}
    </div>

    <div class="card" style="grid-column:1/-1">
      <div class="card-title"><span class="dot" style="background:var(--blue-500)"></span>学生申请进度 · 班级总览
        <span class="right"><button class="btn ghost" data-act="nav" data-route="students" style="padding:6px 12px;font-size:12px">详情</button></span>
      </div>
      <div class="overview-grid">
        <div class="ov"><div class="n">${STATE.students.length}</div><div class="t">学生人数</div></div>
        <div class="ov"><div class="n">${allC.length}</div><div class="t">申请院校数</div></div>
        <div class="ov"><div class="n">${avg}%</div><div class="t">平均完成度</div></div>
        <div class="ov"><div class="n">${doneC}</div><div class="t">已100%完成</div></div>
      </div>
    </div>
  </div>`;
}

/* ---------- 每日计划 ---------- */
function taskRow(x, sec) {
  const urg = `<span class="urg-badge ${URG_CLS[x.urgent]}" data-act="cycle-urg" data-id="${x.id}" title="点击切换紧急程度">${URG[x.urgent]}</span>`;
  return `<div class="task ${x.done ? 'done' : ''}">
    <div class="box ${x.done ? 'done' : ''}" data-act="toggle-task" data-id="${x.id}">${x.done ? '✓' : ''}</div>
    <div class="txt">${escapeHtml(x.text)}</div>
    <div class="meta">
      ${urg}
      <button class="mini-btn" data-act="move-task" data-id="${x.id}" data-sec="${sec}" data-dir="up" title="上移">↑</button>
      <button class="mini-btn" data-act="move-task" data-id="${x.id}" data-sec="${sec}" data-dir="down" title="下移">↓</button>
      <button class="mini-btn" data-act="edit-task" data-id="${x.id}" title="编辑">✎</button>
      <button class="mini-btn" data-act="del-task" data-id="${x.id}" title="删除">✕</button>
    </div>
  </div>`;
}
function sectionBlock(title, sec, items) {
  const rows = items.length ? items.map(x => taskRow(x, sec)).join('')
    : `<div class="empty">暂无</div>`;
  return `<div class="section-label">${title}<span class="count">${items.length}</span></div>${rows}`;
}
function viewDaily() {
  const today = secTasks('today').sort((a, b) => (a.order || 0) - (b.order || 0));
  const done = secTasks('done').sort((a, b) => (b.order || 0) - (a.order || 0));
  const pend = secTasks('pending').sort((a, b) => (a.order || 0) - (b.order || 0));
  const inc = secTasks('incomplete').sort((a, b) => (a.order || 0) - (b.order || 0));
  return `
  <div class="card">
    <div class="card-title"><span class="dot"></span>每日计划 · ${fmtMD(todayStr())}（周${weekdayCn(todayStr())}）</div>
    ${sectionBlock('今日任务', 'today', today)}
    ${sectionBlock('待完成', 'pending', pend)}
    ${sectionBlock('未完成（逾期未勾选，已自动顺延）', 'incomplete', inc)}
    ${sectionBlock('已完成', 'done', done)}
    <div class="add-row">
      <input class="input" id="new-task" placeholder="添加一条今日计划…" maxlength="120" />
      <button class="btn" data-act="add-task">添加计划</button>
    </div>
  </div>`;
}

/* ---------- 今日任务完成情况（看板） ---------- */
function viewCompletion() {
  const t = todayStr();
  const todays = STATE.tasks.filter(x => x.date === t);
  const total = todays.length;
  const doneN = todays.filter(x => x.done).length;
  const notDone = todays.filter(x => !x.done);
  const pctNot = total ? Math.round(notDone.length / total * 100) : 0;
  const ringColor = pctNot >= 50 ? 'var(--red)' : pctNot >= 20 ? 'var(--yellow)' : 'var(--green)';
  const C = 2 * Math.PI * 80;
  const off = C * (1 - pctNot / 100);
  const list = notDone.length
    ? notDone.map(x => `<div class="mini-item"><span class="mk" style="background:var(--red)"></span>${escapeHtml(x.text)}
        <span class="urg-badge ${URG_CLS[x.urgent]}" style="margin-left:auto">${URG[x.urgent]}</span></div>`).join('')
    : '<div class="empty">🎉 今天所有任务都完成了！</div>';

  return `
  <div class="card">
    <div class="card-title"><span class="dot"></span>今日任务完成情况看板</div>
    <div class="board">
      <div class="ring-wrap">
        <div class="ring">
          <svg width="180" height="180">
            <circle cx="90" cy="90" r="80" fill="none" stroke="var(--blue-100)" stroke-width="16"/>
            <circle cx="90" cy="90" r="80" fill="none" stroke="${ringColor}" stroke-width="16"
              stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${off}"/>
          </svg>
          <div class="center">
            <div class="pct">${pctNot}%</div>
            <div class="lbl">未完成占比</div>
          </div>
        </div>
      </div>
      <div>
        <div class="stat-row">
          <div class="stat blue"><div class="n">${total}</div><div class="t">今日任务总数</div></div>
          <div class="stat green"><div class="n">${doneN}</div><div class="t">已完成</div></div>
          <div class="stat red"><div class="n">${notDone.length}</div><div class="t">未完成</div></div>
        </div>
        <div class="section-label">未完成的任务（${notDone.length}）</div>
        ${list}
      </div>
    </div>
  </div>`;
}

/* ---------- 大学来访 · 各校招生官 ---------- */
// 搜索关键词 & 国家折叠状态
let visitQuery = '';
const collapsedVisits = {}; // countryId -> true(折叠)

function visitSchoolRow(s, g) {
  return `<div class="visit-school ${s.visiting ? 'visiting' : ''}">
    <div class="visit-main">
      <div class="visit-name">🏫 ${escapeHtml(s.name)}</div>
      <div class="visit-sub">
        ${s.officer ? `<span class="v-item">招生官：${escapeHtml(s.officer)}</span>` : ''}
        ${s.wechat ? `<span class="v-item">微信：${escapeHtml(s.wechat)}</span>` : ''}
        ${s.email ? `<span class="v-item">邮箱：${escapeHtml(s.email)}</span>` : ''}
        ${s.visiting ? `<span class="v-item visit-date-badge">📅 ${escapeHtml(s.visitDate || '日期未填')}${s.visitTime ? ' ' + escapeHtml(s.visitTime) : ''}</span>` : ''}
      </div>
    </div>
    <div class="visit-ops">
      <label class="visit-toggle ${s.visiting ? 'on' : ''}" title="本学期是否有来访">
        <input type="checkbox" data-act="toggle-visit" data-cid="${g.id}" data-sid="${s.id}" ${s.visiting ? 'checked' : ''}/>
        本学期来访
      </label>
      ${s.visiting ? `
      <div class="visit-dt">
        <input class="input" type="date" value="${escapeHtml(s.visitDate || '')}" data-act="set-visit-date" data-cid="${g.id}" data-sid="${s.id}" title="来访日期"/>
        <input class="input" type="time" value="${escapeHtml(s.visitTime || '')}" data-act="set-visit-time" data-cid="${g.id}" data-sid="${s.id}" title="来访时间"/>
      </div>` : ''}
      <button class="mini-btn" data-act="del-visit" data-cid="${g.id}" data-sid="${s.id}" title="删除该院校">✕</button>
    </div>
  </div>`;
}

function viewVisits() {
  const groups = STATE.visits || [];
  const total = allVisitSchools().length;
  const visiting = allVisitSchools().filter(s => s.visiting).length;
  const q = (visitQuery || '').trim().toLowerCase();

  // 手动添加表单（可展开/收起）
  const manualForm = `
  <div class="visit-manual" id="visit-manual" style="display:none">
    <div class="visit-manual-title">✏️ 手动添加来访大学</div>
    <div class="visit-manual-grid">
      <input class="input" id="vm-name" placeholder="大学名称 *" maxlength="60"/>
      <input class="input" id="vm-country" placeholder="国家/地区" maxlength="20"/>
      <input class="input" id="vm-officer" placeholder="招生老师姓名" maxlength="30"/>
      <input class="input" id="vm-contact" placeholder="联系方式（微信/邮箱/电话）" maxlength="60"/>
      <input class="input" id="vm-date" type="date"/>
      <input class="input" id="vm-time" type="time"/>
    </div>
    <div class="visit-manual-actions">
      <button class="btn pink" data-act="add-visit-manual">添加</button>
      <button class="btn ghost" data-act="toggle-manual-form">取消</button>
    </div>
  </div>`;

  // 根据搜索关键词过滤院校
  const filterSchools = (schools) => {
    if (!q) return schools;
    return (schools || []).filter(s => {
      return [s.name, s.officer, s.wechat, s.email].some(v =>
        (v || '').toLowerCase().includes(q)
      );
    });
  };

  const countryHtml = groups.map(g => {
    const allSch = g.schools || [];
    const sch = filterSchools(allSch);
    // 搜索时忽略折叠状态；无匹配则隐藏该国家
    if (q && sch.length === 0) return '';
    const collapsed = collapsedVisits[g.id] && !q;
    const schoolsHtml = sch.map(s => visitSchoolRow(s, g)).join('');
    return `
    <div class="visit-group">
      <div class="visit-group-head">
        <button class="visit-collapse" data-act="toggle-visit-group" data-cid="${g.id}" title="收起/展开">${collapsed ? '▸' : '▾'}</button>
        <span class="visit-country">🌍 ${escapeHtml(g.country)}</span>
        <span class="visit-count">${allSch.length} 所</span>
        ${q ? `<span class="visit-match">匹配 ${sch.length}</span>` : ''}
      </div>
      <div class="visit-group-body" ${collapsed ? 'style="display:none"' : ''}>
        ${schoolsHtml || '<div class="empty">该国暂无院校</div>'}
        <div class="add-row" style="margin-top:8px">
          <input class="input" placeholder="添加院校名称…" data-visit-school-input="${g.id}" maxlength="60" style="font-size:13px"/>
          <button class="btn ghost" data-act="add-visit" data-cid="${g.id}">＋院校</button>
        </div>
      </div>
    </div>`;
  }).join('');

  return `
  <div class="card">
    <div class="card-title"><span class="dot" style="background:var(--pink-400)"></span>大学来访 · 各校招生官</div>
    <p class="hint">共 ${total} 所院校、${visiting} 所本学期来访。勾选「本学期来访」并填写来访日期与时间后，会自动标记在首页月历上。</p>
    <div class="visit-toolbar">
      <div class="visit-search">
        <span class="visit-search-ico">🔍</span>
        <input class="input" id="visit-search" placeholder="搜索大学名称 / 招生官 / 关键词…" value="${escapeHtml(visitQuery)}" maxlength="60"/>
        ${q ? `<button class="mini-btn" data-act="clear-visit-search" title="清除">✕</button>` : ''}
      </div>
      <button class="btn ghost" data-act="toggle-manual-form">＋手动添加大学</button>
      <button class="btn ghost" data-act="import-visits">📥 从Excel导入</button>
      <button class="btn ghost" data-act="add-visit-country">＋国家分类</button>
    </div>
    ${manualForm}
    ${groups.length ? countryHtml : '<div class="empty">还没有导入院校，点击上方按钮从 Excel 导入全部院校。</div>'}
  </div>`;
}

/* ---------- 学生申请进度查询 ---------- */
function studentCard(s) {
  const allSchools = s.countries.flatMap(c => c.schools || []);
  const sprog = allSchools.length ? Math.round(allSchools.reduce((a, c) => a + (c.progress || 0), 0) / allSchools.length) : 0;
  const preset = ['美国', '英国', '澳洲', '加拿大', '新加坡', '中国香港', '德国', '日本'];
  const chips = preset.map(p => {
    const on = s.countries.some(c => c.country === p);
    return `<span class="chip ${on ? 'chip-on' : 'chip-off'}" data-act="toggle-country" data-sid="${s.id}" data-country="${escapeHtml(p)}">${escapeHtml(p)}</span>`;
  }).join('');

  const countries = s.countries.length ? s.countries.map(c => {
    const schoolsHtml = (c.schools && c.schools.length)
      ? c.schools.map(sc => `
        <div class="school ${sc.progress >= 100 ? 'school-done' : ''}">
          <div class="crow">
            <span class="cname">🏫 ${escapeHtml(sc.name)}</span>
            ${sc.progress >= 100 ? '<span class="done-badge">🎉 已递交</span>' : ''}
            <span class="cstart">截止</span>
            <input class="input deadline-input" type="date" value="${escapeHtml(sc.deadline || '')}"
              data-act="set-deadline" data-sid="${s.id}" data-cid="${c.id}" data-schid="${sc.id}" title="申请截止时间"/>
            <button class="mini-btn" data-act="del-school" data-sid="${s.id}" data-cid="${c.id}" data-schid="${sc.id}" title="删除学校">✕</button>
          </div>
          <div class="bar"><i style="width:${sc.progress || 0}%"></i></div>
          <div class="crow" style="gap:8px;align-items:center">
            <span style="font-size:12px;color:var(--ink-soft);font-weight:700">进度</span>
            <input class="input" type="range" min="0" max="100" value="${sc.progress || 0}"
              data-act="set-progress" data-sid="${s.id}" data-cid="${c.id}" data-schid="${sc.id}" style="flex:1;padding:0"/>
            <b style="color:var(--blue-600);min-width:42px;text-align:right">${sc.progress || 0}%</b>
          </div>
          <div class="materials">
            ${(sc.materials || []).map(m => `<span class="mat ${STATUS_CLS[m.status || 'todo']}">
              <span class="m-name">${escapeHtml(m.name)}</span>
              <select class="mat-sel" data-act="set-mat-status" data-sid="${s.id}" data-cid="${c.id}" data-schid="${sc.id}" data-mid="${m.id}">
                <option value="todo" ${m.status === 'todo' ? 'selected' : ''}>还没开始</option>
                <option value="doing" ${m.status === 'doing' ? 'selected' : ''}>正在准备</option>
                <option value="done" ${m.status === 'done' ? 'selected' : ''}>完成</option>
              </select>
              <button class="mini-btn" data-act="del-material" data-sid="${s.id}" data-cid="${c.id}" data-schid="${sc.id}" data-mid="${m.id}" title="删除材料">✕</button>
            </span>`).join('')}
            <button class="mini-btn" data-act="add-material" data-sid="${s.id}" data-cid="${c.id}" data-schid="${sc.id}" title="添加材料">＋材料</button>
          </div>
        </div>`).join('')
      : '<div class="empty" style="padding:6px">该国暂未添加学校</div>';

    return `<div class="country">
      <div class="crow">
        <span class="cname">🌍 ${escapeHtml(c.country)}</span>
        <span class="cstart">申请开始：${escapeHtml(c.startDate)}</span>
        <button class="mini-btn" data-act="del-country" data-sid="${s.id}" data-cid="${c.id}" title="移除该国">✕</button>
      </div>
      ${schoolsHtml}
      <div class="add-row" style="margin-top:8px">
        <input class="input" placeholder="添加学校名称…" data-school-input="${c.id}" style="font-size:13px"/>
        <button class="btn ghost" data-act="add-school" data-sid="${s.id}" data-cid="${c.id}">添加学校</button>
      </div>
    </div>`;
  }).join('') : '<div class="empty" style="padding:6px">尚未选择申请国家（下方勾选）</div>';

  return `<div class="student">
    <div class="head">
      <div class="avatar">${escapeHtml(s.name.slice(0, 1))}</div>
      <div class="sname">${escapeHtml(s.name)}</div>
      <div class="sprog">平均 ${sprog}%</div>
    </div>
    <div class="section-label" style="margin-top:4px">申请国家（点击勾选）</div>
    <div class="chips">${chips}</div>
    <div class="add-row" style="margin-top:8px">
      <input class="input" id="custom-country-${s.id}" placeholder="自定义国家…" maxlength="20" style="font-size:13px"/>
      <button class="btn" data-act="add-country" data-sid="${s.id}">添加</button>
    </div>
    ${countries}
  </div>`;
}
function viewStudents() {
  const cards = STATE.students.map(studentCard).join('');
  const allSchools = STATE.students.flatMap(s => s.countries.flatMap(c => c.schools || []));
  const avg = allSchools.length ? Math.round(allSchools.reduce((a, c) => a + (c.progress || 0), 0) / allSchools.length) : 0;
  const doneC = allSchools.filter(c => (c.progress || 0) >= 100).length;
  const pendingC = allSchools.filter(c => (c.progress || 0) < 100).length;
  return `
  <div class="card">
    <div class="card-title"><span class="dot" style="background:var(--blue-500)"></span>班级申请进度总览</div>
    <div class="overview-grid">
      <div class="ov"><div class="n">${STATE.students.length}</div><div class="t">学生人数</div></div>
      <div class="ov"><div class="n">${allSchools.length}</div><div class="t">申请院校数</div></div>
      <div class="ov"><div class="n">${avg}%</div><div class="t">平均完成度</div></div>
      <div class="ov"><div class="n">${doneC}</div><div class="t">已100%完成</div></div>
      <div class="ov"><div class="n">${pendingC}</div><div class="t">进行中</div></div>
    </div>
  </div>
  <div class="card">
    <div class="card-title"><span class="dot"></span>学生申请进度（${STATE.students.length}人）</div>
    ${cards}
    <div class="add-row">
      <input class="input" id="new-student" placeholder="添加学生姓名…" maxlength="20"/>
      <button class="btn" data-act="add-student">添加学生</button>
    </div>
  </div>`;
}

/* ---------- 重点院校申请截止时间 ---------- */
function viewDeadlines() {
  const list = [...(STATE.deadlines || [])];
  list.sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999'));
  const today = todayStr();
  const rows = list.length ? list.map(d => {
    const overdue = d.deadline && d.deadline < today;
    const soon = !overdue && d.deadline && daysBetween(today, d.deadline) <= 14;
    let tag = '';
    if (d.deadline) {
      const left = daysBetween(today, d.deadline);
      tag = overdue
        ? `<span class="dl-tag od">已逾期 ${Math.abs(left)} 天</span>`
        : soon
          ? `<span class="dl-tag soon">剩 ${left} 天</span>`
          : `<span class="dl-tag">剩 ${left} 天</span>`;
    } else {
      tag = '<span class="dl-tag">未设日期</span>';
    }
    return `<div class="dl-row ${overdue ? 'od' : ''}">
      <div class="dl-main">
        <div class="dl-name">🏫 ${escapeHtml(d.name)}</div>
        <div class="dl-date">截止：${escapeHtml(d.deadline || '未设')}</div>
        ${d.note ? `<div class="dl-note">${escapeHtml(d.note)}</div>` : ''}
      </div>
      <div class="dl-side">
        ${tag}
        <button class="mini-btn" data-act="del-deadline" data-id="${d.id}" title="删除">✕</button>
      </div>
    </div>`;
  }).join('') : '<div class="empty">还没有添加院校截止时间</div>';
  return `
  <div class="card">
    <div class="card-title"><span class="dot" style="background:var(--pink-400)"></span>重点院校申请截止时间</div>
    <p class="hint">填写各海外大学的申请递交截止时间，系统会按时间排序，并标注临近（橙）与逾期（红）。</p>
    ${rows}
    <div class="add-row" style="margin-top:14px">
      <input class="input" id="dl-name" placeholder="院校名称，如：UCL / 多伦多大学" maxlength="40"/>
      <input class="input" id="dl-date" type="date" style="max-width:170px"/>
      <input class="input" id="dl-note" placeholder="备注（可选）" maxlength="60"/>
      <button class="btn pink" data-act="add-deadline">添加</button>
    </div>
  </div>`;
}

/* ---------- 社团工作 ---------- */
const ATT_CLS = { normal: '正常出勤', late: '迟到', absent: '缺勤' };
function clubCard(cl) {
  const weeks = cl.weeks || [];
  const members = cl.members || [];
  // 基础信息字段（可编辑，自动保存）
  const fields = [
    { key: 'name', label: '社团名称', ph: '如：模联社' },
    { key: 'president', label: '社长', ph: '社长姓名' },
    { key: 'teacher', label: '指导老师', ph: '老师姓名' },
    { key: 'room', label: '活动教室', ph: '如：A301' },
    { key: 'count', label: '社团人数', ph: '人数' },
  ].map(f => `
    <div class="club-field">
      <span class="club-field-label">${f.label}</span>
      <input class="input club-input" data-club-field="${f.key}" data-cid="${cl.id}" value="${escapeHtml(cl[f.key] || '')}" placeholder="${f.ph}"/>
    </div>`).join('');

  // 周次表头
  const weekHeaders = weeks.length
    ? weeks.map(w => `<th class="club-week-hd">${escapeHtml(w.label)}</th>`).join('')
    : '';
  // 周次表现备注行：每周一列一个可编辑文本框
  const weekNotes = weeks.length
    ? `<tr class="club-week-note-row">
        <td class="club-note-label">表现备注</td>
        ${weeks.map(w => `<td><textarea class="club-week-note" rows="2" placeholder="记录本周表现（好的/需改进）…" data-week-note="${cl.id}" data-wid="${w.id}" maxlength="200">${escapeHtml(w.note || '')}</textarea></td>`).join('')}
      </tr>`
    : '';

  // 社员行
  const rows = members.length
    ? members.map(m => {
        const cells = weeks.length
          ? weeks.map(w => {
              // 未标记的默认视为「正常出勤」
              const v = (m.attend && m.attend[w.id]) || 'normal';
              return `<td><select class="att-sel ${v}" data-act="set-att" data-cid="${cl.id}" data-mid="${m.id}" data-wid="${w.id}">
                <option value="" ${v === '' ? 'selected' : ''}>—</option>
                <option value="normal" ${v === 'normal' ? 'selected' : ''}>正常出勤</option>
                <option value="late" ${v === 'late' ? 'selected' : ''}>迟到</option>
                <option value="absent" ${v === 'absent' ? 'selected' : ''}>缺勤</option>
              </select></td>`;
            }).join('')
          : `<td class="club-hint">暂无周次</td>`;
        return `<tr class="club-member">
          <td class="club-mname">${escapeHtml(m.name)} <button class="mini-btn" data-act="del-member" data-cid="${cl.id}" data-mid="${m.id}" title="移除社员">✕</button></td>
          ${cells}
        </tr>`;
      }).join('')
    : `<tr><td class="club-hint" colspan="${weeks.length + 1 || 2}">还没有添加社员</td></tr>`;

  return `<div class="club-card">
    <div class="club-head">
      <span class="club-name">🎪 ${escapeHtml(cl.name || '未命名社团')}</span>
      <span class="club-meta">${members.length} 名社员 · ${weeks.length} 周记录</span>
      <button class="mini-btn" data-act="del-club" data-cid="${cl.id}" title="删除社团">✕</button>
    </div>
    <div class="club-fields">${fields}</div>
    <div class="club-toolbar">
      <div class="club-add-member">
        <input class="input" placeholder="添加社员姓名…" data-member-input="${cl.id}" maxlength="20"/>
        <button class="btn ghost" data-act="add-member" data-cid="${cl.id}">＋社员</button>
      </div>
      <div class="club-add-week">
        <input class="input" placeholder="如：第3周 / 3.15" data-week-input="${cl.id}" maxlength="20"/>
        <button class="btn ghost" data-act="add-week" data-cid="${cl.id}">＋周次</button>
      </div>
    </div>
    <table class="club-table">
      <thead><tr>
        <th class="club-th-name">社员</th>
        ${weekHeaders}
      </tr></thead>
      <tbody>${rows}${weekNotes}</tbody>
    </table>
  </div>`;
}
// 社团出勤总结看板：统计每个社员正常/缺勤/迟到次数
function attendanceBoard(clubs) {
  if (!clubs.length) return '';
  const sections = clubs.map(cl => {
    const weeks = cl.weeks || [];
    const members = cl.members || [];
    if (!weeks.length || !members.length) return '';
    const total = weeks.length;
    const rows = members.map(m => {
      const attend = m.attend || {};
      let normal = 0, absent = 0, late = 0;
      weeks.forEach(w => {
        const s = attend[w.id] || 'normal';
        if (s === 'normal') normal++;
        else if (s === 'absent') absent++;
        else if (s === 'late') late++;
      });
      const rate = total ? Math.round(normal / total * 100) : 0;
      return `<tr>
        <td class="ab-mname">${escapeHtml(m.name)}</td>
        <td class="ab-n">${normal}</td>
        <td class="ab-absent">${absent}</td>
        <td class="ab-late">${late}</td>
        <td><div class="ab-rate"><i style="width:${rate}%"></i><span>${rate}%</span></div></td>
      </tr>`;
    }).join('');
    return `<div class="ab-club">
      <div class="ab-club-title">🎪 ${escapeHtml(cl.name || '未命名社团')}</div>
      <table class="club-table ab-table">
        <thead><tr>
          <th class="club-th-name">社员</th>
          <th class="ab-hd">正常出勤</th>
          <th class="ab-hd absent">缺勤</th>
          <th class="ab-hd late">迟到</th>
          <th class="ab-hd">出勤率</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }).filter(Boolean).join('');
  return `
  <div class="card" id="attendance-board">
    <div class="card-title"><span class="dot" style="background:var(--green)"></span>本学期社团出勤总结看板</div>
    ${sections || '<div class="empty">还没有可统计的出勤记录（需先添加周次和社员）。</div>'}
  </div>`;
}
function clubDeptData() {
  if (!STATE.clubDept) STATE.clubDept = { president: '', members: [] };
  if (!Array.isArray(STATE.clubDept.members)) STATE.clubDept.members = [];
  return STATE.clubDept;
}
function viewClub() {
  const clubs = STATE.clubs || [];
  const dept = clubDeptData();
  const deptMembers = dept.members || [];
  const deptMemberChips = deptMembers.length
    ? deptMembers.map((m, i) => `<span class="act-member-chip">👤 ${escapeHtml(m.name)} <button class="x" data-act="del-dept-member" data-i="${i}" title="移除干事">✕</button></span>`).join('')
    : '<span class="empty" style="padding:4px">还没有干事，添加社团部干事姓名。</span>';
  const cards = clubs.length ? clubs.map(clubCard).join('') : '<div class="empty">还没有社团。<br/>先添加一个社团，然后管理社员和每周出勤。</div>';
  return `
  <div class="card">
    <div class="card-title"><span class="dot" style="background:var(--blue-500)"></span>社团工作 · 总览</div>
    <div class="overview-grid">
      <div class="ov"><div class="n">${clubs.length}</div><div class="t">社团数</div></div>
      <div class="ov"><div class="n">${clubs.reduce((a, c) => a + (c.members || []).length, 0)}</div><div class="t">社员总数</div></div>
      <div class="ov"><div class="n">${clubs.reduce((a, c) => a + (c.weeks || []).length, 0)}</div><div class="t">出勤周次记录</div></div>
    </div>
  </div>
  <div class="card">
    <div class="card-title"><span class="dot" style="background:var(--green)"></span>社团部 · 部长与干事</div>
    <div class="act-field-row">
      <span class="act-field-label">部长</span>
      <input class="input" id="dept-president" placeholder="社团部部长姓名" maxlength="20" value="${escapeHtml(dept.president || '')}"/>
    </div>
    <div class="act-members">
      <span class="act-field-label">干事</span>
      <div class="act-member-list">${deptMemberChips}</div>
    </div>
    <div class="add-row" style="margin-top:12px">
      <input class="input" id="dept-officer" placeholder="输入社团部干事姓名，回车或点击添加" maxlength="20"/>
      <button class="btn ghost" data-act="add-dept-member">＋干事</button>
    </div>
    <p class="hint">部长姓名修改后自动保存，干事姓名可随时添加或移除。</p>
  </div>
  ${attendanceBoard(clubs)}
  <div class="card">
    <div class="card-title"><span class="dot" style="background:var(--pink-400)"></span>我的社团（${clubs.length} 个）</div>
    ${cards}
    <div class="add-row" style="margin-top:16px">
      <input class="input" id="club-name" placeholder="社团名称" maxlength="30"/>
      <input class="input" id="club-president" placeholder="社长姓名" maxlength="20"/>
      <input class="input" id="club-teacher" placeholder="指导老师" maxlength="20"/>
      <input class="input" id="club-room" placeholder="活动教室" maxlength="20"/>
      <input class="input" id="club-count" placeholder="人数" maxlength="10" style="max-width:90px"/>
      <button class="btn pink" data-act="add-club">添加社团</button>
    </div>
  </div>`;
}

/* ---------- 学理会活动部 ---------- */
function activityData() {
  if (!STATE.activity) STATE.activity = { president: '', members: [], activities: [] };
  if (!Array.isArray(STATE.activity.members)) STATE.activity.members = [];
  if (!Array.isArray(STATE.activity.activities)) STATE.activity.activities = [];
  return STATE.activity;
}
function viewActivity() {
  const act = activityData();
  const members = act.members || [];
  const activities = act.activities || [];
  const memberChips = members.length
    ? members.map((m, i) => `<span class="act-member-chip">👤 ${escapeHtml(m.name)} <button class="x" data-act="del-officer" data-i="${i}" title="移除干事">✕</button></span>`).join('')
    : '<span class="empty" style="padding:4px">还没有干事，添加干事姓名。</span>';

  const activityCards = activities.length
    ? activities.map((a, i) => {
        // 编辑态：显示可编辑表单
        if (editingActivity === a.id) {
          return `<div class="act-card">
            <div class="act-card-edit">
              <input class="input" id="edit-act-title" placeholder="活动标题" maxlength="40" value="${escapeHtml(a.title)}"/>
              <input class="input" id="edit-act-date" type="date" style="max-width:170px" value="${escapeHtml(a.date || '')}"/>
              <textarea class="textarea" id="edit-act-detail" rows="4" placeholder="活动详细记录…" maxlength="1000">${escapeHtml(a.detail || '')}</textarea>
              <div class="act-card-actions">
                <button class="btn" data-act="save-activity" data-aid="${a.id}">💾 保存</button>
                <button class="btn ghost" data-act="cancel-activity">取消</button>
              </div>
            </div>
          </div>`;
        }
        return `<div class="act-card">
          <div class="act-card-top">
            <span class="act-card-title">${escapeHtml(a.title)}</span>
            ${a.date ? `<span class="act-card-date">📅 ${escapeHtml(a.date)}</span>` : ''}
            <button class="mini-btn" data-act="edit-activity" data-aid="${a.id}" title="编辑活动">✏️</button>
            <button class="mini-btn" data-act="del-activity" data-i="${i}" title="删除活动">✕</button>
          </div>
          ${a.detail ? `<div class="act-card-detail">${escapeHtml(a.detail)}</div>` : '<div class="act-card-detail empty" style="padding:2px">无详细记录</div>'}
        </div>`;
      }).join('')
    : '<div class="empty">还没有活动记录。<br/>添加一次活动，记录标题、日期和详细内容。</div>';

  return `
  <div class="card">
    <div class="card-title"><span class="dot" style="background:var(--blue-500)"></span>学理会活动部 · 总览</div>
    <div class="overview-grid">
      <div class="ov"><div class="n">${act.president || '—'}</div><div class="t">部长</div></div>
      <div class="ov"><div class="n">${members.length}</div><div class="t">干事数</div></div>
      <div class="ov"><div class="n">${activities.length}</div><div class="t">活动记录</div></div>
    </div>
  </div>

  <div class="card">
    <div class="card-title"><span class="dot" style="background:var(--pink-400)"></span>部长与干事</div>
    <div class="act-field-row">
      <span class="act-field-label">部长</span>
      <input class="input" id="act-president" placeholder="部长姓名" maxlength="20" value="${escapeHtml(act.president || '')}"/>
    </div>
    <div class="act-members">
      <span class="act-field-label">干事</span>
      <div class="act-member-list">${memberChips}</div>
    </div>
    <div class="add-row" style="margin-top:12px">
      <input class="input" id="act-officer" placeholder="输入干事姓名，回车或点击添加" maxlength="20"/>
      <button class="btn pink" data-act="add-officer">＋干事</button>
    </div>
    <p class="hint">输入一次干事姓名即可保存，可随时移除。部长姓名修改后自动保存。</p>
  </div>

  <div class="card">
    <div class="card-title"><span class="dot" style="background:var(--blue-500)"></span>活动记录（${activities.length} 次）</div>
    ${activityCards}
    <div class="act-add" style="margin-top:16px">
      <div class="add-row">
        <input class="input" id="act-title" placeholder="活动标题，如：迎新晚会 / 校运会" maxlength="40"/>
        <input class="input" id="act-date" type="date" style="max-width:170px"/>
        <button class="btn" data-act="add-activity">＋添加活动</button>
      </div>
      <textarea class="textarea" id="act-detail" rows="3" placeholder="活动详细记录（可选）：时间、地点、参与情况、分工、结果与总结…" maxlength="1000"></textarea>
    </div>
  </div>`;
}

/* ---------- 班级 ---------- */
function classesData() {
  if (!Array.isArray(STATE.classes)) STATE.classes = [];
  return STATE.classes;
}
function classCard(cl) {
  const students = cl.students || [];
  // 每个学生的信息编辑行
  const rows = students.length
    ? students.map(st => `
      <tr class="cls-student">
        <td class="cls-stu-name">👤 ${escapeHtml(st.name)}
          <button class="mini-btn" data-act="del-class-student" data-cid="${cl.id}" data-sid="${st.id}" title="移除学生">✕</button>
        </td>
        <td><textarea class="cls-info" rows="2" placeholder="成绩 / 排名 / GPA…" data-class-field="grades" data-cid="${cl.id}" data-sid="${st.id}" maxlength="200">${escapeHtml(st.grades || '')}</textarea></td>
        <td><textarea class="cls-info" rows="2" placeholder="语言成绩，如：雅思 7.0 / 托福 105…" data-class-field="language" data-cid="${cl.id}" data-sid="${st.id}" maxlength="200">${escapeHtml(st.language || st.activities || '')}</textarea></td>
        <td><textarea class="cls-info" rows="2" placeholder="获得的奖项 / 荣誉…" data-class-field="awards" data-cid="${cl.id}" data-sid="${st.id}" maxlength="200">${escapeHtml(st.awards || '')}</textarea></td>
        <td><input class="input cls-info-short" placeholder="想申请的国家，如：美国、英国" data-class-field="countries" data-cid="${cl.id}" data-sid="${st.id}" maxlength="60" value="${escapeHtml(st.countries || '')}"/></td>
        <td><input class="input cls-info-short" placeholder="想申请的专业，如：计算机、商科" data-class-field="majors" data-cid="${cl.id}" data-sid="${st.id}" maxlength="60" value="${escapeHtml(st.majors || '')}"/></td>
      </tr>`).join('')
    : `<tr><td class="club-hint" colspan="6">还没有添加学生</td></tr>`;

  return `<div class="club-card cls-card">
    <div class="club-head">
      <span class="cls-title">🏫 ${escapeHtml(cl.grade || '未设年级')} · ${escapeHtml(cl.name || '未命名班级')}</span>
      <span class="club-meta">${students.length} 名学生</span>
      <button class="mini-btn" data-act="del-class" data-cid="${cl.id}" title="删除班级">✕</button>
    </div>
    <div class="add-row cls-add-stu" style="margin:12px 0">
      <input class="input" placeholder="添加学生姓名…" data-class-input="${cl.id}" maxlength="20"/>
      <button class="btn ghost" data-act="add-class-student" data-cid="${cl.id}">＋学生</button>
    </div>
    <table class="club-table cls-table">
      <thead><tr>
        <th class="club-th-name">学生</th>
        <th class="cls-th">成绩</th>
        <th class="cls-th">语言成绩</th>
        <th class="cls-th">奖项</th>
        <th class="cls-th">申请国家</th>
        <th class="cls-th">申请专业</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}
function viewClasses() {
  const classes = classesData();
  const cards = classes.length ? classes.map(classCard).join('') : '<div class="empty">还没有班级。<br/>先添加一个班级（年级 + 班级名称），然后在里面添加学生并填写各项信息。</div>';
  const totalStudents = classes.reduce((a, c) => a + (c.students || []).length, 0);
  return `
  <div class="card">
    <div class="card-title"><span class="dot" style="background:var(--blue-500)"></span>班级 · 总览</div>
    <div class="overview-grid">
      <div class="ov"><div class="n">${classes.length}</div><div class="t">班级数</div></div>
      <div class="ov"><div class="n">${totalStudents}</div><div class="t">学生总数</div></div>
      <div class="ov"><div class="n">${new Set(classes.map(c => c.grade).filter(Boolean)).size}</div><div class="t">年级数</div></div>
    </div>
  </div>
  <div class="card">
    <div class="card-title"><span class="dot" style="background:var(--pink-400)"></span>我的班级（${classes.length} 个）</div>
    ${cards}
    <div class="add-row" style="margin-top:16px">
      <input class="input" id="cls-grade" placeholder="年级，如：高一" maxlength="20" style="max-width:110px"/>
      <input class="input" id="cls-name" placeholder="班级名称，如：1班" maxlength="30"/>
      <button class="btn pink" data-act="add-class">添加班级</button>
    </div>
  </div>`;
}

function gradesData() {
  if (!Array.isArray(STATE.grades)) STATE.grades = [];
  return STATE.grades;
}
function viewGrade() {
  const grades = gradesData();
  const PHASES = [
    { key: 'before', label: '活动前', ico: '📝' },
    { key: 'during', label: '活动中', ico: '🎯' },
    { key: 'after',  label: '活动后', ico: '✅' },
  ];
  const gradeCards = grades.length ? grades.map(g => {
    const acts = g.activities || [];
    // 每个活动卡片
    const actCards = acts.length ? acts.map(a => {
      const taskBlocks = PHASES.map(ph => {
        const list = (a.tasks || []).filter(t => t.phase === ph.key);
        const chips = list.length
          ? list.map((t, j) => `<span class="grade-task ${t.done ? 'done' : ''}">
              <span class="ck-btn" data-act="grade-task-toggle" data-gid="${g.id}" data-aid="${a.id}" data-tid="${t.id}">${t.done ? '✓' : '○'}</span>
              <span class="gt-txt">${escapeHtml(t.text)}</span>
              <button class="x" data-act="grade-task-del" data-gid="${g.id}" data-aid="${a.id}" data-tid="${t.id}" title="删除任务">✕</button>
            </span>`).join('')
          : '<span class="empty" style="padding:2px">暂无任务</span>';
        return `<div class="grade-phase">
          <div class="grade-phase-title">${ph.ico} ${ph.label}</div>
          <div class="grade-task-list">${chips}</div>
          <div class="add-row grade-task-add">
            <input class="input" placeholder="添加${ph.label}任务…" data-grade-task-input="${g.id}" data-aid="${a.id}" data-phase="${ph.key}" maxlength="60"/>
            <button class="btn ghost" data-act="add-grade-task" data-gid="${g.id}" data-aid="${a.id}" data-phase="${ph.key}">＋</button>
          </div>
        </div>`;
      }).join('');
      return `<div class="grade-act-card">
        <div class="grade-act-top">
          ${editingGradeActivity === a.id ? '' : `<span class="grade-act-title">${escapeHtml(a.title)}</span>`}
          ${editingGradeActivity === a.id
            ? `<div class="grade-act-edit">
                <div class="add-row" style="gap:6px;flex-wrap:wrap">
                  <input class="input" id="edit-grade-title" placeholder="活动名称" maxlength="40" value="${escapeHtml(a.title)}"/>
                </div>
                <div class="add-row" style="gap:6px;flex-wrap:wrap;margin-top:8px">
                  <input class="input" type="date" id="edit-grade-date" value="${escapeHtml(a.date || '')}"/>
                  <input class="input" id="edit-grade-time" placeholder="时间/说明，如：14:00 操场" maxlength="30" value="${escapeHtml(a.time || '')}"/>
                </div>
                <div class="add-row" style="gap:6px;flex-wrap:wrap;margin-top:8px">
                  <input class="input" id="edit-grade-people" placeholder="工作人员，如：全年级师生" maxlength="30" value="${escapeHtml(a.people || '')}"/>
                </div>
                <div class="act-card-actions" style="margin-top:10px">
                  <button class="btn" data-act="save-grade-activity" data-gid="${g.id}" data-aid="${a.id}">💾 保存</button>
                  <button class="btn ghost" data-act="cancel-grade-activity">取消</button>
                </div>
              </div>`
            : `<button class="mini-btn" data-act="edit-grade-activity" data-gid="${g.id}" data-aid="${a.id}" title="编辑活动">✏️</button>`}
          <button class="mini-btn" data-act="del-grade-activity" data-gid="${g.id}" data-aid="${a.id}" title="删除活动">✕</button>
        </div>
        ${editingGradeActivity === a.id ? '' : `<div class="grade-act-meta">
          <span>📅 活动日期：${a.date ? escapeHtml(fmtMD(a.date)) + '（' + escapeHtml(a.date) + '）' : '未选择'}</span>
          ${a.time ? `<span>🕐 ${escapeHtml(a.time)}</span>` : ''}
          <span>👥 工作人员：${escapeHtml(a.people || '未填写')}</span>
        </div>`}
        ${editingGradeActivity === a.id ? '' : `<div class="grade-task-grid">${taskBlocks}</div>`}
      </div>`;
    }).join('') : '<div class="empty">还没有年级活动。<br/>添加一个本学期的重要活动或事项。</div>';

    return `<div class="club-card grade-card">
      <div class="club-head">
        <span class="grade-name">📅 ${escapeHtml(g.name || '未命名年级')}</span>
        <span class="club-meta">${acts.length} 项活动</span>
        <button class="mini-btn" data-act="del-grade" data-gid="${g.id}" title="删除年级">✕</button>
      </div>
      ${actCards}
      <div class="grade-add-act" style="margin-top:14px; border-top:1px dashed var(--line); padding-top:12px">
        <div class="add-row" style="margin-top:6px">
          <input class="input" placeholder="活动/事项名称，如：期中考试动员 / 运动会" data-grade-title="${g.id}" maxlength="40"/>
          <input class="input" type="date" data-grade-date="${g.id}" title="选择活动日期（会标记到首页月历）"/>
          <input class="input" placeholder="时间/说明，如：14:00 操场" data-grade-time="${g.id}" maxlength="30"/>
          <input class="input" placeholder="工作人员，如：全年级师生" data-grade-people="${g.id}" maxlength="30"/>
          <button class="btn pink" data-act="add-grade-activity" data-gid="${g.id}">＋活动</button>
        </div>
        <p class="hint">选择「活动日期」后，该日期会自动标记在首页月历上。可再填写时间/说明与工作人员。添加活动后可为「活动前 / 活动中 / 活动后」分别填写任务列表。</p>
      </div>
    </div>`;
  }).join('') : '<div class="empty">还没有年级。<br/>先添加一个年级，然后为本学期的重要活动和事项做规划。</div>';

  const totalActs = grades.reduce((a, g) => a + (g.activities || []).length, 0);
  return `
  <div class="card">
    <div class="card-title"><span class="dot" style="background:var(--blue-500)"></span>年级工作 · 总览</div>
    <div class="overview-grid">
      <div class="ov"><div class="n">${grades.length}</div><div class="t">年级数</div></div>
      <div class="ov"><div class="n">${totalActs}</div><div class="t">重要活动/事项</div></div>
      <div class="ov"><div class="n">${grades.reduce((a, g) => a + (g.activities || []).reduce((x, at) => x + (at.tasks || []).length, 0), 0)}</div><div class="t">任务总数</div></div>
    </div>
  </div>
  <div class="card">
    <div class="card-title"><span class="dot" style="background:var(--pink-400)"></span>各年级 · 本学期重要活动与事项（${grades.length} 个年级）</div>
    ${gradeCards}
    <div class="add-row" style="margin-top:16px">
      <input class="input" id="grade-name" placeholder="年级名称，如：高一" maxlength="20" style="max-width:140px"/>
      <button class="btn pink" data-act="add-grade">添加年级</button>
    </div>
  </div>`;
}

/* ---------- 后申请追踪 ---------- */
function viewAfter() {
  const list = afterSchools().filter(x => x.sid); // 关联有效的
  const today = todayStr();
  // 统计：进行中 / 已完成的任务数
  let totalTasks = 0, doneTasks = 0;
  list.forEach(x => (x.tasks || []).forEach(t => { totalTasks++; if (t.done) doneTasks++; }));
  const pend = list.filter(x => (x.tasks || []).some(t => !t.done)).length;

  const cards = list.length ? list.map(a => {
    const tasks = (a.tasks || []);
    const taskChips = tasks.length
      ? tasks.map((t, i) => `<span class="aft-task ${t.done ? 'done' : ''}">
          <span class="ck-btn" data-act="aft-toggle" data-aid="${a.id}" data-i="${i}">${t.done ? '✓' : '○'}</span>
          <span class="t-txt">${escapeHtml(t.text)}</span>
          <button class="x" data-act="aft-del-task" data-aid="${a.id}" data-i="${i}" title="删除">✕</button>
        </span>`).join('')
      : '<span class="empty" style="padding:2px">还没有要追踪的事项</span>';
    const todayTasks = tasks.filter(t => !t.done).length;
    const submitted = a.submitted ? `<span class="aft-sub">递交日：${escapeHtml(a.submitted)}</span>` : '';
    const admitUi = a.admitted
      ? `<span class="admit-badge">🎉 已录取</span><button class="btn ghost admit-btn" data-act="aft-unadmit" data-aid="${a.id}" title="取消录取标记">取消录取标记</button>`
      : `<button class="btn pink admit-btn" data-act="aft-admit" data-aid="${a.id}">🎉 标记已录取</button>`;
    return `<div class="aft-card ${a.admitted ? 'aft-admitted' : ''}">
      <div class="aft-head">
        <div class="aft-who">
          <span class="aft-stu">👤 ${escapeHtml(a.student)}</span>
          <span class="aft-school">🏫 ${escapeHtml(a.school)}</span>
          <span class="aft-country">🌍 ${escapeHtml(a.country || '')}</span>
        </div>
        <div class="aft-head-right">
          ${submitted}
          <span class="aft-open-count">待追踪 ${todayTasks} 项</span>
          ${admitUi}
          <button class="mini-btn" data-act="aft-del" data-aid="${a.id}" title="移出后申请追踪">✕</button>
        </div>
      </div>
      <div class="aft-body">
        <div class="aft-add">
          <input class="input" placeholder="提交后要追踪的事项，如：等待面试 / 补交推荐信…" data-aft-input="${a.id}" maxlength="60" style="font-size:13px"/>
          <button class="btn ghost" data-act="aft-add-task" data-aid="${a.id}">＋追踪事项</button>
        </div>
        <div class="aft-tasks">${taskChips}</div>
        <textarea class="textarea aft-note" rows="2" placeholder="后申请备注（可选，自动保存）" data-aft-note="${a.id}">${escapeHtml(a.note || '')}</textarea>
      </div>
    </div>`;
  }).join('') : '<div class="empty">还没有进入后申请追踪的院校。<br/>当某所院校申请进度达到 100% 后会自动出现在这里，可继续追踪后续事项。</div>';

  return `
  <div class="card">
    <div class="card-title"><span class="dot" style="background:var(--blue-500)"></span>后申请追踪总览</div>
    <div class="overview-grid">
      <div class="ov"><div class="n">${list.length}</div><div class="t">递交院校数</div></div>
      <div class="ov"><div class="n">${totalTasks}</div><div class="t">追踪事项数</div></div>
      <div class="ov"><div class="n">${doneTasks}</div><div class="t">已完成事项</div></div>
      <div class="ov"><div class="n">${pend}</div><div class="t">有未完成事项</div></div>
    </div>
  </div>
  <div class="card">
    <div class="card-title"><span class="dot"></span>申请后状态追踪（${list.length} 所）</div>
    <p class="hint">院校申请进度达到 100%（申请递交完成）后会自动进入此列表；点击 ○ 打勾表示该追踪事项已完成，可手动增删事项与备注。</p>
    ${cards}
  </div>`;
}

/* ---------- 录取情况看板 ---------- */
function viewAdmission() {
  const admitted = admittedSchools();
  const students = STATE.students.filter(s => admitted.some(a => a.sid === s.id));
  const pending = afterSchools().filter(a => !a.admitted);
  const totalAfter = afterSchools().length;
  const admitRate = totalAfter ? Math.round(admitted.length / totalAfter * 100) : 0;

  // 按学生分组展示录取情况
  const grouped = students.map(s => {
    const myAdmits = admitted.filter(a => a.sid === s.id);
    const admits = myAdmits.map(a => `<span class="adm-school-chip">🏫 ${escapeHtml(a.school)} <em>${escapeHtml(a.country || '')}</em></span>`).join('') || '<span class="empty" style="padding:2px">无</span>';
    return `<div class="adm-stu-row">
      <div class="adm-avatar">${escapeHtml(s.name.slice(0, 1))}</div>
      <div class="adm-stu-name">${escapeHtml(s.name)}</div>
      <div class="adm-stu-holds">已获 ${myAdmits.length} 份录取</div>
      <div class="adm-stu-schools">${admits}</div>
    </div>`;
  }).join('');

  const allCards = admitted.length ? admitted.map(a => `
    <div class="adm-card">
      <div class="adm-card-top">
        <span class="adm-big">🎉 已录取</span>
        <span class="adm-who">👤 ${escapeHtml(a.student)}</span>
        <span class="adm-school">🏫 ${escapeHtml(a.school)}</span>
        <span class="adm-country">🌍 ${escapeHtml(a.country || '')}</span>
      </div>
      <div class="adm-meta">
        ${a.admittedDate ? `<span>录取日期：${escapeHtml(a.admittedDate)}</span>` : ''}
        ${a.submitted ? `<span>递交日：${escapeHtml(a.submitted)}</span>` : ''}
      </div>
      <div class="adm-cond">
        <span class="adm-cond-label">📋 录取条件</span>
        <textarea class="textarea adm-cond-input" rows="2" placeholder="填写这封录取通知书的条件，如：保持 GPA 3.5 / 雅思总分不低于 7.0 / 按时缴纳押金…" data-aft-cond="${a.id}">${escapeHtml(a.condition || '')}</textarea>
        <div class="adm-cond-tip">💾 自动保存</div>
      </div>
      <button class="btn ghost" data-act="aft-unadmit" data-aid="${a.id}" title="取消录取标记">取消录取标记</button>
    </div>`).join('') : '<div class="empty">还没有学生收到录取通知书。<br/>在「后申请追踪」中把收到录取通知书的院校标记为「已录取」后，会自动出现在这里。</div>';

  return `
  <div class="card">
    <div class="card-title"><span class="dot" style="background:var(--green)"></span>班级录取情况看板</div>
    <div class="overview-grid">
      <div class="ov" style="border-color:var(--green)"><div class="n">${students.length}</div><div class="t">已有录取的学生</div></div>
      <div class="ov"><div class="n">${admitted.length}</div><div class="t">已获录取通知书</div></div>
      <div class="ov"><div class="n">${pending.length}</div><div class="t">仍待结果的院校</div></div>
      <div class="ov"><div class="n">${admitRate}%</div><div class="t">院校录取率</div></div>
    </div>
    <div class="adm-rate-bar"><i style="width:${admitRate}%"></i></div>
    <p class="hint" style="margin-top:8px">录取率 = 已录取院校数 ÷ 已递交院校数（${admitted.length}/${totalAfter}）</p>
  </div>
  <div class="card">
    <div class="card-title"><span class="dot" style="background:var(--blue-500)"></span>按学生汇总</div>
    ${grouped || '<div class="empty">暂无录取记录</div>'}
  </div>
  <div class="card">
    <div class="card-title"><span class="dot" style="background:var(--pink-400)"></span>录取通知书明细（${admitted.length} 份）</div>
    ${allCards}
  </div>`;
}

/* ---------- 数据备份 ---------- */
function viewBackup() {
  // 统计各类数据量
  const stats = [
    ['📝 每日计划', (STATE.tasks || []).length],
    ['🎓 学生申请进度', (STATE.students || []).length + ' 名学生'],
    ['⏰ 申请截止时间', (STATE.deadlines || []).length + ' 条'],
    ['🏰 大学来访', allVisitSchools().length + ' 所院校'],
    ['📨 后申请追踪', afterSchools().length + ' 所'],
    ['🏆 录取情况', admittedSchools().length + ' 份'],
    ['🎪 社团工作', (STATE.clubs || []).length + ' 个'],
    ['🎬 学理会活动部', ((STATE.activity||{}).activities||[]).length + ' 条'],
    ['🏫 班级&学生', (STATE.classes || []).length + ' 个'],
    ['📅 年级工作', (STATE.grades || []).length + ' 项'],
  ];
  const statHtml = stats.map(s => `<div class="bk-stat"><div class="bk-n">${s[1]}</div><div class="bk-t">${s[0]}</div></div>`).join('');

  return `
  <div class="card">
    <div class="card-title"><span class="dot" style="background:var(--blue-500)"></span>数据备份</div>
    <p class="hint">你的所有数据都保存在这台设备的浏览器里。请定期导出备份，换设备或清理缓存后，通过「导入」即可完整恢复。</p>

    <div class="bk-stats">${statHtml}</div>

    <div class="bk-actions">
      <button class="btn pink" data-act="export-data" style="font-size:15px;padding:12px 20px">📤 导出全部数据</button>
      <button class="btn blue" data-act="import-data" style="font-size:15px;padding:12px 20px">📥 导入数据</button>
      <input type="file" id="bk-file" accept=".json,application/json" style="display:none"/>
    </div>

    <div class="bk-tips">
      <div class="bk-tip"><b>📤 导出：</b>点击后自动下载一个「Jasmine备份-日期.json」文件，请把它存到电脑、网盘或手机里。</div>
      <div class="bk-tip"><b>📥 导入：</b>点击后选择之前导出的 json 文件，即可恢复全部数据（会覆盖当前设备数据，请确认）。</div>
      <div class="bk-tip"><b>💡 建议：</b>重要数据每 1–2 周导出一次；换新电脑 / 新手机 / 清理浏览器缓存前，务必先导出。</div>
    </div>
  </div>`;
}

/* ---------- 手机挂件视图 ---------- */
function renderWidget() {
  const t = todayStr();
  const todayTasks = secTasks('today');
  const incTasks = secTasks('incomplete');
  const pendTasks = secTasks('pending');
  const openTasks = [...todayTasks, ...incTasks];
  const visitsTodayL = visitsToday();
  const allC = STATE.students.flatMap(s => s.countries);
  const avg = allC.length ? Math.round(allC.reduce((a, c) => a + (c.progress || 0), 0) / allC.length) : 0;
  const d = new Date();
  const dateLine = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 周${weekdayCn(t)}`;

  const taskChips = openTasks.length
    ? openTasks.slice(0, 6).map(x => `<span class="wg-chip task">${escapeHtml(x.text)}</span>`).join('')
    : '<span class="wg-chip">暂无待办</span>';
  const visitChips = visitsTodayL.length
    ? visitsTodayL.slice(0, 4).map(x => `<span class="wg-chip event">🏰 ${escapeHtml(x.name)} ${escapeHtml(x.visitTime || '')}</span>`).join('')
    : '<span class="wg-chip">无</span>';
  const dls = (STATE.deadlines || []).filter(d => d.deadline && d.deadline >= todayStr()).sort((a, b) => a.deadline.localeCompare(b.deadline));
  const soonDl = dls.length
    ? dls.slice(0, 3).map(d => `<span class="wg-chip">${escapeHtml(d.name)} · ${escapeHtml(d.deadline.slice(5))}</span>`).join('')
    : '<span class="wg-chip">无</span>';

  $('#widget').innerHTML = `
    <div class="wg-card">
      <div class="wg-top">
        <div class="wn">${APP_NAME}</div>
        <div class="wd">${dateLine}</div>
      </div>
      <div class="wg-row"><div class="wl">待办</div><div class="wv"><div class="wg-chips">${taskChips}</div></div></div>
      <div class="wg-row"><div class="wl">今日来访</div><div class="wv"><div class="wg-chips">${visitChips}</div></div></div>
      <div class="wg-row"><div class="wl">申请进度</div><div class="wv">班级平均完成 ${avg}%</div></div>
      <div class="wg-row"><div class="wl">临近截止</div><div class="wv"><div class="wg-chips">${soonDl}</div></div></div>
      <div class="wg-row"><div class="wl">后申请追踪</div><div class="wv">${afterSchools().length} 所已递交</div></div>
      <div class="wg-row"><div class="wl">录取情况</div><div class="wv"><span class="wg-chip" style="color:var(--green)">🎉 已录取 ${admittedSchools().length} 所</span></div></div>
      <button class="wg-full-btn" data-act="open-full">展开完整工作台 →</button>
    </div>`;
}

/* =========================================================
   交互
   ========================================================= */
function findTask(id) { return STATE.tasks.find(x => x.id === id); }

/* ---------- 左侧导航拖拽排序 ---------- */
let dragRoute = null;
document.addEventListener('dragstart', e => {
  const item = e.target.closest('.nav-item[data-route]');
  if (!item) return;
  dragRoute = item.dataset.route;
  item.classList.add('dragging');
  try { e.dataTransfer.setData('text/plain', dragRoute); } catch (err) {}
  e.dataTransfer.effectAllowed = 'move';
});
document.addEventListener('dragover', e => {
  const item = e.target.closest('.nav-item[data-route]');
  if (!item || !dragRoute) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;
  const siblings = Array.from(sidebar.querySelectorAll('.nav-item[data-route]'));
  const rect = item.getBoundingClientRect();
  const after = (e.clientY - rect.top) > rect.height / 2;
  // 计算拖动目标应插入的位置
  const draggingEl = sidebar.querySelector('.nav-item.dragging');
  if (!draggingEl || draggingEl === item) return;
  const before = after ? item.nextSibling : item;
  sidebar.insertBefore(draggingEl, before);
});
document.addEventListener('dragend', e => {
  const item = e.target.closest('.nav-item');
  if (item) item.classList.remove('dragging');
  if (dragRoute) {
    captureNavOrder();
    dragRoute = null;
  }
});
document.addEventListener('drop', e => {
  if (e.target.closest('.nav-item[data-route]')) e.preventDefault();
});

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const id = el.dataset.id;

  if (act === 'nav') { route = el.dataset.route; render(); window.scrollTo(0, 0); return; }
  if (act === 'next-quote') { quoteShift++; render(); return; }
  if (act === 'next-tip') { workTipShift++; render(); return; }
  if (act === 'toggle-worklist') {
    const list = $('#work-all');
    if (!list) return;
    const show = list.style.display === 'none';
    list.style.display = show ? 'block' : 'none';
    el.textContent = show ? '收起' : '展开全部';
    return;
  }
  if (act === 'open-full') { document.body.classList.remove('widget'); render(); return; }
  if (act === 'toggle-widget') {
    document.body.classList.toggle('widget');
    if (document.body.classList.contains('widget')) renderWidget();
    return;
  }

  // 数据备份：导出
  if (act === 'export-data') {
    const data = JSON.stringify({ __app: 'jasmine_workbench', version: 1, time: new Date().toISOString(), state: STATE }, null, 2);
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    const fname = `Jasmine备份-${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}.json`;
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fname;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
    toast('📤 已导出备份：' + fname);
    return;
  }
  // 数据备份：导入
  if (act === 'import-data') {
    const fileInp = document.getElementById('bk-file');
    if (fileInp) fileInp.click();
    return;
  }

  // 月历
  if (act === 'cal-prev') { const c = strToDate(calCursor); calCursor = dateToStr(new Date(c.getFullYear(), c.getMonth() - 1, 1)); render(); return; }
  if (act === 'cal-next') { const c = strToDate(calCursor); calCursor = dateToStr(new Date(c.getFullYear(), c.getMonth() + 1, 1)); render(); return; }
  if (act === 'cal-today') { calCursor = todayStr(); calSelected = todayStr(); render(); return; }
  if (act === 'cal-cell') { calSelected = el.dataset.date; render(); return; }

  // 任务
  if (act === 'toggle-task') {
    const x = findTask(id); if (!x) return;
    x.done = !x.done;
    if (x.done) x.status = x.status === 'pending' ? 'pending' : x.status;
    else x.status = x.date === todayStr() ? 'today' : 'incomplete';
    save(); render(); return;
  }
  if (act === 'cycle-urg') {
    const x = findTask(id); if (!x) return;
    x.urgent = x.urgent === 'low' ? 'mid' : x.urgent === 'mid' ? 'high' : 'low';
    save(); render(); return;
  }
  if (act === 'move-task') {
    const sec = el.dataset.sec, dir = el.dataset.dir;
    const arr = secTasks(sec).sort((a, b) => (a.order || 0) - (b.order || 0));
    const idx = arr.findIndex(x => x.id === id);
    if (idx < 0) return;
    const j = dir === 'up' ? idx - 1 : idx + 1;
    if (j < 0 || j >= arr.length) return;
    const o = arr[idx].order; arr[idx].order = arr[j].order; arr[j].order = o;
    save(); render(); return;
  }
  if (act === 'edit-task') {
    const x = findTask(id); if (!x) return;
    const v = prompt('编辑计划内容：', x.text);
    if (v != null && v.trim()) { x.text = v.trim(); save(); render(); }
    return;
  }
  if (act === 'del-task') {
    STATE.tasks = STATE.tasks.filter(x => x.id !== id); save(); render(); return;
  }
  if (act === 'add-task') {
    const inp = $('#new-task'); const v = inp.value.trim();
    if (!v) { inp.focus(); return; }
    const maxOrder = STATE.tasks.reduce((m, x) => Math.max(m, x.order || 0), 0);
    STATE.tasks.push({ id: uid(), text: v, done: false, urgent: 'low', status: 'today', date: todayStr(), order: maxOrder + 1 });
    save(); render(); return;
  }

  // 大学来访
  if (act === 'import-visits') {
    // 从预设重新导入（幂等：按国家合并，保留已设置的来访信息）
    const preset = (typeof window !== 'undefined' && window.VISITS_PRESET) || [];
    if (preset.length) {
      const byName = {};
      (STATE.visits || []).forEach(g => byName[g.country] = g);
      STATE.visits = preset.map(p => {
        const existing = byName[p.country];
        const oldMap = {};
        (existing ? existing.schools : []).forEach(s => oldMap[s.name] = s);
        return {
          id: existing ? existing.id : uid(),
          country: p.country,
          schools: (p.schools || []).map(ps => {
            const old = oldMap[ps.name];
            return {
              id: old ? old.id : uid(),
              name: ps.name, officer: ps.officer || '', wechat: ps.wechat || '', email: ps.email || '',
              visiting: old ? !!old.visiting : false,
              visitDate: old ? (old.visitDate || '') : '',
              visitTime: old ? (old.visitTime || '') : ''
            };
          })
        };
      });
    }
    save(); render(); return;
  }
  if (act === 'toggle-manual-form') {
    const f = document.getElementById('visit-manual');
    if (f) f.style.display = f.style.display === 'none' ? 'block' : 'none';
    return;
  }
  if (act === 'add-visit-manual') {
    const name = ($('#vm-name').value || '').trim();
    if (!name) { $('#vm-name').focus(); return; }
    const country = ($('#vm-country').value || '').trim() || '其他';
    const officer = ($('#vm-officer').value || '').trim();
    const contact = ($('#vm-contact').value || '').trim();
    const visitDate = ($('#vm-date').value || '');
    const visitTime = ($('#vm-time').value || '');
    // 找到或创建国家分组
    let g = (STATE.visits || []).find(x => x.country === country);
    if (!g) { g = { id: uid(), country, schools: [] }; STATE.visits.push(g); }
    const school = {
      id: uid(), name, officer, wechat: '', email: contact,
      visiting: !!visitDate, visitDate, visitTime
    };
    g.schools.push(school);
    // 若填了国家分类则自动展开该组
    collapsedVisits[g.id] = false;
    visitQuery = '';
    save(); render(); return;
  }
  if (act === 'toggle-visit-group') {
    collapsedVisits[el.dataset.cid] = !collapsedVisits[el.dataset.cid];
    render(); return;
  }
  if (act === 'clear-visit-search') {
    visitQuery = '';
    save(); render(); return;
  }
  if (act === 'add-visit-country') {
    const name = prompt('请输入国家/地区名称：');
    if (!name || !name.trim()) return;
    STATE.visits.push({ id: uid(), country: name.trim(), schools: [] });
    save(); render(); return;
  }
  if (act === 'add-visit') {
    const g = (STATE.visits || []).find(x => x.id === el.dataset.cid); if (!g) return;
    const inp = document.querySelector('[data-visit-school-input="' + el.dataset.cid + '"]');
    const v = inp ? inp.value.trim() : '';
    if (!v) return;
    g.schools.push({ id: uid(), name: v, officer: '', wechat: '', email: '', visiting: false, visitDate: '', visitTime: '' });
    save(); render(); return;
  }
  if (act === 'del-visit') {
    const g = (STATE.visits || []).find(x => x.id === el.dataset.cid); if (!g) return;
    g.schools = g.schools.filter(s => s.id !== el.dataset.sid);
    save(); render(); return;
  }
  if (act === 'toggle-visit') {
    const g = (STATE.visits || []).find(x => x.id === el.dataset.cid); if (!g) return;
    const s = g.schools.find(x => x.id === el.dataset.sid); if (!s) return;
    s.visiting = el.checked;
    if (!s.visiting) { s.visitDate = ''; s.visitTime = ''; }
    save(); render(); return;
  }

  // 学生
  if (act === 'add-student') {
    const inp = $('#new-student'); const v = inp.value.trim();
    if (!v) { inp.focus(); return; }
    STATE.students.push({ id: uid(), name: v, countries: [] });
    save(); render(); return;
  }
  if (act === 'toggle-country') {
    const s = STATE.students.find(x => x.id === el.dataset.sid); if (!s) return;
    const name = el.dataset.country;
    const exists = s.countries.find(c => c.country === name);
    if (exists) s.countries = s.countries.filter(c => c.id !== exists.id);
    else s.countries.push({ id: uid(), country: name, startDate: todayStr(), schools: [] });
    save(); render(); return;
  }
  if (act === 'add-country') {
    const s = STATE.students.find(x => x.id === el.dataset.sid); if (!s) return;
    const inp = $('#custom-country-' + el.dataset.sid); const v = inp.value.trim();
    if (!v) { inp.focus(); return; }
    if (!s.countries.find(c => c.country === v)) {
      s.countries.push({ id: uid(), country: v, startDate: todayStr(), schools: [] });
    }
    save(); render(); return;
  }
  if (act === 'del-country') {
    const s = STATE.students.find(x => x.id === el.dataset.sid); if (!s) return;
    s.countries = s.countries.filter(c => c.id !== el.dataset.cid);
    save(); render(); return;
  }
  if (act === 'add-school') {
    const s = STATE.students.find(x => x.id === el.dataset.sid); if (!s) return;
    const c = s.countries.find(x => x.id === el.dataset.cid); if (!c) return;
    const inp = document.querySelector('[data-school-input="' + c.id + '"]');
    const v = inp ? inp.value.trim() : '';
    if (!v) { if (inp) inp.focus(); return; }
    c.schools = c.schools || [];
    c.schools.push({ id: uid(), name: v, progress: 0, deadline: '', materials: [] });
    save(); render(); return;
  }
  if (act === 'del-school') {
    const s = STATE.students.find(x => x.id === el.dataset.sid); if (!s) return;
    const c = s.countries.find(x => x.id === el.dataset.cid); if (!c) return;
    c.schools = (c.schools || []).filter(x => x.id !== el.dataset.schid);
    save(); render(); return;
  }
  if (act === 'add-material') {
    const s = STATE.students.find(x => x.id === el.dataset.sid); if (!s) return;
    const c = s.countries.find(x => x.id === el.dataset.cid); if (!c) return;
    const sc = (c.schools || []).find(x => x.id === el.dataset.schid); if (!sc) return;
    const v = prompt('材料名称：', '简历'); if (!v || !v.trim()) return;
    sc.materials = sc.materials || [];
    sc.materials.push({ id: uid(), name: v.trim(), status: 'todo' });
    save(); render(); return;
  }
  if (act === 'set-mat-status') {
    const s = STATE.students.find(x => x.id === el.dataset.sid); if (!s) return;
    const c = s.countries.find(x => x.id === el.dataset.cid); if (!c) return;
    const sc = (c.schools || []).find(x => x.id === el.dataset.schid); if (!sc) return;
    const m = (sc.materials || []).find(x => x.id === el.dataset.mid); if (!m) return;
    m.status = el.value; save(); render(); return;
  }
  if (act === 'del-material') {
    const s = STATE.students.find(x => x.id === el.dataset.sid); if (!s) return;
    const c = s.countries.find(x => x.id === el.dataset.cid); if (!c) return;
    const sc = (c.schools || []).find(x => x.id === el.dataset.schid); if (!sc) return;
    sc.materials = (sc.materials || []).filter(x => x.id !== el.dataset.mid);
    save(); render(); return;
  }

  // 截止时间
  if (act === 'add-deadline') {
    const name = $('#dl-name').value.trim();
    const deadline = $('#dl-date').value;
    const note = $('#dl-note').value.trim();
    if (!name) { $('#dl-name').focus(); return; }
    STATE.deadlines = STATE.deadlines || [];
    STATE.deadlines.push({ id: uid(), name, deadline, note });
    save(); render(); return;
  }
  if (act === 'del-deadline') {
    STATE.deadlines = (STATE.deadlines || []).filter(x => x.id !== id);
    save(); render(); return;
  }

  // 社团
  if (act === 'add-club') {
    const name = $('#club-name').value.trim();
    if (!name) { $('#club-name').focus(); return; }
    STATE.clubs = STATE.clubs || [];
    STATE.clubs.push({
      id: uid(), name,
      president: $('#club-president').value.trim(),
      teacher: $('#club-teacher').value.trim(),
      room: $('#club-room').value.trim(),
      count: $('#club-count').value.trim(),
      weeks: [], members: [],
    });
    save(); render(); return;
  }
  if (act === 'del-club') {
    STATE.clubs = (STATE.clubs || []).filter(x => x.id !== el.dataset.cid);
    save(); render(); return;
  }
  if (act === 'add-member') {
    const cl = (STATE.clubs || []).find(x => x.id === el.dataset.cid); if (!cl) return;
    const inp = document.querySelector('[data-member-input="' + cl.id + '"]');
    const v = inp ? inp.value.trim() : '';
    if (!v) { if (inp) inp.focus(); return; }
    cl.members = cl.members || [];
    // 默认所有已存在的周次都记为「正常出勤」
    const attend = {};
    (cl.weeks || []).forEach(w => { attend[w.id] = 'normal'; });
    cl.members.push({ id: uid(), name: v, attend });
    save(); render(); return;
  }
  if (act === 'del-member') {
    const cl = (STATE.clubs || []).find(x => x.id === el.dataset.cid); if (!cl) return;
    cl.members = (cl.members || []).filter(x => x.id !== el.dataset.mid);
    save(); render(); return;
  }
  if (act === 'add-week') {
    const cl = (STATE.clubs || []).find(x => x.id === el.dataset.cid); if (!cl) return;
    const inp = document.querySelector('[data-week-input="' + cl.id + '"]');
    const v = inp ? inp.value.trim() : '';
    if (!v) { if (inp) inp.focus(); return; }
    cl.weeks = cl.weeks || [];
    const week = { id: uid(), label: v };
    cl.weeks.push(week);
    // 默认该周所有社员都记为「正常出勤」
    (cl.members || []).forEach(m => {
      if (!m.attend) m.attend = {};
      m.attend[week.id] = 'normal';
    });
    save(); render(); return;
  }

  // 社团部（部长与干事）
  if (act === 'add-dept-member') {
    const inp = $('#dept-officer'); const v = inp.value.trim();
    if (!v) { inp.focus(); return; }
    const d = clubDeptData();
    d.members.push({ id: uid(), name: v });
    save(); render(); return;
  }
  if (act === 'del-dept-member') {
    const d = clubDeptData();
    d.members.splice(Number(el.dataset.i), 1);
    save(); render(); return;
  }

  // 学理会活动部
  if (act === 'add-officer') {
    const inp = $('#act-officer'); const v = inp.value.trim();
    if (!v) { inp.focus(); return; }
    const a = activityData();
    a.members.push({ id: uid(), name: v });
    save(); render(); return;
  }
  if (act === 'del-officer') {
    const a = activityData();
    a.members.splice(Number(el.dataset.i), 1);
    save(); render(); return;
  }
  if (act === 'add-activity') {
    const title = $('#act-title').value.trim();
    if (!title) { $('#act-title').focus(); return; }
    const a = activityData();
    a.activities.push({
      id: uid(),
      title,
      date: $('#act-date').value || '',
      detail: $('#act-detail').value.trim(),
    });
    save(); render(); return;
  }
  if (act === 'edit-activity') {
    editingActivity = el.dataset.aid;
    save(); render(); return;
  }
  if (act === 'save-activity') {
    const a = activityData();
    const target = a.activities.find(x => x.id === el.dataset.aid); if (!target) return;
    const title = $('#edit-act-title').value.trim();
    if (!title) { $('#edit-act-title').focus(); return; }
    target.title = title;
    target.date = $('#edit-act-date').value || '';
    target.detail = $('#edit-act-detail').value.trim();
    editingActivity = null;
    save(); render();
    toast('✨ 活动已更新');
    return;
  }
  if (act === 'cancel-activity') {
    editingActivity = null;
    save(); render(); return;
  }
  if (act === 'del-activity') {
    const a = activityData();
    if (editingActivity === a.activities[Number(el.dataset.i)].id) editingActivity = null;
    a.activities.splice(Number(el.dataset.i), 1);
    save(); render(); return;
  }

  // 班级
  if (act === 'add-class') {
    const name = $('#cls-name').value.trim();
    if (!name) { $('#cls-name').focus(); return; }
    const grade = $('#cls-grade').value.trim();
    STATE.classes = classesData();
    STATE.classes.push({ id: uid(), grade, name, students: [] });
    save(); render(); return;
  }
  if (act === 'del-class') {
    STATE.classes = classesData().filter(x => x.id !== el.dataset.cid);
    save(); render(); return;
  }
  if (act === 'add-class-student') {
    const cl = classesData().find(x => x.id === el.dataset.cid); if (!cl) return;
    const inp = document.querySelector('[data-class-input="' + cl.id + '"]');
    const v = inp ? inp.value.trim() : '';
    if (!v) { if (inp) inp.focus(); return; }
    cl.students = cl.students || [];
    cl.students.push({ id: uid(), name: v, grades: '', language: '', awards: '', countries: '', majors: '' });
    save(); render(); return;
  }
  if (act === 'del-class-student') {
    const cl = classesData().find(x => x.id === el.dataset.cid); if (!cl) return;
    cl.students = (cl.students || []).filter(x => x.id !== el.dataset.sid);
    save(); render(); return;
  }

  // 年级工作
  if (act === 'add-grade') {
    const name = $('#grade-name').value.trim();
    if (!name) { $('#grade-name').focus(); return; }
    gradesData().push({ id: uid(), name, activities: [] });
    save(); render(); return;
  }
  if (act === 'del-grade') {
    STATE.grades = gradesData().filter(x => x.id !== el.dataset.gid);
    save(); render(); return;
  }
  if (act === 'add-grade-activity') {
    const g = gradesData().find(x => x.id === el.dataset.gid); if (!g) return;
    const titleEl = document.querySelector('[data-grade-title="' + g.id + '"]');
    const dateEl = document.querySelector('[data-grade-date="' + g.id + '"]');
    const timeEl = document.querySelector('[data-grade-time="' + g.id + '"]');
    const peopleEl = document.querySelector('[data-grade-people="' + g.id + '"]');
    const title = titleEl ? titleEl.value.trim() : '';
    if (!title) { if (titleEl) titleEl.focus(); return; }
    g.activities = g.activities || [];
    g.activities.push({
      id: uid(), title,
      date: dateEl ? dateEl.value : '',
      time: timeEl ? timeEl.value.trim() : '',
      people: peopleEl ? peopleEl.value.trim() : '',
      tasks: [],
    });
    save(); render(); return;
  }
  if (act === 'edit-grade-activity') {
    editingGradeActivity = el.dataset.aid;
    save(); render(); return;
  }
  if (act === 'save-grade-activity') {
    const g = gradesData().find(x => x.id === el.dataset.gid); if (!g) return;
    const a = (g.activities || []).find(x => x.id === el.dataset.aid); if (!a) return;
    const title = $('#edit-grade-title').value.trim();
    if (!title) { $('#edit-grade-title').focus(); return; }
    a.title = title;
    a.date = $('#edit-grade-date').value || '';
    a.time = $('#edit-grade-time').value.trim();
    a.people = $('#edit-grade-people').value.trim();
    editingGradeActivity = null;
    save(); render();
    toast('✨ 年级活动已更新');
    return;
  }
  if (act === 'cancel-grade-activity') {
    editingGradeActivity = null;
    save(); render(); return;
  }
  if (act === 'del-grade-activity') {
    const g = gradesData().find(x => x.id === el.dataset.gid); if (!g) return;
    if (editingGradeActivity === el.dataset.aid) editingGradeActivity = null;
    g.activities = (g.activities || []).filter(x => x.id !== el.dataset.aid);
    save(); render(); return;
  }
  if (act === 'add-grade-task') {
    const g = gradesData().find(x => x.id === el.dataset.gid); if (!g) return;
    const a = (g.activities || []).find(x => x.id === el.dataset.aid); if (!a) return;
    const inp = document.querySelector('[data-grade-task-input="' + g.id + '"][data-aid="' + a.id + '"][data-phase="' + el.dataset.phase + '"]');
    const v = inp ? inp.value.trim() : '';
    if (!v) { if (inp) inp.focus(); return; }
    a.tasks = a.tasks || [];
    a.tasks.push({ id: uid(), phase: el.dataset.phase, text: v, done: false });
    save(); render(); return;
  }
  if (act === 'grade-task-toggle') {
    const g = gradesData().find(x => x.id === el.dataset.gid); if (!g) return;
    const a = (g.activities || []).find(x => x.id === el.dataset.aid); if (!a) return;
    const t = (a.tasks || []).find(x => x.id === el.dataset.tid); if (!t) return;
    t.done = !t.done;
    save(); render(); return;
  }
  if (act === 'grade-task-del') {
    const g = gradesData().find(x => x.id === el.dataset.gid); if (!g) return;
    const a = (g.activities || []).find(x => x.id === el.dataset.aid); if (!a) return;
    a.tasks = (a.tasks || []).filter(x => x.id !== el.dataset.tid);
    save(); render(); return;
  }

  // 后申请追踪
  if (act === 'aft-toggle') {
    const a = afterSchools().find(x => x.id === el.dataset.aid); if (!a) return;
    const i = Number(el.dataset.i);
    if (a.tasks && a.tasks[i]) { a.tasks[i].done = !a.tasks[i].done; save(); render(); }
    return;
  }
  if (act === 'aft-add-task') {
    const a = afterSchools().find(x => x.id === el.dataset.aid); if (!a) return;
    const inp = document.querySelector('[data-aft-input="' + a.id + '"]');
    const v = inp ? inp.value.trim() : '';
    if (!v) { if (inp) inp.focus(); return; }
    a.tasks = a.tasks || [];
    a.tasks.push({ id: uid(), text: v, done: false });
    save(); render(); return;
  }
  if (act === 'aft-del-task') {
    const a = afterSchools().find(x => x.id === el.dataset.aid); if (!a) return;
    const i = Number(el.dataset.i);
    if (a.tasks) a.tasks.splice(i, 1);
    save(); render(); return;
  }
  if (act === 'aft-del') {
    const a = afterSchools().find(x => x.id === el.dataset.aid); if (!a) return;
    // 移出后申请追踪（同时可把对应院校进度调回，由用户自行决定；此处仅移除追踪项）
    STATE.after = STATE.after.filter(x => x.id !== a.id);
    save(); render(); return;
  }
  if (act === 'aft-admit') {
    const a = afterSchools().find(x => x.id === el.dataset.aid); if (!a) return;
    a.admitted = true;
    a.admittedDate = a.admittedDate || todayStr();
    save(); render();
    toast('🎉 ' + a.student + ' · ' + a.school + ' 已标记录取，已进入「录取情况」');
    return;
  }
  if (act === 'aft-unadmit') {
    const a = afterSchools().find(x => x.id === el.dataset.aid); if (!a) return;
    a.admitted = false;
    a.admittedDate = '';
    save(); render();
    return;
  }
});

// 材料状态三态（change 实时保存）
document.addEventListener('change', e => {
  // 数据备份：导入文件
  if (e.target && e.target.id === 'bk-file') {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        let newState = parsed.state || parsed;
        if (!newState || typeof newState !== 'object') throw new Error('bad');
        // 兼容：若导出的只有顶层数据对象
        if (newState.__app === 'jasmine_workbench' && parsed.state) newState = parsed.state;
        // 校验关键字段，防止导入错误文件
        if (!newState.tasks && !newState.students && !newState.visits) throw new Error('no-data');
        // 补充缺失字段，保证兼容
        if (!Array.isArray(newState.tasks)) newState.tasks = [];
        if (!Array.isArray(newState.events)) newState.events = [];
        if (!Array.isArray(newState.students)) newState.students = [];
        if (!Array.isArray(newState.deadlines)) newState.deadlines = [];
        if (!Array.isArray(newState.after)) newState.after = [];
        if (!Array.isArray(newState.clubs)) newState.clubs = [];
        if (!Array.isArray(newState.visits)) newState.visits = seedVisits();
        if (!newState.activity) newState.activity = { president: '', members: [], activities: [] };
        if (!Array.isArray(newState.classes)) newState.classes = [];
        if (!newState.clubDept) newState.clubDept = { president: '', members: [] };
        if (!Array.isArray(newState.grades)) newState.grades = [];
        STATE = newState;
        save(); render();
        toast('✅ 数据导入成功，工作台已恢复');
      } catch (err) {
        toast('❌ 导入失败：文件格式不正确，请选择正确的备份文件');
      }
    };
    reader.readAsText(file);
    return;
  }
  const el = e.target.closest('[data-act="set-mat-status"]');
  if (el) {
    const s = STATE.students.find(x => x.id === el.dataset.sid); if (!s) return;
    const c = s.countries.find(x => x.id === el.dataset.cid); if (!c) return;
    const sc = (c.schools || []).find(x => x.id === el.dataset.schid); if (!sc) return;
    const m = (sc.materials || []).find(x => x.id === el.dataset.mid); if (!m) return;
    m.status = el.value; save(); render();
    return;
  }
  // 社团出勤
  const att = e.target.closest('[data-act="set-att"]');
  if (att) {
    const cl = (STATE.clubs || []).find(x => x.id === att.dataset.cid); if (!cl) return;
    const m = (cl.members || []).find(x => x.id === att.dataset.mid); if (!m) return;
    if (!m.attend) m.attend = {};
    m.attend[att.dataset.wid] = att.value;
    save();
    // 更新行样式，不整页重渲染避免下拉收起后抖动
    const tr = att.closest('tr');
    if (tr) tr.classList.toggle('att-absent', att.value === 'absent');
    // 只刷新出勤总结看板
    const board = document.getElementById('attendance-board');
    if (board && typeof attendanceBoard === 'function') {
      const html = attendanceBoard(STATE.clubs || []);
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      const fresh = tmp.firstElementChild;
      if (fresh) board.replaceWith(fresh);
    }
    return;
  }
});

// 进度滑块 / 截止时间（input 实时保存）
document.addEventListener('input', e => {
  const el = e.target.closest('[data-act="set-progress"]');
  if (el) {
    const s = STATE.students.find(x => x.id === el.dataset.sid);
    if (!s) return;
    const c = s.countries.find(x => x.id === el.dataset.cid);
    if (!c) return;
    const sc = (c.schools || []).find(x => x.id === el.dataset.schid);
    if (!sc) return;
    sc.progress = Number(el.value);
    save();
    const lbl = el.parentElement.querySelector('b');
    if (lbl) lbl.textContent = sc.progress + '%';
    if (sc.progress >= 100) {
      // 首次达到100%：自动进入后申请追踪并祝贺
      const wasThere = afterGet(s.id, sc.id);
      syncAfter();
      save();
      if (!wasThere) {
        toast('🎉 恭喜 ' + s.name + ' · ' + sc.name + ' 申请递交完成，已进入「后申请追踪」');
        render();
      } else {
        // 只更新徽标与已递交徽章，避免滑块跳动
        const nb = document.getElementById('badge-after');
        if (nb) nb.textContent = afterSchools().length;
      }
    }
    return;
  }
  const del = e.target.closest('[data-act="set-deadline"]');
  if (del) {
    const s = STATE.students.find(x => x.id === del.dataset.sid);
    if (!s) return;
    const c = s.countries.find(x => x.id === del.dataset.cid);
    if (!c) return;
    const sc = (c.schools || []).find(x => x.id === del.dataset.schid);
    if (!sc) return;
    sc.deadline = del.value;
    save();
  }
  // 大学来访：日期/时间实时保存
  const vDate = e.target.closest('[data-act="set-visit-date"]');
  if (vDate) {
    const g = (STATE.visits || []).find(x => x.id === vDate.dataset.cid); if (!g) return;
    const s = g.schools.find(x => x.id === vDate.dataset.sid); if (!s) return;
    s.visitDate = vDate.value; save();
    return;
  }
  const vTime = e.target.closest('[data-act="set-visit-time"]');
  if (vTime) {
    const g = (STATE.visits || []).find(x => x.id === vTime.dataset.cid); if (!g) return;
    const s = g.schools.find(x => x.id === vTime.dataset.sid); if (!s) return;
    s.visitTime = vTime.value; save();
    return;
  }
  // 大学来访：搜索实时过滤
  if (e.target && e.target.id === 'visit-search') {
    visitQuery = e.target.value;
    render();
    return;
  }
  const aftNote = e.target.closest('[data-aft-note]');
  if (aftNote) {
    const a = afterSchools().find(x => x.id === aftNote.dataset.aftNote); if (!a) return;
    a.note = aftNote.value; save();
  }
  const aftCond = e.target.closest('[data-aft-cond]');
  if (aftCond) {
    const a = afterSchools().find(x => x.id === aftCond.dataset.aftCond); if (!a) return;
    a.condition = aftCond.value; save();
  }
  // 社团字段编辑自动保存
  const clubField = e.target.closest('[data-club-field]');
  if (clubField) {
    const cl = (STATE.clubs || []).find(x => x.id === clubField.dataset.cid); if (!cl) return;
    cl[clubField.dataset.clubField] = clubField.value;
    save();
  }
  // 社团每周表现备注自动保存
  const weekNote = e.target.closest('[data-week-note]');
  if (weekNote) {
    const cl = (STATE.clubs || []).find(x => x.id === weekNote.dataset.weekNote); if (!cl) return;
    const w = (cl.weeks || []).find(x => x.id === weekNote.dataset.wid); if (!w) return;
    w.note = weekNote.value;
    save();
  }
  // 班级学生信息编辑自动保存
  const clsField = e.target.closest('[data-class-field]');
  if (clsField) {
    const cl = classesData().find(x => x.id === clsField.dataset.cid); if (!cl) return;
    const st = (cl.students || []).find(x => x.id === clsField.dataset.sid); if (!st) return;
    st[clsField.dataset.classField] = clsField.value;
    save();
  }
  // 学理会活动部：部长姓名自动保存
  const pres = e.target.closest('#act-president');
  if (pres) {
    const a = activityData();
    a.president = pres.value;
    save();
  }
  // 社团部：部长姓名自动保存
  const deptPres = e.target.closest('#dept-president');
  if (deptPres) {
    const d = clubDeptData();
    d.president = deptPres.value;
    save();
  }
});

// 回车快速添加
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.id === 'new-task') { e.preventDefault(); document.querySelector('[data-act="add-task"]').click(); }
  if (e.key === 'Enter' && e.target.id === 'new-student') { e.preventDefault(); document.querySelector('[data-act="add-student"]').click(); }
  if (e.key === 'Enter' && e.target.id === 'dl-name') { e.preventDefault(); document.querySelector('[data-act="add-deadline"]').click(); }
  if (e.key === 'Enter' && e.target.id === 'club-name') { e.preventDefault(); document.querySelector('[data-act="add-club"]').click(); }
  if (e.key === 'Enter' && e.target.id === 'act-officer') { e.preventDefault(); document.querySelector('[data-act="add-officer"]').click(); }
  if (e.key === 'Enter' && e.target.id === 'dept-officer') { e.preventDefault(); document.querySelector('[data-act="add-dept-member"]').click(); }
  if (e.key === 'Enter' && e.target.id === 'act-title') { e.preventDefault(); document.querySelector('[data-act="add-activity"]').click(); }
  if (e.key === 'Enter' && e.target.id === 'cls-name') { e.preventDefault(); document.querySelector('[data-act="add-class"]').click(); }
  if (e.key === 'Enter' && e.target.id === 'grade-name') { e.preventDefault(); document.querySelector('[data-act="add-grade"]').click(); }
  if (e.key === 'Enter' && e.target.hasAttribute && e.target.hasAttribute('data-class-input')) {
    e.preventDefault();
    const cid = e.target.getAttribute('data-class-input');
    document.querySelector(`[data-act="add-class-student"][data-cid="${cid}"]`).click();
  }
  if (e.key === 'Enter' && e.target.hasAttribute && e.target.hasAttribute('data-grade-task-input')) {
    e.preventDefault();
    const gid = e.target.getAttribute('data-grade-task-input');
    const aid = e.target.getAttribute('data-aid');
    const phase = e.target.getAttribute('data-phase');
    document.querySelector(`[data-act="add-grade-task"][data-gid="${gid}"][data-aid="${aid}"][data-phase="${phase}"]`).click();
  }
  if (e.key === 'Enter' && e.target.hasAttribute && e.target.hasAttribute('data-grade-title')) {
    e.preventDefault();
    const gid = e.target.getAttribute('data-grade-title');
    document.querySelector(`[data-act="add-grade-activity"][data-gid="${gid}"]`).click();
  }
});

// 挂件切换
function toggleWidget() {
  document.body.classList.toggle('widget');
  if (document.body.classList.contains('widget')) renderWidget();
}

/* ---------- 启动 ---------- */
function boot() {
  load();
  applyNavOrder();
  render();
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').then(reg => {
        // 检测到新版本 Service Worker：提示刷新
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (refreshing) return;
          refreshing = true;
          toast('✨ 已更新到新版本，正在刷新…');
          setTimeout(() => window.location.reload(), 600);
        });
        reg.addEventListener('updatefound', () => {
          const sw = reg.installing;
          if (sw) {
            sw.addEventListener('statechange', () => {
              if (sw.state === 'installed' && navigator.serviceWorker.controller) {
                // 已有旧版在控制，新版本已装好，等待接管
                setTimeout(() => window.location.reload(), 400);
              }
            });
          }
        });
      }).catch(() => {});
    });
  }
}
document.addEventListener('DOMContentLoaded', boot);
