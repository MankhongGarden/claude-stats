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
    automator: { en: 'AUTOMATOR', th: 'จอมทัพเอเจนต์', desc: 'แตก agent · วาง workflow · สั่งงานขนาน' },
    researcher: { en: 'RESEARCHER', th: 'นักแกะรอย', desc: 'ค้น · อ่าน · ขุดข้อมูลถึงต้นตอ' },
    coder: { en: 'CODER', th: 'ช่างตีโค้ด', desc: 'เขียน · แก้ · refactor ไฟล์จริง' },
    integrator: { en: 'INTEGRATOR', th: 'นักเชื่อมโลก', desc: 'ต่อ MCP · API · บริการภายนอก' },
    writer: { en: 'WRITER', th: 'นักเล่าเรื่อง', desc: 'อธิบาย · สรุป · ร่างเอกสาร' },
    pilot: { en: 'PILOT', th: 'นักบินเบราว์เซอร์', desc: 'ขับ browser ทำงานบนเว็บจริง' }
  };

  var CLASSES = {
    automator: ['Fleet Commander', 'ผู้บัญชาการกองทัพ AI — งานใหญ่แค่ไหนก็แตกทัพลุยพร้อมกัน'],
    researcher: ['Lore Hunter', 'นักล่าความรู้ — ไม่มีข้อมูลไหนซ่อนจากสายตา'],
    coder: ['Code Smith', 'ช่างหลอมโค้ด — เสกระบบจากศูนย์'],
    integrator: ['Realm Linker', 'ผู้เชื่อมทุกอาณาจักร API เข้าด้วยกัน'],
    writer: ['Chronicle Keeper', 'ผู้จดบันทึกแห่งยุค'],
    pilot: ['Web Navigator', 'นักบินผู้พิชิตทุกหน้าเว็บ']
  };

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

  function level(effort) {
    var e = typeof effort === 'number' && isFinite(effort) && effort > 0 ? effort : 0;
    return Math.max(1, Math.floor(Math.sqrt(e / 25)));
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
      return payload;
    } catch (e) {
      return null;
    }
  }

  return {
    AXES: AXES,
    META: META,
    CLASSES: CLASSES,
    REF: REF,
    classifyTool: classifyTool,
    scoreAxes: scoreAxes,
    level: level,
    topAxis: topAxis,
    encodeShare: encodeShare,
    decodeShare: decodeShare
  };
});
