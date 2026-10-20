/* 星露谷式行走引擎：3/4 俯视、镜头跟随、摇杆/键盘、碰撞滑动
   坐标系：世界坐标 = 原图 1392×1130 像素；渲染时统一乘 V 放大 */
(function () {
  const MAP_W = 1392, MAP_H = 1130;
  const V = 2.2;                       // 世界 -> 屏幕 放大倍率
  const VIEW_W = 1080 / V, VIEW_H = 1920 / V;
  const SPEED = 210;                   // 世界单位/秒
  const PR = 15;                       // 玩家碰撞半径

  let cv, ctx, raf = 0, running = false, ready = false;
  let mapImg = null, collImg = null, collData = null, collW = 0, collH = 0;
  let cam = { x: 0, y: 0 };
  let keys = Object.create(null);
  let stick = { on: false, id: null, ox: 0, oy: 0, dx: 0, dy: 0 };
  let tap = null;
  let onEnter = null;
  let onNoPath = null;
  let nearDoor = null;
  let pendingAt = null;
  let forceDir = null;   // 开发用：?move=r|d|l|u|rd|ru|ld|lu 强制朝某方向走
  const BUILD = "v7";
  let debugOn = false;
  let overlayOn = false;
  let pathInfo = "";
  let dbgCanvas = null;
  let wantSelfTest = false;
  let selfTest = null;

  const P = { x: 720, y: 470, dirIdx: 2, dir4: 0, moving: false, t: 0, anim: 0, target: null, path: null, stall: 0 };

  const DOORS = [
    { id: "canteen", x: 164, y: 504, label: "三食堂", kind: "loc", loc: "食堂" },
    { id: "teach",   x: 752, y: 268, label: "四教",   kind: "loc", loc: "教学楼" },
    { id: "library", x: 734, y: 668, label: "图书馆", kind: "codex" },
    { id: "dorm",    x: 1254, y: 966, label: "南区宿舍", kind: "loc", loc: "宿舍" },
    { id: "plaza",   x: 504, y: 900, label: "思源广场", kind: "scenic" }
  ];

  const IMG = { sheet: null };

  function load(src) {
    const im = new Image();
    im.src = src;
    return im;
  }

  function blocked(wx, wy) {
    if (!collData) return false;
    const cx = Math.floor(wx / 2), cy = Math.floor(wy / 2);
    if (cx < 0 || cy < 0 || cx >= collW || cy >= collH) return true;
    return collData[(cy * collW + cx) * 4] < 128;
  }

  function freeSpot(x, y) {
    if (!blocked(x, y)) return { x: x, y: y };
    for (let r = 6; r <= 90; r += 6) {
      for (let a = 0; a < 12; a++) {
        const nx = x + Math.cos(a / 12 * Math.PI * 2) * r;
        const ny = y + Math.sin(a / 12 * Math.PI * 2) * r;
        if (!blocked(nx, ny)) return { x: nx, y: ny };
      }
    }
    return { x: x, y: y };
  }

  /* 把一个点挪到走廊中间，避免出生就贴着墙 */
  function centerSpot(x, y) {
    let best = { x: x, y: y }, bestScore = -1;
    for (let r = 0; r <= 26; r += 6) {
      for (let a = 0; a < 16; a++) {
        const nx = x + Math.cos(a / 16 * Math.PI * 2) * r;
        const ny = y + Math.sin(a / 16 * Math.PI * 2) * r;
        if (blocked(nx, ny)) continue;
        let sc = 0;
        for (let rr = 8; rr <= 24; rr += 8) {
          for (let aa = 0; aa < 8; aa++) {
            if (!blocked(nx + Math.cos(aa / 8 * Math.PI * 2) * rr,
                         ny + Math.sin(aa / 8 * Math.PI * 2) * rr)) sc++;
          }
        }
        if (sc > bestScore) { bestScore = sc; best = { x: nx, y: ny }; }
      }
    }
    return best;
  }

  function init() {
    mapImg = load("assets/world_map.png?v=5");
    collImg = load("assets/collide.png?v=5");
    IMG.sheet = load("assets/hero4.webp?v=6");
    collImg.onload = function () {
      const c = document.createElement("canvas");
      c.width = collImg.naturalWidth; c.height = collImg.naturalHeight;
      const g = c.getContext("2d");
      g.drawImage(collImg, 0, 0);
      collW = c.width; collH = c.height;
      collData = g.getImageData(0, 0, collW, collH).data;
      // 预渲染一张碰撞可视化图（绿=可走 红=阻挡）
      dbgCanvas = document.createElement("canvas");
      dbgCanvas.width = collW; dbgCanvas.height = collH;
      const dg = dbgCanvas.getContext("2d");
      const img = dg.createImageData(collW, collH);
      for (let i = 0; i < collW * collH; i++) {
        const walk = collData[i * 4] >= 128;
        img.data[i * 4] = walk ? 40 : 255;
        img.data[i * 4 + 1] = walk ? 220 : 50;
        img.data[i * 4 + 2] = walk ? 140 : 50;
        img.data[i * 4 + 3] = 120;
      }
      dg.putImageData(img, 0, 0);
      buildNav();
      ready = true;
      DOORS.forEach(function (d) {
        const f = freeSpot(d.x, d.y);
        d._x = f.x; d._y = f.y;
      });
      const s = freeSpot(P.x, P.y);
      P.x = s.x; P.y = s.y;
      if (pendingAt) {
        const d = DOORS.filter(function (x) { return x.id === pendingAt; })[0];
        if (d) {
          const f = freeSpot(d._x, d._y + 52);
          P.x = f.x; P.y = f.y;
        }
      }
      const cs = centerSpot(P.x, P.y);
      P.x = cs.x; P.y = cs.y;
      // 开发用：?pathto=<doorId> 直接规划一条路线
      try {
        const pt = new URLSearchParams(location.search).get("pathto");
        if (pt) {
          const dd = DOORS.filter(function (x) { return x.id === pt; })[0];
          if (dd) {
            const pp = findPath(P.x, P.y, dd._x, dd._y);
            pathInfo = pt + ":" + (pp ? pp.length : "null");
            if (pp) { P.path = pp; P.target = { x: dd._x, y: dd._y }; }
          }
        }
      } catch (e) {}
      try {
        const pt = new URLSearchParams(location.search).get("pathto");
        if (pt) {
          const dd = DOORS.filter(function (x) { return x.id === pt; })[0];
          if (dd) {
            const pp = findPath(P.x, P.y, dd._x, dd._y);
            if (pp) { P.path = pp; P.target = { x: dd._x, y: dd._y }; }
          }
        }
      } catch (e) {}
      if (wantSelfTest) runSelfTest();
      cam.x = clamp(P.x - VIEW_W / 2, 0, MAP_W - VIEW_W);
      cam.y = clamp(P.y - VIEW_H / 2, 0, MAP_H - VIEW_H);
    };
  }

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* ---------------- 寻路：可走掩码上的 A* ---------------- */
  const NAV = { cell: 4, w: 0, h: 0, grid: null };

  function buildNav() {
    const c = NAV.cell;
    NAV.w = Math.ceil(MAP_W / c);
    NAV.h = Math.ceil(MAP_H / c);
    const g = new Uint8Array(NAV.w * NAV.h);
    for (let y = 0; y < NAV.h; y++) {
      for (let x = 0; x < NAV.w; x++) {
        const wx = (x + 0.5) * c, wy = (y + 0.5) * c;
        g[y * NAV.w + x] = blocked(wx, wy) ? 0 : 1;
      }
    }
    NAV.grid = g;
  }

  function nearestFree(i, j, maxR) {
    const W = NAV.w, H = NAV.h, g = NAV.grid;
    const free = function (a, b) { return a >= 0 && b >= 0 && a < W && b < H && g[b * W + a]; };
    if (free(i, j)) return [i, j];
    for (let r = 1; r <= maxR; r++) {
      for (let d = -r; d <= r; d++) {
        if (free(i + d, j - r)) return [i + d, j - r];
        if (free(i + d, j + r)) return [i + d, j + r];
        if (free(i - r, j + d)) return [i - r, j + d];
        if (free(i + r, j + d)) return [i + r, j + d];
      }
    }
    return null;
  }

  function heapPush(h, node) {
    h.push(node);
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (h[p].f <= h[i].f) break;
      const t = h[p]; h[p] = h[i]; h[i] = t; i = p;
    }
  }
  function heapPop(h) {
    const top = h[0], last = h.pop();
    if (h.length) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < h.length && h[l].f < h[m].f) m = l;
        if (r < h.length && h[r].f < h[m].f) m = r;
        if (m === i) break;
        const t = h[m]; h[m] = h[i]; h[i] = t; i = m;
      }
    }
    return top;
  }

  function findPath(sx, sy, tx, ty) {
    if (!NAV.grid) return null;
    const C = NAV.cell, W = NAV.w, H = NAV.h, g = NAV.grid;
    const s0 = nearestFree(Math.floor(sx / C) | 0, Math.floor(sy / C) | 0, 12);
    const t0 = nearestFree(Math.floor(tx / C) | 0, Math.floor(ty / C) | 0, 40);
    if (!s0 || !t0) return null;
    const si = s0[0], sj = s0[1], ti = t0[0], tj = t0[1];
    if (si === ti && sj === tj) return null;

    const N = W * H;
    const gs = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const start = sj * W + si, goal = tj * W + ti;
    const hfun = function (i, j) {
      const dx = Math.abs(i - ti), dy = Math.abs(j - tj);
      return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy);
    };
    gs[start] = 0;
    const open = [];
    heapPush(open, { f: hfun(si, sj), i: start });
    const D = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
               [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
    let guard = 0;
    while (open.length && guard++ < 300000) {
      const cur = heapPop(open);
      if (closed[cur.i]) continue;
      closed[cur.i] = 1;
      if (cur.i === goal) break;
      const ci = cur.i % W, cj = (cur.i / W) | 0;
      for (let k = 0; k < 8; k++) {
        const ni = ci + D[k][0], nj = cj + D[k][1];
        if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
        const nidx = nj * W + ni;
        if (!g[nidx] || closed[nidx]) continue;
        if (D[k][0] && D[k][1] && (!g[cj * W + ni] || !g[nj * W + ci])) continue;
        const ng = gs[cur.i] + D[k][2];
        if (ng < gs[nidx]) {
          gs[nidx] = ng;
          came[nidx] = cur.i;
          heapPush(open, { f: ng + hfun(ni, nj), i: nidx });
        }
      }
    }
    if (goal !== start && came[goal] < 0) return null;

    const cells = [];
    let cur = goal;
    while (cur !== start && cur >= 0) {
      cells.push(cur);
      cur = came[cur];
      if (cells.length > 20000) return null;
    }
    cells.reverse();
    const pts = cells.map(function (idx) {
      const i = idx % W, j = (idx / W) | 0;
      return { x: (i + 0.5) * C, y: (j + 0.5) * C };
    });
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      if (i === 0 || i === pts.length - 1) { out.push(pts[i]); continue; }
      const a = pts[i - 1], b = pts[i], c = pts[i + 1];
      const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      if (Math.abs(cross) > 0.5) out.push(b);
    }
    return out;
  }


  /* 确定性自检：不依赖 rAF，直接跑固定步长，量出四个方向能走多远 */
  function runSelfTest() {
    const dirs = { R: [1, 0], L: [-1, 0], U: [0, -1], D: [0, 1] };
    const sx = P.x, sy = P.y, res = {};
    Object.keys(dirs).forEach(function (k) {
      P.x = sx; P.y = sy; P.target = null;
      forceDir = dirs[k];
      for (let i = 0; i < 180; i++) move(1 / 60);
      res[k] = Math.round(Math.hypot(P.x - sx, P.y - sy));
    });
    P.x = sx; P.y = sy; forceDir = null;
    selfTest = selfTestText(res);
  }
  function selfTestText(r) {
    return "R" + r.R + " L" + r.L + " U" + r.U + " D" + r.D;
  }

  function move(dt) {
    let ix = 0, iy = 0;
    if (keys["a"] || keys["arrowleft"]) ix -= 1;
    if (keys["d"] || keys["arrowright"]) ix += 1;
    if (keys["w"] || keys["arrowup"]) iy -= 1;
    if (keys["s"] || keys["arrowdown"]) iy += 1;
    if (stick.on) { ix += stick.dx; iy += stick.dy; }

    if (forceDir) { ix = forceDir[0]; iy = forceDir[1]; }

    // 键盘/摇杆给了输入就取消自动寻路
    if (ix || iy) { P.path = null; P.target = null; }

    // 沿 A* 路径行走
    if (!ix && !iy && P.path && P.path.length) {
      let wp = P.path[0];
      let dx = wp.x - P.x, dy = wp.y - P.y;
      let d = Math.hypot(dx, dy);
      let g2 = 0;
      while (d < 10 && P.path.length > 1 && g2++ < 60) {
        P.path.shift();
        wp = P.path[0];
        dx = wp.x - P.x; dy = wp.y - P.y; d = Math.hypot(dx, dy);
      }
      if (P.path.length === 1 && d < 7) {
        P.path = null; P.target = null;
      } else if (d > 0.01) {
        ix = dx / d; iy = dy / d;
      }
    }

    // 无路径时退回直线目标
    if (!ix && !iy && P.target && !P.path) {
      const dx = P.target.x - P.x, dy = P.target.y - P.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 6) {
        P.target = null;
      } else {
        ix = dx / dist; iy = dy / dist;
      }
    }

    const len = Math.hypot(ix, iy);
    if (len > 1) { ix /= len; iy /= len; }
    const moving = Math.abs(ix) > 0.08 || Math.abs(iy) > 0.08;
    P.moving = moving;
    if (!moving) return;

    const nx = P.x + ix * SPEED * dt;
    const ny = P.y + iy * SPEED * dt;

    // 先试整步（斜向走廊才走得动），不行再分轴滑动
    const ox = P.x, oy = P.y;
    if (!blocked(nx, ny)) { P.x = nx; P.y = ny; }
    else {
      if (!blocked(nx, P.y)) P.x = nx;
      if (!blocked(P.x, ny)) P.y = ny;
    }
    // 卡住就放弃，避免原地抖
    if (P.target) {
      if (Math.abs(P.x - ox) < 1e-6 && Math.abs(P.y - oy) < 1e-6) {
        P.stall += dt;
        if (P.stall > (P.path ? 0.9 : 0.35)) { P.target = null; P.path = null; P.stall = 0; }
      } else { P.stall = 0; }
    }
    P.x = clamp(P.x, 8, MAP_W - 8);
    P.y = clamp(P.y, 8, MAP_H - 8);

    // 八方向：0=右 1=右下 2=下 3=左下 4=左 5=左上 6=上 7=右上
    let ang = Math.atan2(iy, ix);
    if (ang < 0) ang += Math.PI * 2;
    P.dirIdx = Math.round(ang / (Math.PI / 4)) % 8;
    // 四方向贴图：0=下 1=左 2=右 3=上（对角取主轴）
    P.dir4 = Math.abs(ix) > Math.abs(iy) ? (ix > 0 ? 2 : 1) : (iy > 0 ? 0 : 3);
    P.t += dt;
    P.anim += dt;
  }

  function updateCamera(dt) {
    const tx = clamp(P.x - VIEW_W / 2, 0, MAP_W - VIEW_W);
    const ty = clamp(P.y - VIEW_H / 2, 0, MAP_H - VIEW_H);
    const k = Math.min(1, dt * 6.5);
    cam.x += (tx - cam.x) * k;
    cam.y += (ty - cam.y) * k;
  }

  function doorAt() {
    let best = null, bd = 1e9;
    DOORS.forEach(function (d) {
      const dist = Math.hypot(P.x - d._x, P.y - d._y);
      if (dist < 95 && dist < bd) { bd = dist; best = d; }
    });
    return best;
  }

  function draw() {
    const W = cv.width, H = cv.height;
    ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = "#cfe3d0";
    ctx.fillRect(0, 0, W, H);
    if (!ready) { requestAnimationFrame(loop); return; }

    ctx.drawImage(mapImg,
      cam.x, cam.y, VIEW_W, VIEW_H,
      0, 0, W, H);

    if (overlayOn && dbgCanvas) {
      ctx.drawImage(dbgCanvas, cam.x / 2, cam.y / 2, VIEW_W / 2, VIEW_H / 2, 0, 0, W, H);
      ctx.save();
      ctx.font = "700 30px system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(0,0,0,.6)";
      ctx.fillRect(20, 130, 470, 46);
      ctx.fillStyle = "#b6ffd0";
      ctx.fillText(BUILD + "  x" + Math.round(P.x) + " y" + Math.round(P.y), 30, 164);
      ctx.fillStyle = "#ffd9a0";
      ctx.fillText("R10=" + (blocked(P.x + 10, P.y) ? 1 : 0) +
                   " R40=" + (blocked(P.x + 40, P.y) ? 1 : 0) +
                   " L40=" + (blocked(P.x - 40, P.y) ? 1 : 0) +
                   " U40=" + (blocked(P.x, P.y - 40) ? 1 : 0) +
                   " f=" + frames, 30, 200);
      if (selfTest) {
        ctx.fillStyle = "#9be7ff";
        ctx.fillText("自检 " + selfTest, 30, 236);
      }
      if (pathInfo) {
        ctx.fillStyle = "#ffe0a0";
        ctx.fillText("路径 " + pathInfo + " 余" + (P.path ? P.path.length : 0), 30, selfTest ? 272 : 236);
      }
      // 一键隐藏按钮
      const bw = 236, bh = 72, bx = W - bw - 24, by = 128;
      roundRect(ctx, bx, by, bw, bh, 36);
      ctx.fillStyle = "rgba(20,50,38,.88)";
      ctx.fill();
      ctx.fillStyle = "#eafff2";
      ctx.font = "700 32px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("✕ 隐藏", bx + bw / 2, by + 48);
      ctx.restore();
    }

    // 门标记：远时只给一个小光点，近了才出标签，避免和地图自带标签重复
    DOORS.forEach(function (d) {
      const sx = (d._x - cam.x) * V, sy = (d._y - cam.y) * V;
      if (sx < -160 || sy < -160 || sx > W + 160 || sy > H + 160) return;
      const dist = Math.hypot(P.x - d._x, P.y - d._y);
      const isNear = nearDoor === d;
      const pulse = 1 + Math.sin(performance.now() / 320 + d._x) * 0.14;

      if (dist > 260) {
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.beginPath(); ctx.arc(sx, sy, 9 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = "#2F8D6A"; ctx.fill();
        ctx.beginPath(); ctx.arc(sx, sy, 20 * pulse, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(47,141,106,.55)"; ctx.lineWidth = 3; ctx.stroke();
        ctx.restore();
        return;
      }

      ctx.save();
      ctx.globalAlpha = isNear ? 0.95 : 0.6;
      ctx.beginPath();
      ctx.ellipse(sx, sy + 18, 34 * pulse, 14 * pulse, 0, 0, Math.PI * 2);
      ctx.fillStyle = isNear ? "rgba(47,141,106,.55)" : "rgba(255,255,255,.45)";
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.font = "600 26px system-ui, sans-serif";
      ctx.textAlign = "center";
      const w = ctx.measureText(d.label).width + 34;
      ctx.globalAlpha = isNear ? 1 : 0.8;
      ctx.fillStyle = isNear ? "rgba(47,141,106,.95)" : "rgba(255,255,255,.92)";
      roundRect(ctx, sx - w / 2, sy - 88, w, 40, 20);
      ctx.fill();
      ctx.fillStyle = isNear ? "#fff" : "#2F3F36";
      ctx.fillText(d.label, sx, sy - 60);
      ctx.restore();
    });

    // 影子 + 角色（8 方向 × 8 帧）
    const px = (P.x - cam.x) * V, py = (P.y - cam.y) * V;
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.beginPath();
    ctx.ellipse(px, py + 6, 30, 12, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#14352a";
    ctx.fill();
    ctx.restore();

    // 四方向 × 8 帧（224×320 单元格，脚下对齐 py）
    const SW = 224, SH = 320, SC = 0.55;
    const frame = P.moving ? (Math.floor(P.anim * 10) % 8) : 0;
    if (IMG.sheet && IMG.sheet.complete && IMG.sheet.naturalWidth) {
      ctx.drawImage(IMG.sheet,
        frame * SW, P.dir4 * SH, SW, SH,
        Math.round(px - 111.5 * SC), Math.round(py - 304 * SC),
        Math.round(SW * SC), Math.round(SH * SC));
    }

    // 规划出的路线
    if (P.path && P.path.length) {
      ctx.save();
      for (let i = 0; i < P.path.length; i++) {
        const wx = (P.path[i].x - cam.x) * V, wy = (P.path[i].y - cam.y) * V;
        if (wx < -30 || wy < -30 || wx > W + 30 || wy > H + 30) continue;
        ctx.beginPath();
        ctx.arc(wx, wy, i === 0 ? 9 : 5, 0, Math.PI * 2);
        ctx.fillStyle = i === 0 ? "rgba(47,141,106,.85)" : "rgba(47,141,106,.45)";
        ctx.fill();
      }
      ctx.restore();
    }

    // 点击行走的目标点
    if (P.target) {
      const tx = (P.target.x - cam.x) * V, ty = (P.target.y - cam.y) * V;
      const r = 16 + Math.sin(performance.now() / 200) * 4;
      ctx.save();
      ctx.beginPath(); ctx.arc(tx, ty, r, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(47,141,106,.85)"; ctx.lineWidth = 4; ctx.stroke();
      ctx.beginPath(); ctx.arc(tx, ty, 4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(47,141,106,.85)"; ctx.fill();
      ctx.restore();
    }

    // 摇杆
    if (stick.on) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.arc(stick.ox, stick.oy, 92, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,.45)"; ctx.fill();
      ctx.beginPath(); ctx.arc(stick.ox + stick.dx * 62, stick.oy + stick.dy * 62, 40, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(47,141,106,.9)"; ctx.fill();
      ctx.restore();
    }

    // 走近提示
    if (nearDoor) {
      const sx = (nearDoor._x - cam.x) * V, sy = (nearDoor._y - cam.y) * V;
      ctx.save();
      ctx.font = "700 28px system-ui, sans-serif";
      ctx.textAlign = "center";
      const txt = nearDoor.kind === "loc" ? "轻点进入" : "轻点查看";
      ctx.fillStyle = "rgba(20,50,38,.82)";
      const w = ctx.measureText(txt).width + 40;
      roundRect(ctx, sx - w / 2, sy - 152, w, 46, 23);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillText(txt, sx, sy - 120);
      ctx.restore();
    }

    requestAnimationFrame(loop);
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  let last = 0;
  let frames = 0;
  function loop(ts) {
    if (!running) return;
    const dt = Math.min(0.05, (ts - last) / 1000 || 0);
    last = ts;
    frames++;
    move(dt);
    updateCamera(dt);
    nearDoor = doorAt();
    draw();
  }

  /* ---------- 输入 ---------- */
  function onKey(e, down) {
    const k = e.key.toLowerCase();
    if (down && k === "h" && debugOn) { overlayOn = !overlayOn; e.preventDefault(); return; }
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].indexOf(k) >= 0) {
      keys[k] = down;
      e.preventDefault();
    }
  }
  const kd = function (e) { onKey(e, true); };
  const ku = function (e) { onKey(e, false); };

  function pos(e) {
    const r = cv.getBoundingClientRect();
    const s = r.width / cv.width;
    return { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s };
  }

  function pd(e) {
    const p = pos(e);
    tap = { x: p.x, y: p.y, t: performance.now(), moved: 0 };
    if (p.y < cv.height - 190 && p.x < cv.width * 0.70) {
      stick.on = true; stick.id = e.pointerId;
      stick.ox = p.x; stick.oy = p.y; stick.dx = 0; stick.dy = 0;
      cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
    }
  }
  function pm(e) {
    if (!tap) return;
    const p = pos(e);
    if (stick.on && e.pointerId === stick.id) {
      let dx = (p.x - stick.ox) / 78, dy = (p.y - stick.oy) / 78;
      const l = Math.hypot(dx, dy);
      if (l > 1) { dx /= l; dy /= l; }
      stick.dx = dx; stick.dy = dy;
    } else {
      tap.moved = Math.max(tap.moved, Math.hypot(p.x - tap.x, p.y - tap.y));
    }
  }
  function pu(e) {
    if (stick.on) { stick.on = false; stick.dx = 0; stick.dy = 0; stick.id = null; }
    if (tap && tap.moved < 24 && performance.now() - tap.t < 700) {
      const p = pos(e);
      // 点「隐藏」按钮：关掉碰撞层
      if (overlayOn) {
        const bw = 236, bh = 72, bx = cv.width - bw - 24, by = 128;
        if (p.x >= bx && p.x <= bx + bw && p.y >= by && p.y <= by + bh) {
          overlayOn = false;
          tap = null;
          return;
        }
      }
      const d = nearDoor;
      if (d) {
        const sx = (d._x - cam.x) * V, sy = (d._y - cam.y) * V;
        if (Math.hypot(p.x - sx, p.y - sy) < 170) {
          if (onEnter) onEnter(d);
          tap = null;
          return;
        }
      }
      // 点击行走：算一条沿可走区域的最短路线
      const wx = cam.x + p.x / V, wy = cam.y + p.y / V;
      const path = findPath(P.x, P.y, wx, wy);
      if (path && path.length) {
        P.path = path;
        P.target = { x: wx, y: wy };
        P.stall = 0;
      } else {
        P.path = null;
        P.target = null;
        if (onNoPath) onNoPath();
      }
    }
    tap = null;
  }

  window.World = {
    mount: function (canvas, enterCb, noPathCb) {
      cv = canvas;
      ctx = cv.getContext("2d");
      onEnter = enterCb; onNoPath = noPathCb || null;
      if (!mapImg) init();
      try { pendingAt = new URLSearchParams(location.search).get("at"); } catch (e) {}
      try { debugOn = new URLSearchParams(location.search).get("debug") === "1"; overlayOn = debugOn; } catch (e) {}
      try { wantSelfTest = new URLSearchParams(location.search).get("selftest") === "1"; } catch (e) {}
      try {
        const mv = new URLSearchParams(location.search).get("move");
        const map = { r: [1, 0], l: [-1, 0], u: [0, -1], d: [0, 1],
                      rd: [0.7, 0.7], ld: [-0.7, 0.7], ru: [0.7, -0.7], lu: [-0.7, -0.7] };
        forceDir = mv && map[mv] ? map[mv] : null;
      } catch (e) {}
      running = true;
      last = performance.now();
      window.addEventListener("keydown", kd);
      window.addEventListener("keyup", ku);
      cv.addEventListener("pointerdown", pd);
      cv.addEventListener("pointermove", pm);
      cv.addEventListener("pointerup", pu);
      cv.addEventListener("pointercancel", pu);
      if (ready) {
        const s = freeSpot(P.x, P.y); P.x = s.x; P.y = s.y;
        cam.x = clamp(P.x - VIEW_W / 2, 0, MAP_W - VIEW_W);
        cam.y = clamp(P.y - VIEW_H / 2, 0, MAP_H - VIEW_H);
      }
      raf = requestAnimationFrame(loop);
    },
    unmount: function () {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      if (cv) {
        cv.removeEventListener("pointerdown", pd);
        cv.removeEventListener("pointermove", pm);
        cv.removeEventListener("pointerup", pu);
        cv.removeEventListener("pointercancel", pu);
      }
      keys = Object.create(null);
      stick.on = false;
    },
    pos: function () { return { x: P.x, y: P.y }; }
  };
})();









