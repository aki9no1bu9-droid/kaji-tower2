/* ============================================
   game.js  ―― 本家「どうぶつタワーバトル」寄せ版
   ・細い土台
   ・ゆっくりふわっと落下
   ・積み上がるとカメラが上に追従
   ・コマは画像の輪郭多角形
   ============================================ */

const { Engine, Render, Runner, World, Bodies, Body, Bounds,
        Vertices, Events, Composite } = Matter;

const Game = {
  engine: null, render: null, runner: null, world: null,
  currentPlayer: 1,
  placedCount: 0,
  activeBody: null,
  waitingBody: null,
  canDrop: true,
  gameOver: false,
  settleTimer: 0,
  pendingSwitch: false, // 接触検知 → 次tickでスポーンするためのフラグ
  dragging: false,
  wrapEl: null,

  // 画面サイズ
  W: 0, H: 0,

  // カメラ（縦スクロール量）。topY が小さいほど上を見る
  camY: 0,
  targetCamY: 0,
  spawnWorldY: 0,   // コマを出すワールド座標Y（カメラ上端の少し下）

  platformTopY: 0,  // 土台の天面ワールドY
  deathMargin: 0,   // 場外判定の余白
  currentSpawnY: 0, // 現在のコマのスポーンY座標（spawnNext時に計算して固定）

  onHudUpdate: null,
  onGameOver: null,

  teardown() {
    if (this.render) { Render.stop(this.render); this.render.canvas.remove(); this.render = null; }
    if (this.runner) { Runner.stop(this.runner); this.runner = null; }
    if (this.engine) { Engine.clear(this.engine); this.engine = null; }
  },

  start(wrapEl) {
    this.teardown();
    this.currentPlayer = 1;
    this.placedCount = 0;
    this.canDrop = true;
    this.gameOver = false;
    this.activeBody = null;
    this.waitingBody = null;
    this.pendingSwitch = false;
    this.wrapEl = wrapEl;

    const W = wrapEl.clientWidth;
    const H = wrapEl.clientHeight;
    this.W = W; this.H = H;

    this.engine = Engine.create();
    this.world = this.engine.world;
    this.engine.gravity.y = 0.8; // 重力。ゆったりめ。落下のふわっと感は空気抵抗と合わせて出す

    this.render = Render.create({
      element: wrapEl,
      engine: this.engine,
      options: {
        width: W, height: H,
        wireframes: false, background: '#1a2530', // 暗いスタジオ空間
        hasBounds: true   // カメラ（bounds）でスクロールするために必要
      }
    });
    Render.run(this.render);
    this.runner = Runner.create();
    Runner.run(this.runner, this.engine);

    // --- カメラ・ドリーレール（撮影スタジオのカメラ移動用軌道）---
    const railW = W * 0.65;
    const railH = 10;   // 上レールの厚み
    const tieGap = 18;  // 上下レール間（枕木の高さ）
    const botH  = 8;    // 下レールの厚み
    this.platformTopY = H * 0.70;

    // 上レール（物理あり：コマが乗る面）
    const topRail = Bodies.rectangle(W / 2, this.platformTopY + railH / 2, railW, railH, {
      isStatic: true,
      chamfer: { radius: 3 },
      render: { fillStyle: '#d0d0d0' }
    });
    topRail.isPlatform = true;

    // 枕木 5本（センサー：見た目のみ）
    const platBodies = [topRail];
    const tieCount = 5;
    for (let i = 0; i < tieCount; i++) {
      const tieX = W / 2 - railW * 0.4 + (railW * 0.8) * (i / (tieCount - 1));
      platBodies.push(Bodies.rectangle(
        tieX, this.platformTopY + railH + tieGap / 2, 10, tieGap,
        { isStatic: true, isSensor: true, collisionFilter: { mask: 0 },
          render: { fillStyle: '#5a5a5a' } }
      ));
    }

    // 下レール（センサー：見た目のみ）
    platBodies.push(Bodies.rectangle(
      W / 2, this.platformTopY + railH + tieGap + botH / 2, railW, botH,
      { isStatic: true, isSensor: true, collisionFilter: { mask: 0 },
        chamfer: { radius: 3 }, render: { fillStyle: '#d0d0d0' } }
    ));

    World.add(this.world, platBodies);

    // カメラ初期化（最初は普通に正面）
    this.camY = 0;
    this.targetCamY = 0;
    this.applyCamera();

    this.deathMargin = 160;

    this.addStudioDecor();
    this.spawnNext();
    Events.on(this.engine, 'afterUpdate', () => this.tick());

    Events.on(this.engine, 'collisionStart', (event) => {
      if (this.gameOver) return;
      for (const { bodyA, bodyB } of event.pairs) {
        // コマ同士の接触で lastTouchedBy を更新する
        if (bodyA.dropped && bodyB.dropped) {
          if (bodyA === this.waitingBody) {
            // Aが落下中の新コマ → Bを「最後に触れたのはAのP」に更新。Aは変えない
            bodyB.lastTouchedBy = bodyA.droppedBy;
          } else if (bodyB === this.waitingBody) {
            // Bが落下中の新コマ → Aを「最後に触れたのはBのP」に更新。Bは変えない
            bodyA.lastTouchedBy = bodyB.droppedBy;
          } else {
            // どちらもすでに落ち着いたコマ（連鎖）→ 互いに更新
            bodyA.lastTouchedBy = bodyB.droppedBy;
            bodyB.lastTouchedBy = bodyA.droppedBy;
          }
        }

        // waitingBody が何かに触れた瞬間、ターン切替フラグを立てる
        if (!this.pendingSwitch && this.waitingBody) {
          if (bodyA === this.waitingBody || bodyB === this.waitingBody) {
            const other = bodyA === this.waitingBody ? bodyB : bodyA;
            if (!other.isSensor) this.pendingSwitch = true;
          }
        }
      }
    });
    if (this.onHudUpdate) this.onHudUpdate();
  },

  // スタジオの照明機材をワールドに追加する
  // isSensor: true で物理衝突をなくし、見た目だけのオブジェクトにする
  addStudioDecor() {
    const W = this.W;
    const bodies = [];

    // カメラが上がるほど見えてくる照明トラスの高さ（Yが小さいほど上）
    const trussYs = [-80, -340, -660, -1050];

    trussYs.forEach(y => {
      // 横に伸びるトラスバー（金属フレーム風）
      bodies.push(Bodies.rectangle(W / 2, y, W, 14, {
        isStatic: true, isSensor: true,
        collisionFilter: { mask: 0 },
        render: { fillStyle: '#222' }
      }));

      // トラスに3つのスポットライトをぶら下げる
      const count = 3;
      for (let j = 0; j < count; j++) {
        const lx = W * (j + 1) / (count + 1);

        // ケーブル（細い棒）
        bodies.push(Bodies.rectangle(lx, y + 20, 3, 28, {
          isStatic: true, isSensor: true,
          collisionFilter: { mask: 0 },
          render: { fillStyle: '#111' }
        }));

        // ライト本体（台形っぽく見せるため縦長の四角）
        bodies.push(Bodies.rectangle(lx, y + 42, 20, 22, {
          isStatic: true, isSensor: true,
          collisionFilter: { mask: 0 },
          render: { fillStyle: '#1a1a1a' }
        }));

        // 発光部分（明るい円）
        bodies.push(Bodies.circle(lx, y + 57, 9, {
          isStatic: true, isSensor: true,
          collisionFilter: { mask: 0 },
          render: { fillStyle: '#fff9cc' }
        }));
      }
    });

    // スタジオの天井（一番上まで積んだときに見える）
    bodies.push(Bodies.rectangle(W / 2, -1250, W, 80, {
      isStatic: true, isSensor: true,
      collisionFilter: { mask: 0 },
      render: { fillStyle: '#181818' }
    }));

    // ---- 床・地面（スタジオの床面）----
    const floorY = this.platformTopY + 90; // ドリーレールの80px下

    // 床面（光沢コンクリート）
    bodies.push(Bodies.rectangle(W / 2, floorY + 7, W * 2, 14, {
      isStatic: true, isSensor: true, collisionFilter: { mask: 0 },
      render: { fillStyle: '#c8c8c8' }
    }));

    // 地面（床の厚み・コンクリートブロック）
    bodies.push(Bodies.rectangle(W / 2, floorY + 260, W * 2, 500, {
      isStatic: true, isSensor: true, collisionFilter: { mask: 0 },
      render: { fillStyle: '#909090' }
    }));

    // 床タイルの目地（横線を4本）
    for (let i = 0; i < 4; i++) {
      bodies.push(Bodies.rectangle(W / 2, floorY + 14 + i * 60, W * 2, 2, {
        isStatic: true, isSensor: true, collisionFilter: { mask: 0 },
        render: { fillStyle: '#787878' }
      }));
    }

    World.add(this.world, bodies);
  },

  // カメラ位置をレンダラの bounds に反映
  applyCamera() {
    const r = this.render;
    r.bounds.min.x = 0;
    r.bounds.max.x = this.W;
    r.bounds.min.y = this.camY;
    r.bounds.max.y = this.camY + this.H;
  },

  // タワーの現在の頂上を探して、その上にスポーン座標を計算する
  calcSpawnY() {
    let topMost = this.platformTopY; // 何も積んでいないときは土台の天面を基準にする
    const bodies = Composite.allBodies(this.world);
    for (const b of bodies) {
      // dropped フラグが付いた（落としたあとの）コマだけを対象にする
      if (b.dropped && b.bounds.min.y < topMost) topMost = b.bounds.min.y;
    }
    // コマ1個分くらい上に出す（小さすぎると土台に刺さるので 1.3 倍の余白）
    const pieceSize = Math.max(45, this.W * 0.14); // spawnNext の targetW と合わせる
    return topMost - pieceSize * 1.3;
  },

  // 現在のスポーンY座標を返す（ドラッグ中もこの値を使い続けることで位置がぶれない）
  spawnY() {
    return this.currentSpawnY;
  },

  // --- 次のコマを出す ---
  spawnNext() {
    if (this.gameOver) return;
    const W = this.W;
    const item = PhotoStore.random();
    if (!item) return;

    // 表示サイズ：土台幅と同じくらい（本家の比率に寄せる）
    const targetW = Math.max(45, W * 0.50);
    const scale = targetW / item.w;

    const scaledVerts = item.verts.map(v => ({ x: v.x * scale, y: v.y * scale }));

    // タワー頂上を基準にスポーン座標を確定する（この後 spawnY() はこの値を返し続ける）
    this.currentSpawnY = this.calcSpawnY();

    const body = Bodies.fromVertices(
      W / 2, this.spawnY(),
      [scaledVerts],
      {
        restitution: 0.02,
        friction: 1.0,
        frictionStatic: 1.2,
        frictionAir: 0.045,
        density: 0.0012,
        isStatic: true,
        render: { sprite: { texture: item.url, xScale: scale, yScale: scale } }
      },
      true
    );
    body.spriteScale = scale;

    World.add(this.world, body);
    this.activeBody = body;
    this.canDrop = true;
  },

  // 画面座標 → ワールド座標へ変換（カメラ分を足す）
  pointerToWorld(e) {
    const rect = this.render.canvas.getBoundingClientRect();
    const sx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const x = Math.max(0, Math.min(rect.width, sx));
    return x; // Xはスクロールしないのでそのまま
  },

  onDown(e) {
    if (!this.activeBody || !this.canDrop || this.gameOver) return;
    this.dragging = true;
    this.moveActive(e);
  },
  onMove(e) {
    if (!this.dragging) return;
    this.moveActive(e);
    e.preventDefault();
  },
  onUp() {
    if (!this.dragging || !this.activeBody) return;
    this.dragging = false;
    this.drop();
  },
  moveActive(e) {
    if (!this.activeBody) return;
    const W = this.W;
    const half = (this.activeBody.bounds.max.x - this.activeBody.bounds.min.x) / 2;
    let x = this.pointerToWorld(e);
    x = Math.max(half, Math.min(W - half, x));
    Body.setPosition(this.activeBody, { x, y: this.spawnY() });
  },
  drop() {
    if (!this.activeBody || !this.canDrop) return;
    this.canDrop = false;
    Body.setStatic(this.activeBody, false);
    this.activeBody.dropped = true;
    this.activeBody.droppedBy = this.currentPlayer;
    this.activeBody.lastTouchedBy = this.currentPlayer; // 最後に触れたP（接触のたびに更新）
    this.waitingBody = this.activeBody;
    this.activeBody = null;
    this.placedCount++;
    this.settleTimer = 0;
    if (this.onHudUpdate) this.onHudUpdate();
  },

  rotateActive() {
    if (!this.activeBody || !this.canDrop || this.gameOver) return;
    Body.rotate(this.activeBody, Math.PI / 4); // 45度ずつ回転（本家に近い操作感）
    const W = this.W;
    const half = (this.activeBody.bounds.max.x - this.activeBody.bounds.min.x) / 2;
    let x = Math.max(half, Math.min(W - half, this.activeBody.position.x));
    Body.setPosition(this.activeBody, { x, y: this.spawnY() });
  },

  // --- 毎フレーム ---
  tick() {
    if (this.gameOver) return;

    // タワーの一番上（最小Y）を探して、カメラ目標を決める
    let topMost = this.platformTopY;
    const bodies = Composite.allBodies(this.world);
    for (const b of bodies) {
      if (b.dropped) {
        if (b.bounds.min.y < topMost) topMost = b.bounds.min.y;
        // 場外判定（下・左右）。最後にそのコマに触れたPが負け
        if (b.position.y > this.platformTopY + this.H + this.deathMargin ||
            b.position.x < -this.deathMargin ||
            b.position.x > this.W + this.deathMargin) {
          return this.endGame(b.lastTouchedBy);
        }
      }
    }

    // タワーが画面上1/3より高くなったら、その分カメラを上げる
    const desiredTopOnScreen = this.H * 0.28;      // 画面上のこの位置にタワー頂上が来るように
    this.targetCamY = Math.min(0, topMost - desiredTopOnScreen);

    // カメラをなめらかに追従
    this.camY += (this.targetCamY - this.camY) * 0.04; // 小さいほどゆっくり追従。大きすぎるとぐわんぐわんする
    this.applyCamera();

    // collisionStart で pendingSwitch が立ったら、次のtickでターンを切り替える
    // （物理ステップ中に World.add するのを避けるため、1tick遅らせている）
    if (this.pendingSwitch) {
      this.pendingSwitch = false;
      this.waitingBody = null;
      this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
      if (this.onHudUpdate) this.onHudUpdate();
      this.spawnNext();
    }
  },

  endGame(loser) {
    this.gameOver = true;
    // loser が渡されない場合（想定外の経路）は currentPlayer で代用
    if (loser === undefined) loser = this.currentPlayer;
    const winner = loser === 1 ? 2 : 1;
    if (this.onGameOver) this.onGameOver(winner, loser, this.placedCount);
  }
};

window.Game = Game;