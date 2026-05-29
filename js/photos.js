/* ============================================
   photos.js
   あらかじめ用意した透過PNGを読み込み、
   その「輪郭」から物理用のざっくり多角形を自動で作る。
   ============================================ */

// ★ ここに使いたい画像を並べる。友達の透過PNGができたら差し替え／追加する。
const IMAGE_FILES = [
  'images/friend1.png',
  'images/friend2.png',
  'images/friend3.png',
  'images/friend4.png',
  'images/friend5.png',
];

const PhotoStore = {
  // 読み込み済みデータ。1件 = { url, img, verts(物理用頂点), w, h }
  list: [],

  // 全画像を読み込んで輪郭解析する。終わったら done() を呼ぶ。
  loadAll(done) {
    let loaded = 0;
    if (IMAGE_FILES.length === 0) { done(); return; }

    // ?v=... を付けることでブラウザキャッシュを無効化する（開発中の画像差し替えに有効）
    const bust = '?v=' + Date.now();
    IMAGE_FILES.forEach((src) => {
      const url = src + bust;
      const img = new Image();
      img.onload = () => {
        const verts = buildOutline(img);
        this.list.push({ url, img, verts, w: img.width, h: img.height });
        loaded++;
        if (loaded === IMAGE_FILES.length) done();
      };
      img.onerror = () => {
        console.warn('画像が読めませんでした:', src);
        loaded++;
        if (loaded === IMAGE_FILES.length) done();
      };
      img.src = url;
    });
  },

  // ランダムに1件返す
  random() {
    return this.list[Math.floor(Math.random() * this.list.length)];
  }
};

/* --------------------------------------------
   透過PNGの「不透明な部分」を読み取り、
   外周をたどってざっくりした多角形(頂点配列)を作る。
   見た目は画像のまま、当たり判定だけ簡略化する。
---------------------------------------------*/
function buildOutline(img) {
  // 解析用に小さめへ縮小（軽さ優先）
  const N = 64;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, N, N);
  const data = ctx.getImageData(0, 0, N, N).data;

  // alpha が一定以上なら「中身」とみなす
  const solid = (x, y) => {
    if (x < 0 || y < 0 || x >= N || y >= N) return false;
    return data[(y * N + x) * 4 + 3] > 40;
  };

  // 角度ごとに中心から外へ探って、輪郭の点を拾う（放射状サンプリング）
  const cx = N / 2, cy = N / 2;
  const STEPS = 16; // 頂点数。多いほど正確だが重い
  const pts = [];
  for (let i = 0; i < STEPS; i++) {
    const ang = (i / STEPS) * Math.PI * 2;
    const dx = Math.cos(ang), dy = Math.sin(ang);
    let last = null;
    for (let r = 1; r < N / 2; r++) {
      const x = Math.round(cx + dx * r);
      const y = Math.round(cy + dy * r);
      if (solid(x, y)) last = { x, y };
    }
    if (last) pts.push(last);
  }

  // 画像の実サイズへスケールし直して返す
  const sx = img.width / N, sy = img.height / N;
  const verts = pts.map(p => ({ x: p.x * sx, y: p.y * sy }));

  // 万一点が少なすぎたら四角でフォールバック
  if (verts.length < 3) {
    return [
      { x: 0, y: 0 }, { x: img.width, y: 0 },
      { x: img.width, y: img.height }, { x: 0, y: img.height }
    ];
  }

  // 頂点が隙間なく取れている（＝ほぼ四角形）なら 4 頂点に丸める
  // STEPS=16 のうち 14 点以上取れていたら「全面不透明」とみなす
  if (verts.length >= STEPS * 0.85) {
    return [
      { x: 0, y: 0 }, { x: img.width, y: 0 },
      { x: img.width, y: img.height }, { x: 0, y: img.height }
    ];
  }

  return verts;
}

window.PhotoStore = PhotoStore;
