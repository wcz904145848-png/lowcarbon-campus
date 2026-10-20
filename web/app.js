/* 碳中和园 · 玩法内核 + 渲染（纯 JS，无依赖） */
(function () {
  const D = DATA;
  const KEY = "csc_save_v1";
  const app = document.getElementById("app");
  const toastEl = document.getElementById("toast");
  const stage = document.getElementById("stage");

  /* ---------------- 缩放 ---------------- */
  function fit() {
    const s = Math.min(window.innerWidth / 1080, window.innerHeight / 1920);
    stage.style.transform = "scale(" + s + ")";
    stage.style.left = Math.max(0, (window.innerWidth - 1080 * s) / 2) + "px";
    stage.style.top = Math.max(0, (window.innerHeight - 1920 * s) / 2) + "px";
  }
  window.addEventListener("resize", fit);

  /* ---------------- 状态 ---------------- */
  function fresh() {
    return {
      v: 2, day: 1, energy: D.energyPerDay,
      carbon: 0, growth: 0, coins: 320, contrib: 0,
      level: 1, exp: 0,
      seeds: { sakura: 2, sunflower: 2 },
      bag: {},
      petals: {},
      codex: { sakura: true, sunflower: true },
      plots: Array.from({ length: D.plotCount }, function () { return { sp: null, gp: 0 }; }),
      doneToday: [],
      doneOnce: [],
      coopClaimed: false,
      visited: [],
      ended: false
    };
  }
  let S = fresh();
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const o = JSON.parse(raw);
      if (o && o.v === 2) S = Object.assign(fresh(), o);
    } catch (e) {}
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
  }

  /* ---------------- 运行时 ---------------- */
  let stack = ["explore"];
  let sheet = null;
  let taskTab = "all";
  let sel = 0;
  let pending = null;
  let locFilter = null;
  let bubbleOn = false;

  /* ---------------- 工具 ---------------- */
  const n2 = (x) => (Math.round(x * 100) / 100).toFixed(2);
  const n1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
  function stageOf(gp) {
    let s = 0;
    for (let i = 0; i < D.stageAt.length; i++) if (gp >= D.stageAt[i]) s = i;
    return s;
  }
  function nextAt(gp) {
    const s = stageOf(gp);
    return s >= 4 ? null : D.stageAt[s + 1];
  }
  const CROP_MAX = D.cropStageAt[D.cropStageAt.length - 1];
  /* 空农田底图（1024x1536）上的 16 个地块中心，单位为百分比 */
  const PLOT_POS = [
    [12.13, 49.90], [83.06, 42.81], [40.46, 42.45], [66.39, 44.38],
    [26.39, 46.25], [52.41, 47.92], [78.61, 49.58], [38.43, 51.56],
    [64.72, 53.23], [90.93, 54.84], [24.07, 55.21], [50.56, 56.88],
    [77.31, 58.65], [36.20, 60.73], [63.24, 62.50], [48.52, 66.41]
  ];
  const CROP_KEYS = { hua: "樱花", ying: "樱树", yang: "杨树" };
  function cropImg(key, stage) { return "assets/crop_" + key + "_" + stage + ".png"; }
  function cropOf(sp) { return sp; }
  function cropStagePct(gp) { return Math.min(100, gp / CROP_MAX * 100); }


  function cropStage(gp) {
    let s = 0;
    for (let i = 0; i < D.cropStageAt.length; i++) if (gp >= D.cropStageAt[i]) s = i;
    return s;
  }
  function cropArt(sp, gp) {
    const st = cropStage(gp);
    if (D.plants[sp] && D.plants[sp].stageArt) return "assets/st_" + sp + "_" + st + ".png";
    return "assets/" + D.plants[sp].art;
  }
  function unlockedCount() { return Math.min(D.plotCount, D.basePlots + (S.level - 1) * 2); }
  function expNeed() { return S.level >= 5 ? 0 : D.expNeed[S.level - 1]; }
  function addExp(n) {
    S.exp += n;
    while (S.level < 5 && S.exp >= D.expNeed[S.level - 1]) {
      S.exp -= D.expNeed[S.level - 1];
      S.level += 1;
      toast("升级！Lv." + S.level + " · 解锁一块新地");
    }
  }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("on");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toastEl.classList.remove("on"), 1800);
  }
  function go(name) { stack.push(name); render(); }
  function back() { if (stack.length > 1) stack.pop(); render(); }
  function root(name) { stack = [name]; render(); }
  function cur() { return stack[stack.length - 1]; }

  /* ---------------- 图标 ---------------- */
  const ICON = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/></svg>',
    task: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3.5" width="16" height="17" rx="3"/><path d="M8.5 9.5h7M8.5 14h4.5"/></svg>',
    leaf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 4C10 4 4 9 4 16c0 2 1 4 1 4s2-1 4-1c7 0 11-6 11-15Z"/><path d="M9 20c1.5-5 4-8 8-10"/></svg>',
    people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17.5" cy="9.5" r="2.4"/><path d="M21 20c0-2.6-1.6-4.7-4-5.4"/></svg>'
  };

  /* ---------------- 通用片段 ---------------- */
  function topbar(title, opt) {
    opt = opt || {};
    return '<div class="topbar">' +
      (opt.back ? '<button class="icbtn" data-act="back">‹</button>' : '<span style="width:78px;flex:0 0 auto"></span>') +
      '<h1><span style="font-size:40px">🌿</span>' + title + '</h1>' +
      '<span class="spacer"></span>' +
      (opt.coins === false ? '' : '<div class="pill"><span class="coin"></span>' + S.coins + '</div>') +
      '</div>';
  }
  function tabbar(active) {
    const items = [["explore", "校园", "nav_home"], ["tasks", "任务", "nav_task"], ["garden", "花园", "nav_garden"], ["friends", "社交", "nav_social"]];
    return '<nav class="tabbar">' + items.map(function (it) {
      return '<button class="' + (active === it[0] ? "on" : "") + '" data-act="tab:' + it[0] + '"><img src="assets/' + it[2] + '.png" alt=""><span>' + it[1] + '</span></button>';
    }).join("") + '</nav>';
  }
  function plantArt(sp, gp) {
    const st = stageOf(gp);
    if (D.plants[sp] && D.plants[sp].stageArt) return "assets/st_" + sp + "_" + st + ".png";
    return "assets/" + D.plants[sp].art;
  }
  function energyDots() {
    let s = '<div style="display:flex;gap:10px;align-items:center">';
    for (let i = 0; i < D.energyPerDay; i++) {
      s += '<i style="width:20px;height:20px;border-radius:999px;display:block;background:' +
        (i < S.energy ? "#4CAF85" : "#DCE6DA") + '"></i>';
    }
    return s + '<span class="muted" style="margin-left:8px">' + S.energy + "/" + D.energyPerDay + '</span></div>';
  }
  function progressBar(pct) {
    return '<div class="progress"><i style="width:' + Math.max(0, Math.min(100, pct)) + '%"></i></div>';
  }

  /* ---------------- 屏幕 ---------------- */
  const SCREENS = {};

  /* 星露谷式行走地图 */
  SCREENS.explore = function () {
    return '<div class="screen explore">' +
      '<canvas id="world" width="1080" height="1920"></canvas>' +
      '<div class="whud">' +
        '<div class="pill"><span class="coin"></span>' + S.coins + '</div>' +
        '<div class="pill"><span class="leafdot"></span>' + n2(S.carbon) + ' kg</div>' +
        '<div class="pill">第 ' + S.day + '/' + D.dayLimit + ' 天</div>' +
      '</div>' +
      '<div class="wtip">点击地面行走 · 也可用摇杆或 WASD · 走近建筑轻点进入</div>' +
      tabbar("explore") + '</div>';
  };

  /* 进门后的分流 */
  function enterDoor(d) {
    if (d.kind === "loc") {
      locFilter = d.loc; taskTab = "all"; root("tasks");
      toast(d.label + " · 本地任务");
    } else if (d.kind === "codex") {
      go("codex");
    } else if (d.kind === "scenic") {
      const key = "door:" + d.id;
      if (S.visited.indexOf(key) >= 0) { toast("今天已经来过了"); return; }
      S.visited.push(key); S.coins += 2; save();
      toast("打卡「" + d.label + "」采集到 ◉2");
      render();
    }
  }

  SCREENS.map = function () {
    const pct = Math.min(100, S.carbon / D.goalCarbon * 100);
    return '<div class="screen">' + topbar("碳中和园", { back: false }) +
      '<div class="body">' +
        '<div class="mapcard"><img src="assets/scene_map.png" alt="">' +
          DATA.locations.map(function (l) {
            return '<button class="hotspot" style="left:' + l.x + '%;top:' + l.y + '%" data-act="loc:' + l.id + '"><i></i>' + l.name + '</button>';
          }).join("") +
          '<button class="hotspot" style="left:74%;top:74%;background:#2F8D6A;color:#fff" data-act="go:garden"><i style="background:#BFF0D6"></i>进入花园</button>' +
        '</div>' +
        '<div class="statline">' +
          '<div class="stat"><div class="k">累计估算减排</div><div class="v">' + n2(S.carbon) + '<small>kg</small></div></div>' +
          '<div class="stat"><div class="k">成长值</div><div class="v" style="color:#2F8D6A">' + S.growth + '</div></div>' +
          '<div class="stat"><div class="k">当前天数</div><div class="v">' + S.day + '<small>/' + D.dayLimit + ' 天</small></div></div>' +
        '</div>' +
        '<div class="card" style="padding:30px 32px;margin-top:24px">' +
          '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:16px">' +
            '<b style="font-size:31px">减排目标</b><span class="muted">' + n2(S.carbon) + " / " + n2(D.goalCarbon) + ' kg</span></div>' +
          progressBar(pct) +
          '<div class="note">只读碳账本。这里只进不清，任何社交与消费都不会改动它。</div>' +
        '</div>' +
        '<div class="two" style="margin-top:22px">' +
          '<button class="btn ghost" data-act="go:coop" style="height:96px;font-size:30px">校园生态共建</button>' +
          '<button class="btn ghost" data-act="go:codex" style="height:96px;font-size:30px">植物图鉴</button>' +
        '</div>' +
      '</div>' + tabbar("map") + '</div>';
  };

  SCREENS.tasks = function () {
    const all = D.tasks;
    let list = all;
    if (taskTab === "week") list = all;
    if (taskTab === "event") list = D.events;
    if (locFilter && taskTab !== "event") list = list.filter(function (t) { return t.loc === locFilter; });
    const rows = list.map(function (t) {
      const used = t.once ? S.doneOnce.indexOf(t.id) >= 0 : S.doneToday.indexOf(t.id) >= 0;
      const d = (t.qty) * (D.factors[t.base].kg - D.factors[t.act].kg);
      return '<div class="task' + (used ? " done" : "") + '">' +
        '<div class="thumb">' + t.icon + '</div>' +
        '<div class="meta"><div class="t">' + t.title + '</div>' +
          '<div class="s">' + t.sub + ' · 约 ' + n2(d) + ' kg</div>' +
          '<span class="reward"><span style="color:#DE9F35">◉</span>+' + t.coins + '</span></div>' +
        (used ? '<button class="go" disabled>已完成</button>'
              : (S.energy <= 0 ? '<button class="go" data-act="noEnergy">精力不足</button>'
                                : '<button class="go" data-act="task:' + t.id + '">去完成</button>')) +
        '</div>';
    }).join("");

    return '<div class="screen">' + topbar("低碳任务", { back: false }) +
      '<div class="body">' +
        (locFilter ? '<div class="locbar"><span class="chip">' + locFilter + '</span>' +
          '<button data-act="clearLoc">查看全部任务</button></div>' : '') +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin:4px 0 18px">' +
          '<span class="muted">第 ' + S.day + ' / ' + D.dayLimit + ' 天</span>' + energyDots() + '</div>' +
        '<div class="tabs">' +
          '<button class="' + (taskTab === "all" ? "on" : "") + '" data-act="tbtab:all">全部</button>' +
          '<button class="' + (taskTab === "week" ? "on" : "") + '" data-act="tbtab:week">本周任务</button>' +
          '<button class="' + (taskTab === "event" ? "on" : "") + '" data-act="tbtab:event">活动任务</button>' +
        '</div>' + rows +
        (S.energy <= 0 ? '<button class="btn" data-act="endDay" style="margin-top:10px">结束今天，进入第 ' + Math.min(D.dayLimit, S.day + 1) + ' 天</button>' : '') +
      '</div>' + tabbar("tasks") + '</div>';
  };

  SCREENS.feedback = function () {
    if (!pending) return SCREENS.tasks();
    const t = pending.task, q = pending.qty, f = D.factors;
    const base = f[t.base], act = f[t.act];
    const d = q * (base.kg - act.kg);
    const g = Math.floor(d / 0.1);
    return '<div class="screen">' + topbar("碳减排反馈", { back: false, coins: false }) +
      '<div class="body">' +
        '<div class="hero"><img src="assets/scene_feedback.png" alt=""></div>' +
        '<div style="margin-top:30px"><b style="font-size:32px">本次「' + t.title + '」估算减排</b></div>' +
        '<div class="center" style="align-items:flex-start;margin-top:14px">' +
          '<div class="big" style="color:#2F8D6A">' + n2(d) + '<small>kg CO₂e</small></div>' +
        '</div>' +
        '<div class="calcrows">' +
          '<div class="calcrow"><span class="k">减排方式</span><span class="v">' + act.name + '</span></div>' +
          '<div class="calcrow"><span class="k">活动量</span><span class="v">' + q + ' ' + t.kind + '</span></div>' +
          '<div class="calcrow"><span class="k">基准情景</span><span class="v">' + base.name + ' · ' + base.kg.toFixed(3) + ' kg/' + base.unit + '</span></div>' +
          '<div class="calcrow"><span class="k">实际排放</span><span class="v">' + act.name + ' · ' + act.kg.toFixed(3) + ' kg/' + act.unit + '</span></div>' +
        '</div>' +
        '<div class="formula">' + q + ' ' + t.kind + ' ×（' + base.kg.toFixed(3) + ' − ' + act.kg.toFixed(3) + '）= <b>' + n2(d) + ' kg</b>' +
          (base.demo ? '<br><span style="font-size:23px;color:#84958C">基准系数为演示假设，非正式校园核算系数</span>' : '') +
        '</div>' +
        '<div class="card" style="padding:24px 28px;margin-top:22px;display:flex;justify-content:space-between;align-items:center">' +
          '<div><div class="muted">获得游戏成长值</div><div style="font-size:44px;font-weight:800;color:#2F8D6A">+' + g + '</div></div>' +
          '<div style="text-align:right"><div class="muted">碳账本（只读）</div><div style="font-size:34px;font-weight:800">→ ' + n2(S.carbon + d) + ' kg</div></div>' +
        '</div>' +
        '<button class="btn" data-act="claim" style="margin-top:26px">确认并领取 ◉+' + t.coins + '</button>' +
        '<div class="note">成长值由减排量换算（每 0.1 kg = 1 点），只用于游戏内养成；碳账本不会因游戏行为被消耗。</div>' +
      '</div></div>';
  };

  SCREENS.taskdone = function () {
    const reached = S.carbon >= D.goalCarbon;
    return '<div class="screen">' + topbar("任务完成", { back: false, coins: false }) +
      '<div class="body center" style="justify-content:center;padding-top:60px">' +
        '<div style="width:220px;height:220px;border-radius:999px;background:#E7F2EA;display:grid;place-items:center;font-size:110px">✓</div>' +
        '<h2 style="font-size:52px;font-weight:800;margin-top:44px">任务已记录</h2>' +
        '<div class="muted" style="margin-top:14px;font-size:30px">获得成长贡献 <b style="color:#2F8D6A;font-size:38px">+8</b></div>' +
        '<div class="card" style="width:100%;padding:30px 32px;margin-top:40px;text-align:left">' +
          '<div class="calcrow" style="border:none;padding:12px 0"><span class="k">碳账本</span><span class="v">' + n2(S.carbon) + ' kg</span></div>' +
          '<div class="calcrow" style="border:none;padding:12px 0"><span class="k">成长值</span><span class="v">' + S.growth + '</span></div>' +
          '<div class="calcrow" style="border:none;padding:12px 0"><span class="k">金币</span><span class="v">' + S.coins + '</span></div>' +
        '</div>' +
        '<button class="btn" data-act="' + (reached ? "toResult" : "backTasks") + '" style="margin-top:40px">' +
          (reached ? "目标已达成，查看结算" : "领取并返回") + '</button>' +
      '</div></div>';
  };

  SCREENS.planted = function () {
    const p = S.plots[sel] || { sp: "sakura", gp: 0 };
    const sp = p.sp || "sakura";
    return '<div class="screen">' + topbar("种植成功", { back: false, coins: false }) +
      '<div class="body center">' +
        '<h2 style="font-size:46px;font-weight:800;margin:16px 0 8px">' + D.plants[sp].name + ' 已种下</h2>' +
        '<div class="muted" style="margin-bottom:22px">浇水或施肥让它长大</div>' +
        '<img src="assets/scene_planted.png" style="width:640px;border-radius:40px;display:block;box-shadow:var(--shadow)" alt="">' +
        '<div style="margin-top:30px"><span class="tag">' + D.plants[sp].season + '</span><span class="tag">' + D.plants[sp].type + '</span></div>' +
        '<button class="btn" data-act="go:garden" style="margin-top:36px">返回农场</button>' +
      '</div></div>';
  };

  SCREENS.garden = function () {
    const u = unlockedCount();
    const need = expNeed();

    let plots = "";
    for (let i = 0; i < D.plotCount; i++) {
      const pos = PLOT_POS[i];
      const p = S.plots[i] || { sp: null, gp: 0 };
      const locked = i >= u;
      let inner = "";
      if (locked) {
        inner = '<span class="plk">🔒</span>';
      } else if (!p.sp) {
        inner = '<span class="padd">＋</span>';
      } else {
        const st = cropStage(p.gp);
        const ready = p.gp >= CROP_MAX;
        inner = '<img src="' + cropImg(p.sp, st) + '" alt="">' +
                (ready ? '<span class="prdy">✓</span>' : '');
      }
      plots += '<button class="fplot' + (i === sel ? " on" : "") + (locked ? " lock" : "") +
        '" style="left:' + pos[0] + '%;top:' + pos[1] + '%" data-act="sel:' + i + '">' + inner + '</button>';
    }

    const cur = S.plots[sel] || { sp: null, gp: 0 };
    const st = cur.sp ? cropStage(cur.gp) : 0;
    const ready = !!(cur.sp && cur.gp >= CROP_MAX);
    const showBubble = bubbleOn && !!cur.sp;

    const bubble = showBubble
      ? '<div class="pbubble" style="left:' + PLOT_POS[sel][0] + '%;top:' + PLOT_POS[sel][1] + '%">' +
          '<div class="pbt">' + D.cropNames[cur.sp] + '</div>' +
          '<div class="pbs">' + D.stages[st] + '</div>' +
          '<div class="pbar"><i style="width:' + Math.min(100, cur.gp / CROP_MAX * 100) + '%"></i></div>' +
          '<div class="pbn">' + cur.gp + ' / ' + CROP_MAX + (ready ? ' · 可收获' : '') + '</div>' +
        '</div>'
      : "";

    return '<div class="screen farmscene" style="position:absolute;inset:0;background:#BFDDB6">' +
      '<div class="farmwrap"></div>' +
      '<div class="plotlayer">' + plots + '</div>' +
      (showBubble ? '<div class="bubblelayer" data-act="closeBubble">' + bubble + '</div>' : '') +
      '<div class="fhud">' +
        '<div class="flv">Lv.' + S.level + '</div>' +
        '<div class="fbar"><i style="width:' + (need ? Math.min(100, S.exp / need * 100) : 100) + '%"></i></div>' +
        '<div class="fcoin"><span class="coin"></span>' + S.coins + '</div>' +
        '<button class="fshop" data-act="goShop">商店</button>' +
      '</div>' +
      '<div class="fbot">' +
        '<span>' + (need ? ("经验 " + S.exp + "/" + need) : "已满级") + '</span>' +
        '<span class="fsep">|</span>' +
        '<span>已解锁 ' + u + '/16</span>' +
      '</div>' +
      '<div class="factbar">' +
        '<button data-act="openPlant"><img src="assets/ic_seed.png" alt=""><span>种子</span></button>' +
        '<button data-act="water"><img src="assets/ic_water.png" alt=""><span>浇水 ' + D.waterCost + '</span></button>' +
        '<button data-act="fert"><img src="assets/ic_crop.png" alt=""><span>施肥 ' + D.fertCost + '</span></button>' +
        '<button data-act="harvest"><img src="assets/ic_deco.png" alt=""><span>收获</span></button>' +
        '<button data-act="goBag"><img src="assets/ic_bag.png" alt=""><span>背包</span></button>' +
      '</div>' +
      tabbar("garden") + '</div>';
  };

  SCREENS.bag = function () {
    const keys = Object.keys(S.bag).filter(function (k) { return S.bag[k] > 0; });
    const total = keys.reduce(function (a, k) { return a + S.bag[k] * D.cropYield[k]; }, 0);
    const rows = keys.length
      ? keys.map(function (k) {
          return '<div class="row">' +
            '<img src="' + cropImg(k, 4) + '" style="width:92px;height:92px;object-fit:contain" alt="">' +
            '<div class="meta"><div class="t">' + D.cropNames[k] + ' ×' + S.bag[k] + '</div>' +
              '<div class="s">单价 ' + D.cropYield[k] + ' 金币 · 合计 ' + (S.bag[k] * D.cropYield[k]) + '</div></div>' +
            '<button class="btn sm" data-act="sell:' + k + '">出售</button></div>';
        }).join("")
      : '<div class="emptybag">背包是空的<br><span>去农场收获一些作物吧</span></div>';
    return '<div class="screen">' + topbar("背包", { back: true }) +
      '<div class="body">' + rows +
        (keys.length ? '<button class="btn gold" data-act="sellAll" style="margin-top:22px">全部出售 · ◉' + total + '</button>' : '') +
        '<div class="note">收获的作物先放进背包，出售后才变成金币。</div>' +
      '</div></div>';
  };

  SCREENS.shop = function () {
    const rows = D.cropSet.map(function (k) {
      const own = S.seeds[k] || 0;
      return '<div class="row">' +
        '<img src="' + cropImg(k, 3) + '" style="width:96px;height:96px;object-fit:contain" alt="">' +
        '<div class="meta"><div class="t">' + D.cropNames[k] + '种子</div>' +
          '<div class="s">收获 +' + D.cropYield[k] + ' 金币 · +' + D.cropExp[k] + ' 经验 · 持有 ' + own + '</div></div>' +
        '<button class="btn sm" data-act="buySeed:' + k + '">◉' + D.cropPrice[k] + '</button></div>';
    }).join("");
    return '<div class="screen">' + topbar("种子商店", { back: true }) +
      '<div class="body">' + rows +
        '<div class="note">金币来自完成任务与收获。先把地种满，收获得越多。</div>' +
      '</div></div>';
  };

  SCREENS.blindbox = function () {
    return '<div class="screen">' + topbar("植物盲盒", { back: true }) +
      '<div class="body center" style="justify-content:center">' +
        '<img src="assets/gift.png" style="width:620px;display:block" alt="">' +
        '<h2 style="font-size:44px;font-weight:800;margin-top:20px">神秘植物种子</h2>' +
        '<div class="muted" style="margin-top:12px">可能开出图鉴里还没有的物种</div>' +
        '<button class="btn gold" data-act="openbox" style="margin-top:44px">打开盲盒 · ◉' + D.boxCost + '</button>' +
      '</div></div>';
  };

  SCREENS.newplant = function () {
    const sp = pending && pending.got ? pending.got : "sakura";
    const p = D.plants[sp];
    return '<div class="screen">' + topbar("获得新植物", { back: false, coins: false }) +
      '<div class="body center">' +
        '<h2 style="font-size:44px;font-weight:800;margin:20px 0 30px">恭喜获得新植物！</h2>' +
        '<img src="assets/scene_planted.png" style="width:620px;border-radius:40px;display:block;box-shadow:var(--shadow)" alt="">' +
        '<h2 style="font-size:52px;font-weight:800;margin-top:34px">' + p.name + '</h2>' +
        '<div style="margin-top:16px"><span class="tag">' + p.season + '</span><span class="tag">' + p.type + '</span></div>' +
        '<button class="btn" data-act="go:garden" style="margin-top:44px">放入花园</button>' +
      '</div></div>';
  };

  SCREENS.exchange = function () {
    const rows = D.npcs.map(function (n) {
      const want = D.plants[n.want].name, give = D.plants[n.seed].name;
      const have = S.petals[n.want] || 0;
      return '<div class="row">' +
        '<div class="ava"><img src="assets/' + n.img + '" alt=""></div>' +
        '<div class="meta"><div class="t">' + n.name + '</div>' +
          '<div class="s">' + want + '花瓣 ' + have + '/3 枚 → 换 ' + give + ' 种子 1 颗</div></div>' +
        '<button class="btn sm' + (have >= 3 ? "" : " ghost") + '" data-act="trade:' + n.id + '">' + (have >= 3 ? "交换" : "不足") + '</button>' +
        '</div>';
    }).join("");
    return '<div class="screen">' + topbar("种子交换", { back: true }) +
      '<div class="body">' +
        '<div class="tabs"><button class="on">交换广场</button><button data-act="noop">我的交换</button></div>' +
        rows +
        '<div class="note">花瓣来自「盛放」阶段的植物采摘。交换只动游戏侧资源，不会改动碳账本。</div>' +
      '</div></div>';
  };

  SCREENS.friends = function () {
    const rows = D.npcs.map(function (n) {
      const done = S.visited.indexOf(n.id) >= 0;
      return '<div class="row">' +
        '<div class="ava"><img src="assets/' + n.img + '" alt=""></div>' +
        '<div class="meta"><div class="t">' + n.name + '</div><div class="s">' + D.plants[n.seed].name + '花园 · 已种植 8 株</div></div>' +
        '<button class="btn sm' + (done ? " ghost" : "") + '" data-act="visit:' + n.id + '">' + (done ? "已参观" : "去看看") + '</button>' +
        '</div>';
    }).join("");
    return '<div class="screen">' + topbar("好友花园", { back: false }) +
      '<div class="body">' +
        '<div class="two" style="margin-bottom:22px">' +
          '<button class="btn ghost" data-act="go:exchange" style="height:96px;font-size:30px">种子交换</button>' +
          '<button class="btn ghost" data-act="go:coop" style="height:96px;font-size:30px">生态共建</button>' +
        '</div>' + rows +
        '<div class="note">演示版好友为模拟数据：可参观、可采集，不联网。</div>' +
      '</div>' + tabbar("friends") + '</div>';
  };

  SCREENS.coop = function () {
    const pct = Math.min(100, S.carbon / D.goalCarbon * 100);
    const canClaim = pct >= D.coopClaimAt * 100 && !S.coopClaimed;
    return '<div class="screen">' + topbar("校园生态共建", { back: true }) +
      '<div class="body">' +
        '<div class="hero"><img src="assets/scene_map.png" alt=""><div class="ov"></div>' +
          '<div class="cap">湖畔生态修复</div></div>' +
        '<div class="card" style="padding:30px 32px;margin-top:24px">' +
          '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:16px">' +
            '<b style="font-size:32px">修复进度</b><b style="font-size:40px;color:#2F8D6A">' + Math.round(pct) + '%</b></div>' +
          progressBar(pct) +
          '<div class="note">进度 = 你的累计估算减排 ÷ 目标。贡献点 ' + S.contrib + '。</div>' +
        '</div>' +
        '<button class="btn' + (canClaim ? "" : " ghost") + '" data-act="coopClaim" style="margin-top:26px"' + (canClaim ? "" : " disabled") + '>' +
          (S.coopClaimed ? "今日成长能量已领取" : (canClaim ? "领取成长能量 +20" : "达到 60% 后可领取")) + '</button>' +
      '</div></div>';
  };

  SCREENS.result = function () {
    const pct = Math.min(100, S.carbon / D.goalCarbon * 100);
    const reached = S.carbon >= D.goalCarbon;
    const grown = S.plots.filter(function (p) { return p.sp && cropStage(p.gp) >= 3; }).length;
    return '<div class="screen">' + topbar("本局结算", { back: false, coins: false }) +
      '<div class="body">' +
        '<div class="card" style="padding:34px;text-align:center">' +
          '<div class="muted">' + (reached ? "目标达成" : "目标未达成") + '</div>' +
          '<div class="big" style="margin-top:10px">' + n2(S.carbon) + '<small>kg CO₂e</small></div>' +
          '<div class="muted" style="margin-top:10px">目标 ' + n2(D.goalCarbon) + ' kg · 完成 ' + Math.round(pct) + '%</div>' +
          '<div style="margin-top:22px">' + progressBar(pct) + '</div>' +
        '</div>' +
        '<div class="two" style="margin-top:22px">' +
          '<div class="stat"><div class="k">成树以上</div><div class="v">' + grown + '<small>株</small></div></div>' +
          '<div class="stat"><div class="k">图鉴</div><div class="v">' + Object.keys(S.codex).length + '<small>/8</small></div></div>' +
        '</div>' +
        '<div class="card" style="padding:28px;margin-top:22px">' +
          '<b style="font-size:29px">两个账户，分别记录</b>' +
          '<div class="calcrow"><span class="k">碳账本（真实成果·只读）</span><span class="v">' + n2(S.carbon) + ' kg</span></div>' +
          '<div class="calcrow"><span class="k">成长值（游戏资源·可流转）</span><span class="v">' + S.growth + '</span></div>' +
          '<div class="note">虚拟树木不等于实际固碳。减排量为估算值，基于演示用排放因子。</div>' +
        '</div>' +
        '<button class="btn" data-act="restart" style="margin-top:26px">再玩一次</button>' +
      '</div></div>';
  };

  /* ---------------- 弹层 ---------------- */
  function sheetQty() {
    if (!sheet || sheet.type !== "qty" || !sheet.task) return "";
    const t = sheet.task, q = sheet.qty;
    const d = q * (D.factors[t.base].kg - D.factors[t.act].kg);
    return '<div class="mask" data-act="closeSheet"></div>' +
      '<div class="sheet"><h3>登记一次「' + t.title + '」</h3>' +
      '<div class="sub">' + t.sub + ' · 系统按 数量 ×（基准 − 实际）核算</div>' +
      '<div class="stepper">' +
        '<button data-act="q:-">−</button>' +
        '<div class="num">' + (Number.isInteger(q) ? q : q.toFixed(1)) + '<small>' + t.kind + '</small></div>' +
        '<button data-act="q:+">+</button>' +
      '</div>' +
      '<div class="muted" style="text-align:center;margin-bottom:26px">预计估算减排 <b style="color:#2F8D6A;font-size:32px">' + n2(d) + ' kg</b></div>' +
      '<button class="btn" data-act="qConfirm">确认并计算</button></div>';
  }
  function sheetPlant() {
    if (!sheet || sheet.type !== "plant") return "";
    const rows = D.cropSet.map(function (k) {
      const n = S.seeds[k] || 0;
      return '<div class="row" style="box-shadow:none;border:2px solid #E7F2EA">' +
        '<img src="' + cropImg(k, 3) + '" style="width:88px;height:88px;object-fit:contain" alt="">' +
        '<div class="meta"><div class="t">' + D.cropNames[k] + '</div><div class="s">持有 ' + n + ' 颗种子</div></div>' +
        (n > 0
          ? '<button class="btn sm" data-act="plant:' + k + '">种下</button>'
          : '<button class="btn sm ghost" data-act="goShop">去商店</button>') +
        '</div>';
    }).join("");
    return '<div class="mask" data-act="closeSheet"></div>' +
      '<div class="sheet"><h3>选择种子</h3><div class="sub">种下后浇水或施肥让它长大</div>' + rows + '</div>';
  }
  function sheetBuy() {
    if (!sheet || sheet.type !== "buy") return "";
    const rows = D.plantOrder.map(function (k) {
      const own = !!S.codex[k];
      return '<div class="row" style="box-shadow:none;border:2px solid #E7F2EA">' +
        '<img src="assets/' + D.plants[k].art + '" style="width:86px;height:76px;object-fit:contain;' + (own ? "" : "filter:grayscale(1) opacity(.5)") + '" alt="">' +
        '<div class="meta"><div class="t">' + (own ? D.plants[k].name : "未知物种") + '</div><div class="s">' + (own ? D.plants[k].season + ' · ' + D.plants[k].type : "开盲盒解锁后可购买") + '</div></div>' +
        '<button class="btn sm' + (own ? "" : " ghost") + '" data-act="buy:' + k + '"' + (own ? "" : " disabled") + '>' + (own ? "◉" + D.seedCost : "未解锁") + '</button></div>';
    }).join("");
    return '<div class="mask" data-act="closeSheet"></div>' +
      '<div class="sheet" style="max-height:1500px;overflow-y:auto"><h3>选择花种子</h3><div class="sub">当前金币 ' + S.coins + '</div>' + rows + '</div>';
  }

  /* ---------------- 计算与动作 ---------------- */
  function taskById(id) {
    return D.tasks.concat(D.events).filter(function (t) { return t.id === id; })[0];
  }
  function calc(t, q) {
    const f = D.factors;
    const d = q * (f[t.base].kg - f[t.act].kg);
    return { d: Math.round(d * 100) / 100, g: Math.floor(d / 0.1) };
  }

  const ACT = {
    "tab": function (a) { root(a); },
    "go": function (a) { go(a); },
    "back": function () { back(); },
    "loc": function (a) {
      root("tasks");
      taskTab = "all";
      toast("已定位到 " + (DATA.locations.filter(function (l) { return l.id === a; })[0] || {}).name + " 相关任务");
    },
    "tbtab": function (a) { taskTab = a; render(); },
    "noop": function () { toast("演示版暂未开放"); },
    "noEnergy": function () { toast("精力已用完，点「结束今天」"); },

    "task": function (id) {
      const t = taskById(id);
      if (!t) return;
      if (S.energy <= 0) { toast("精力不足"); return; }
      sheet = { type: "qty", task: t, qty: t.qty };
      render();
    },
    "q:+": function () {
      const t = sheet.task;
      sheet.qty = Math.min(t.max, Math.round((sheet.qty + t.step) * 100) / 100);
      render();
    },
    "q:-": function () {
      const t = sheet.task;
      sheet.qty = Math.max(t.min, Math.round((sheet.qty - t.step) * 100) / 100);
      render();
    },
    "qConfirm": function () {
      const t = sheet.task, q = sheet.qty;
      const r = calc(t, q);
      sheet = null;
      pending = { task: t, qty: q, d: r.d, g: r.g };
      go("feedback");
    },
    "closeSheet": function () { sheet = null; render(); },

    "claim": function () {
      if (!pending) return;
      const t = pending.task, r = pending;
      S.carbon = Math.round((S.carbon + r.d) * 100) / 100;
      S.growth += r.g;
      S.coins += t.coins;
      S.contrib += 8;
      S.energy = Math.max(0, S.energy - 1);
      if (t.once) S.doneOnce.push(t.id); else S.doneToday.push(t.id);
      if (!S.codex[t.id]) { /* 行为不改图鉴 */ }
      save();
      stack = ["taskdone"];
      render();
    },
    "backTasks": function () { stack = ["tasks"]; render(); },
    "toResult": function () { stack = ["result"]; render(); },

    "endDay": function () {
      if (S.day >= D.dayLimit) { stack = ["result"]; render(); return; }
      S.day += 1;
      S.energy = D.energyPerDay;
      S.doneToday = [];
      S.visited = [];
      save();
      toast("第 " + S.day + " 天开始了");
      render();
    },

    "sel": function (i) {
      const idx = Number(i);
      if (idx >= unlockedCount()) { toast("这块地还没解锁"); return; }
      sel = idx;
      const p = S.plots[idx];
      if (!p || !p.sp) { bubbleOn = false; sheet = { type: "plant" }; }
      else { bubbleOn = true; sheet = null; }
      render();
    },

    "goShop": function () { go("shop"); },
    "goShop": function () { go("shop"); },
    "closeBubble": function () { bubbleOn = false; render(); },
    "openPlant": function () { sheet = { type: "plant" }; render(); },
    "plant": function (k) {
      const p = S.plots[sel];
      if (!p) { toast("先选一块地"); return; }
      if (sel >= unlockedCount()) { toast("这块地还没解锁"); return; }
      if (p.sp) { toast("这块地已经种了" + D.cropNames[p.sp]); return; }
      if (!S.seeds[k]) { toast("没有种子了，去商店买"); return; }
      S.seeds[k] -= 1;
      if (S.seeds[k] <= 0) delete S.seeds[k];
      p.sp = k; p.gp = 0;
      sheet = null; bubbleOn = false; save();
      toast("种下了 " + D.cropNames[k]);
      render();
    },
    "water": function () {
      const p = S.plots[sel];
      if (!p || !p.sp) { toast("这块地还没种东西"); return; }
      if (p.gp >= CROP_MAX) { toast("已经成熟，可以收获"); return; }
      if (S.coins < D.waterCost) { toast("金币不足（浇水 " + D.waterCost + "）"); return; }
      const before = cropStage(p.gp);
      S.coins -= D.waterCost;
      p.gp = Math.min(CROP_MAX, p.gp + D.waterGain);
      const after = cropStage(p.gp);
      save();
      toast(after > before ? "长大了！进入「" + D.stages[after] + "」" : "浇水 +" + D.waterGain);
      render();
    },
    "fert": function () {
      const p = S.plots[sel];
      if (!p || !p.sp) { toast("这块地还没种东西"); return; }
      if (p.gp >= CROP_MAX) { toast("已经成熟，可以收获"); return; }
      if (S.coins < D.fertCost) { toast("金币不足（施肥 " + D.fertCost + "）"); return; }
      const before = cropStage(p.gp);
      S.coins -= D.fertCost;
      p.gp = Math.min(CROP_MAX, p.gp + D.fertGain);
      const after = cropStage(p.gp);
      save();
      toast(after > before ? "施肥见效！进入「" + D.stages[after] + "」" : "施肥 +" + D.fertGain);
      render();
    },
    "harvest": function () {
      const p = S.plots[sel];
      if (!p || !p.sp) { toast("这块地还没种东西"); return; }
      if (p.gp < CROP_MAX) { toast("还没成熟"); return; }
      const k = p.sp;
      S.bag[k] = (S.bag[k] || 0) + 1;
      p.sp = null; p.gp = 0;
      addExp(D.cropExp[k]);
      save();
      toast("收获 " + D.cropNames[k] + " ×1 已放入背包，+" + D.cropExp[k] + " 经验");
      render();
    },
    "goBag": function () { bubbleOn = false; go("bag"); },
    "sell": function (k) {
      if (!S.bag[k]) { toast("背包里没有这个"); return; }
      S.bag[k] -= 1;
      if (S.bag[k] <= 0) delete S.bag[k];
      S.coins += D.cropYield[k];
      save();
      toast("卖出 " + D.cropNames[k] + "：+" + D.cropYield[k] + " 金币");
      render();
    },
    "sellAll": function () {
      let cnt = 0, money = 0;
      Object.keys(S.bag).forEach(function (k) { cnt += S.bag[k]; money += S.bag[k] * D.cropYield[k]; });
      if (!cnt) { toast("背包是空的"); return; }
      S.bag = {};
      S.coins += money;
      save();
      toast("卖出 " + cnt + " 件：+" + money + " 金币");
      render();
    },
    "buySeed": function (k) {
      if (S.coins < D.cropPrice[k]) { toast("金币不足"); return; }
      S.coins -= D.cropPrice[k];
      S.seeds[k] = (S.seeds[k] || 0) + 1;
      save();
      toast("买了 1 颗" + D.cropNames[k] + "种子");
      render();
    },

    "openBuy": function () { sheet = { type: "buy" }; render(); },
    "buy": function (k) {
      if (S.coins < D.seedCost) { toast("金币不足"); return; }
      S.coins -= D.seedCost;
      S.seeds[k] = (S.seeds[k] || 0) + 1;
      S.codex[k] = true;
      sheet = null;
      save();
      toast("已购买 " + D.plants[k].name + "种子");
      render();
    },

    "openbox": function () {
      if (S.coins < D.boxCost) { toast("金币不足"); return; }
      S.coins -= D.boxCost;
      const pool = D.plantOrder;
      const sp = pool[Math.floor(Math.random() * pool.length)];
      S.seeds[sp] = (S.seeds[sp] || 0) + 1;
      S.codex[sp] = true;
      pending = { got: sp };
      save();
      go("newplant");
    },

    "trade": function (id) {
      const n = D.npcs.filter(function (x) { return x.id === id; })[0];
      const have = S.petals[n.want] || 0;
      if (have < 3) { toast("需要 " + D.plants[n.want].name + "花瓣 3 枚"); return; }
      S.petals[n.want] = have - 3;
      S.seeds[n.seed] = (S.seeds[n.seed] || 0) + 1;
      S.codex[n.seed] = true;
      save();
      toast("交换成功：获得 " + D.plants[n.seed].name + "种子");
      render();
    },

    "visit": function (id) {
      if (S.visited.indexOf(id) >= 0) { toast("今天已经参观过了"); return; }
      S.visited.push(id);
      S.coins += 2;
      save();
      toast("参观了 TA 的花园，采集到 ◉2");
      render();
    },

    "coopClaim": function () {
      if (S.coopClaimed) { toast("已领取"); return; }
      const pct = S.carbon / D.goalCarbon * 100;
      if (pct < D.coopClaimAt * 100) { toast("进度不足 60%"); return; }
      S.coopClaimed = true;
      S.growth += 20;
      save();
      toast("领取成长能量 +20");
      render();
    },

    "restart": function () {
      S = fresh();
      stack = ["explore"];
      sel = 0;
      pending = null;
      sheet = null;
      locFilter = null;
      save();
      render();
    },
    "clearLoc": function () { locFilter = null; render(); }
  };

  /* ---------------- 渲染 ---------------- */
  function render() {
    if (window.World) window.World.unmount();
    let name = cur();
    if (!SCREENS[name]) name = "explore";
    let html = SCREENS[name]();
    if (sheet) {
      html += (sheet.type === "qty" ? sheetQty() : sheet.type === "plant" ? sheetPlant() : sheetBuy());
    }
    const prevScreen = app.getAttribute("data-screen");
    app.innerHTML = html;
    app.setAttribute("data-screen", name);
    app.classList.toggle("anim", prevScreen !== name);
    if (name === "explore" && window.World) {
      const c = document.getElementById("world");
      if (c) window.World.mount(c, enterDoor, function () { toast("这条路走不过去，换个方向试试"); });
    }
  }

  /* ---------------- 事件 ---------------- */
  app.addEventListener("click", function (e) {
    const el = e.target.closest("[data-act]");
    if (!el) return;
    const raw = el.getAttribute("data-act");
    const i = raw.indexOf(":");
    const key = i < 0 ? raw : raw.slice(0, i);
    const arg = i < 0 ? "" : raw.slice(i + 1);
    const fn = ACT[key];
    if (fn) { e.preventDefault(); fn(arg); }
  });

  /* ---------------- 启动 ---------------- */
  load();
  fit();

  /* 开发/验收用：?screen=tasks&t=walkToClass&q=2 直达任意屏（不影响正常游玩） */
  (function () {
    try {
      const qs = new URLSearchParams(location.search);
      if (qs.get("demo")) {
        S.carbon = 3.2; S.growth = 32; S.coins = 320;
        S.plots = Array.from({ length: D.plotCount }, function () { return { sp: null, gp: 0 }; });
        S.plots[0] = { sp: "hua", gp: 24 };
        S.plots[1] = { sp: "ying", gp: 12 };
        S.plots[2] = { sp: "yang", gp: 4 };
        S.codex = { sakura: true, ginkgo: true, sunflower: true };
        S.petals = { sakura: 3 };
        S.level = 2; S.exp = 30;
        S.bag = { hua: 3, yang: 1 };
        sel = 0;
        if (qs.get("bubble")) bubbleOn = true;
      }
      if (qs.get("screen")) {
        stack = [qs.get("screen")];
        if (qs.get("t")) {
          const t = taskById(qs.get("t"));
          const q = Number(qs.get("q") || t.qty);
          const r = calc(t, q);
          pending = { task: t, qty: q, d: r.d, g: r.g };
        }
        if (qs.get("got")) pending = { got: qs.get("got") };
        if (qs.get("sheet")) {
          const st = qs.get("t") ? taskById(qs.get("t")) : null;
          sheet = (qs.get("sheet") === "qty" && st)
            ? { type: "qty", task: st, qty: Number(qs.get("q") || st.qty) }
            : { type: qs.get("sheet") };
        }
        if (qs.get("sel")) sel = Number(qs.get("sel"));
        if (qs.get("loc")) locFilter = qs.get("loc");
      }
      if (qs.get("auto") === "loop") {
        ACT.task("walkToClass");
        ACT["qConfirm"]();
        ACT.claim();
      }
    } catch (e) {}
  })();

  try { render(); } catch (e) {
    var pre = document.createElement("pre");
    pre.style.cssText = "position:fixed;z-index:99999;left:0;top:0;right:0;background:#fff;color:#c00;font-size:20px;padding:16px;white-space:pre-wrap";
    pre.textContent = "RENDER ERR: " + e.message + "\n" + (e.stack || "");
    document.body.appendChild(pre);
  }
  window.__game = { get S() { return S; }, reset: function () { ACT.restart(); } };
})();

