/* ============================================
   main.js
   画面切り替えとボタン操作の司令塔
   ============================================ */

if (window.decomp) Matter.Common.setDecomp(window.decomp);

// --- DOM参照 ---
const titleScreen      = document.getElementById('titleScreen');
const gameScreen       = document.getElementById('gameScreen');
const resultEl         = document.getElementById('result');
const previewEl        = document.getElementById('preview');
const startBtn         = document.getElementById('startBtn');         // 中央プレイボタン
const friendBattleBtn  = document.getElementById('friendBattleBtn');  // フレンド対戦ボタン
const turnBadge        = document.getElementById('turnBadge');
const countLabel       = document.getElementById('countLabel');
const canvasWrap       = document.getElementById('canvasWrap');
const hint             = document.getElementById('hint');
const rotateBtn        = document.getElementById('rotateBtn');
const unimplToast      = document.getElementById('unimplToast');

// ============================================
// 未実装ボタンのトースト表示
// ============================================
let toastTimer = null;
function showUnimpl() {
  unimplToast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => unimplToast.classList.remove('show'), 1200);
}

// 未実装ボタンをまとめて配線
['giftBtn','questBtn','shopBtn','mailBtn','recordBtn','settingsBtn','rankBtn']
  .forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', showUnimpl);
  });

// ============================================
// 起動時：画像を全部読み込む
// ============================================
PhotoStore.loadAll(() => {
  renderPreview();
});

function renderPreview() {
  previewEl.innerHTML = '';

  if (PhotoStore.list.length === 0) {
    previewEl.innerHTML = '<div class="empty-hint">images フォルダに画像がありません</div>';
    startBtn.disabled = true;
    friendBattleBtn.disabled = true;
    return;
  }

  // 画像を左スタック（偶数インデックス）と右スタック（奇数インデックス）に振り分ける
  const leftStack  = document.createElement('div');
  const rightStack = document.createElement('div');
  leftStack.className  = 'th-char-stack';
  rightStack.className = 'th-char-stack';

  PhotoStore.list.forEach((item, i) => {
    const img = document.createElement('img');
    img.src = item.url;
    img.className = 'th-char-img';
    // i番目の画像が i * 0.13秒 遅れて上から落ちてくる
    img.style.animation = `fallIn 0.55s ease-out ${i * 0.13}s both`;
    // 先頭に挿入することで「配列の先頭が一番下」に見えるようにする
    if (i % 2 === 0) leftStack.insertBefore(img, leftStack.firstChild);
    else             rightStack.insertBefore(img, rightStack.firstChild);
  });

  previewEl.appendChild(leftStack);
  previewEl.appendChild(rightStack);

  startBtn.disabled = false;
  friendBattleBtn.disabled = false;
}

// ============================================
// 画面切り替え
// ============================================
function showScreen(el) {
  [titleScreen, gameScreen].forEach(s => s.classList.add('hidden'));
  el.classList.remove('hidden');
}

// ============================================
// ゲームのコールバック
// ============================================
Game.onHudUpdate = () => {
  turnBadge.textContent = 'P' + Game.currentPlayer + 'のばん';
  turnBadge.className = 'turn-badge ' + (Game.currentPlayer === 1 ? 'turn-p1' : 'turn-p2');
  countLabel.textContent = '置いた数: ' + Game.placedCount;
};

Game.onGameOver = (winner, loser, count) => {
  document.getElementById('resultTitle').textContent = 'P' + winner + 'のかち！🎉';
  document.getElementById('resultSub').textContent =
    'P' + loser + 'が落としちゃった… (置いた数: ' + count + ')';
  setTimeout(() => resultEl.classList.remove('hidden'), 600);
};

// ============================================
// ゲーム開始
// ============================================
function beginGame() {
  showScreen(gameScreen);
  hint.style.display = '';
  Game.start(canvasWrap);
}

// 中央プレイボタンとフレンド対戦ボタン、どちらでも開始できる
startBtn.addEventListener('click', beginGame);
friendBattleBtn.addEventListener('click', beginGame);

document.getElementById('againBtn').onclick = () => {
  resultEl.classList.add('hidden');
  beginGame();
};

document.getElementById('homeBtn').onclick = () => {
  resultEl.classList.add('hidden');
  Game.teardown();
  showScreen(titleScreen);
};

// ============================================
// 入力イベント（タッチ＋マウス）
// ============================================
canvasWrap.addEventListener('touchstart', e => Game.onDown(e), { passive: false });
canvasWrap.addEventListener('touchmove',  e => Game.onMove(e), { passive: false });
canvasWrap.addEventListener('touchend',   () => Game.onUp());
canvasWrap.addEventListener('mousedown',  e => Game.onDown(e));
window.addEventListener('mousemove',      e => Game.onMove(e));
window.addEventListener('mouseup',        () => Game.onUp());

rotateBtn.addEventListener('click', () => Game.rotateActive());
