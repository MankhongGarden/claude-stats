(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ClaudeScoring = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var AXES = ['automator', 'researcher', 'coder', 'integrator', 'writer', 'pilot'];

  var META = {
    automator: { en: 'AUTOMATOR', th: 'จอมทัพเอเจนต์', desc: 'แตก agent · วาง workflow · สั่งงานขนาน', descEn: 'spawn agents · orchestrate workflows · run in parallel' },
    researcher: { en: 'RESEARCHER', th: 'นักแกะรอย', desc: 'ค้น · อ่าน · ขุดข้อมูลถึงต้นตอ', descEn: 'search · read · dig to the source' },
    coder: { en: 'CODER', th: 'ช่างตีโค้ด', desc: 'เขียน · แก้ · refactor ไฟล์จริง', descEn: 'write · edit · refactor real files' },
    integrator: { en: 'INTEGRATOR', th: 'นักเชื่อมโลก', desc: 'ต่อ MCP · API · บริการภายนอก', descEn: 'wire up MCP · APIs · external services' },
    writer: { en: 'WRITER', th: 'นักเล่าเรื่อง', desc: 'อธิบาย · สรุป · ร่างเอกสาร', descEn: 'explain · summarize · draft documents' },
    pilot: { en: 'PILOT', th: 'นักบินเบราว์เซอร์', desc: 'ขับ browser ทำงานบนเว็บจริง', descEn: 'drive a real browser on the live web' }
  };

  var CLASSES = {
    automator: ['Fleet Commander', 'ผู้บัญชาการกองทัพ AI — งานใหญ่แค่ไหนก็แตกทัพลุยพร้อมกัน', 'Commander of an AI army — no job too big to fan out'],
    researcher: ['Lore Hunter', 'นักล่าความรู้ — ไม่มีข้อมูลไหนซ่อนจากสายตา', 'No knowledge stays hidden from this hunter'],
    coder: ['Code Smith', 'ช่างหลอมโค้ด — เสกระบบจากศูนย์', 'Forges entire systems from nothing'],
    integrator: ['Realm Linker', 'ผู้เชื่อมทุกอาณาจักร API เข้าด้วยกัน', 'Binds every API realm together'],
    writer: ['Chronicle Keeper', 'ผู้จดบันทึกแห่งยุค', 'Keeper of the records of the age'],
    pilot: ['Web Navigator', 'นักบินผู้พิชิตทุกหน้าเว็บ', 'Master pilot of every webpage']
  };

  // Behavioral badges — computed from activity timestamps (the user's own local time).
  var BADGES = {
    'night-owl': { emoji: '🦉', en: 'Night Owl', th: 'สายดึก' },
    'early-bird': { emoji: '🌅', en: 'Early Bird', th: 'นกตื่นเช้า' },
    'weekend-warrior': { emoji: '🎮', en: 'Weekend Warrior', th: 'นักรบวันหยุด' },
    'marathoner': { emoji: '🏃', en: 'Marathoner', th: 'นักวิ่งมาราธอน' },
    'streak': { emoji: '🔥', en: 'Streak', th: 'ทำต่อเนื่อง' }
  };
  var BADGE_KEYS = Object.keys(BADGES);

  var REF = {
    cli: { automator: 25000, researcher: 15000, coder: 15000, integrator: 8000, writer: 4000, pilot: 4000 },
    web: { automator: 1200, researcher: 1500, coder: 800, integrator: 400, writer: 2500, pilot: 100 }
  };

  var CODER_TOOLS = { Edit: 1, Write: 1, NotebookEdit: 1, MultiEdit: 1 };
  var RESEARCHER_TOOLS = { WebSearch: 1, WebFetch: 1, Read: 1, Grep: 1, Glob: 1 };
  var AUTOMATOR_TOOLS = {
    Agent: 1, Task: 1, Workflow: 1, Skill: 1, ScheduleWakeup: 1,
    CronCreate: 1, TaskCreate: 1, Bash: 1, PowerShell: 1
  };
  var PILOT_PREFIXES = ['mcp__chrome-devtools', 'mcp__claude-in-chrome', 'mcp__playwright', 'mcp__browserbase'];

  function classifyTool(name) {
    if (typeof name !== 'string' || name.length === 0) return null;
    if (CODER_TOOLS[name] === 1) return 'coder';
    if (RESEARCHER_TOOLS[name] === 1) return 'researcher';
    if (AUTOMATOR_TOOLS[name] === 1) return 'automator';
    if (name.indexOf('mcp__') === 0) {
      for (var i = 0; i < PILOT_PREFIXES.length; i++) {
        if (name.indexOf(PILOT_PREFIXES[i]) === 0) return 'pilot';
      }
      return 'integrator';
    }
    return null;
  }

  function scoreAxes(rawUnits, source) {
    var refs = REF[source === 'web' ? 'web' : 'cli'];
    var out = {};
    for (var i = 0; i < AXES.length; i++) {
      var axis = AXES[i];
      var x = rawUnits && typeof rawUnits[axis] === 'number' && isFinite(rawUnits[axis]) ? rawUnits[axis] : 0;
      if (x < 0) x = 0;
      out[axis] = Math.min(100, Math.round(100 * Math.sqrt(x / refs[axis])));
    }
    return out;
  }

  // Self-relative "shape" scoring (used by the web path): the dominant axis is the
  // reference (100), the rest are proportional. Volume is carried by the level, not the
  // axis heights — so a casual user still gets a full, varied radar (like an RPG class
  // whose stat *shape* is the same at level 5 and 50). A small floor keeps present-but-
  // minor axes visible instead of collapsing to a degenerate spike.
  function scoreAxesShape(rawUnits) {
    var vals = [], max = 0;
    for (var i = 0; i < AXES.length; i++) {
      var x = rawUnits && typeof rawUnits[AXES[i]] === 'number' && isFinite(rawUnits[AXES[i]]) ? rawUnits[AXES[i]] : 0;
      if (x < 0) x = 0;
      vals.push(x);
      if (x > max) max = x;
    }
    var out = {};
    for (var j = 0; j < AXES.length; j++) {
      if (max <= 0) { out[AXES[j]] = 0; continue; }
      var s = Math.pow(vals[j] / max, 0.7) * 100;
      if (vals[j] > 0 && s < 12) s = 12;
      out[AXES[j]] = Math.round(Math.min(100, s));
    }
    return out;
  }

  function level(effort) {
    var e = typeof effort === 'number' && isFinite(effort) && effort > 0 ? effort : 0;
    return Math.max(1, Math.floor(Math.sqrt(e / 25)));
  }

  // stamps: array of ISO timestamp strings (or anything Date can parse). Returns
  // { badges: [key,...], streak: <longest consecutive-day run> }. Uses local time so
  // the badges reflect the user's own schedule. Defensive: ignores unparseable stamps.
  function computeBadges(stamps) {
    var hourCount = 0, night = 0, early = 0, weekend = 0, total = 0;
    var perDay = {};
    for (var i = 0; i < (stamps ? stamps.length : 0); i++) {
      var d = new Date(stamps[i]);
      var ms = d.getTime();
      if (!ms && ms !== 0) continue;
      if (isNaN(ms)) continue;
      total++;
      var h = d.getHours();
      if (h >= 0 && h < 5) night++;
      if (h >= 5 && h < 9) early++;
      var dow = d.getDay();
      if (dow === 0 || dow === 6) weekend++;
      var key = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
      perDay[key] = (perDay[key] || 0) + 1;
      hourCount++;
    }
    var badges = [];
    if (total >= 20) {
      if (night / total >= 0.15) badges.push('night-owl');
      else if (early / total >= 0.15) badges.push('early-bird');
      if (weekend / total >= 0.35) badges.push('weekend-warrior');
    }
    // marathoner: a single day with a lot of activity
    var busiest = 0;
    for (var k in perDay) { if (perDay[k] > busiest) busiest = perDay[k]; }
    if (busiest >= 40) badges.push('marathoner');
    // streak: longest run of consecutive calendar days
    var dayKeys = Object.keys(perDay).map(function (s) {
      var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]).getTime();
    }).sort(function (a, b) { return a - b; });
    var DAY = 86400000, best = dayKeys.length ? 1 : 0, run = best;
    for (var j = 1; j < dayKeys.length; j++) {
      if (Math.round((dayKeys[j] - dayKeys[j - 1]) / DAY) === 1) { run++; if (run > best) best = run; }
      else run = 1;
    }
    if (best >= 3) badges.push('streak');
    return { badges: badges, streak: best };
  }

  function topAxis(scores) {
    var best = AXES[0];
    var bestScore = -Infinity;
    for (var i = 0; i < AXES.length; i++) {
      var axis = AXES[i];
      var s = scores && typeof scores[axis] === 'number' && isFinite(scores[axis]) ? scores[axis] : 0;
      if (s > bestScore) {
        bestScore = s;
        best = axis;
      }
    }
    return best;
  }

  function toBase64(str) {
    if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
      return Buffer.from(str, 'utf8').toString('base64');
    }
    return btoa(unescape(encodeURIComponent(str)));
  }

  function fromBase64(b64) {
    if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
      return Buffer.from(b64, 'base64').toString('utf8');
    }
    return decodeURIComponent(escape(atob(b64)));
  }

  function encodeShare(payload) {
    var json = JSON.stringify(payload);
    return toBase64(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function decodeShare(str) {
    try {
      if (typeof str !== 'string' || str.length === 0) return null;
      var b64 = str.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4 !== 0) b64 += '=';
      var payload = JSON.parse(fromBase64(b64));
      if (!payload || typeof payload !== 'object' || payload.v !== 1) return null;
      if (!payload.stats || typeof payload.stats !== 'object') return null;
      var clean = {};
      for (var i = 0; i < AXES.length; i++) {
        var axis = AXES[i];
        var v = payload.stats[axis];
        if (typeof v !== 'number' || !isFinite(v)) return null;
        clean[axis] = Math.min(100, Math.max(0, Math.round(v)));
      }
      payload.stats = clean;
      payload.src = payload.src === 'web' ? 'web' : 'cli';
      var cleanTotals = {};
      if (payload.totals && typeof payload.totals === 'object') {
        for (var key in payload.totals) {
          var t = Number(payload.totals[key]);
          if (isFinite(t) && t >= 0 && t <= 1e9) cleanTotals[key] = Math.round(t);
        }
      }
      payload.totals = cleanTotals;
      // badges: whitelist to known keys, dedupe, cap
      var cleanBadges = [];
      if (Array.isArray(payload.badges)) {
        for (var bi = 0; bi < payload.badges.length && cleanBadges.length < 8; bi++) {
          var bk = payload.badges[bi];
          if (BADGE_KEYS.indexOf(bk) !== -1 && cleanBadges.indexOf(bk) === -1) cleanBadges.push(bk);
        }
      }
      payload.badges = cleanBadges;
      var st = Number(payload.streak);
      payload.streak = (isFinite(st) && st > 0) ? Math.min(999, Math.round(st)) : 0;
      return payload;
    } catch (e) {
      return null;
    }
  }

  return {
    AXES: AXES,
    META: META,
    CLASSES: CLASSES,
    BADGES: BADGES,
    BADGE_KEYS: BADGE_KEYS,
    REF: REF,
    classifyTool: classifyTool,
    scoreAxes: scoreAxes,
    scoreAxesShape: scoreAxesShape,
    computeBadges: computeBadges,
    level: level,
    topAxis: topAxis,
    encodeShare: encodeShare,
    decodeShare: decodeShare
  };
});
