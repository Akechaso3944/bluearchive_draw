/**
 * ブルーアーカイブ生徒抽選システム - 状態管理と演出ロジック
 */

// 【ホスト専用設定】リセットに必要なコード（srt2026）をSHA-256で暗号化した文字列
const RESET_CODE_HASH = '86551ac000fbb867502a28292f9217d4bad0354bc64dd38dddf2f3746ed59054';

async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// アプリケーション全体の状態管理（State）
let allStudents = [];      // jsonから読み込んだ全生徒データ
let drawnStudentIds = [];  // すでに当選した生徒のIDリスト（localStorageと同期）

// DOM要素のキャッシュ
const elDrawCount = document.getElementById('draw-count');
const elBtnStart = document.getElementById('btn-start');
const elBtnReset = document.getElementById('btn-reset');
const elRemainingCount = document.getElementById('remaining-count');
const elTotalCount = document.getElementById('total-count');
const elRouletteDisplay = document.getElementById('roulette-display');
const elRouletteName = document.getElementById('roulette-name');
const elRouletteSchool = document.getElementById('roulette-school');
const elResultsGrid = document.getElementById('results-grid');

// 1. アプリケーションの初期化
document.addEventListener('DOMContentLoaded', async () => {
    await loadStudentsData();
    loadFromLocalStorage();
    updateUI();
    
    // イベントリスナーの登録
    elBtnStart.addEventListener('click', startLottery);
    elBtnReset.addEventListener('click', resetLottery);
});

// 2. データの読み込み
async function loadStudentsData() {
    try {
        // GitHub Pages環境でもルート相対パスで動作するように指定
        const response = await fetch('./students.json');
        const data = await response.json();
        
        // 必須条件：「実装済みキャラ(implemented: true)」のみを対象にする
        allStudents = data.filter(student => student.implemented === true);
    } catch (error) {
        console.error('生徒データの読み込みに失敗しました:', error);
        alert('生徒データのインポートに失敗しました。students.jsonの配置を確認してください。');
    }
}

// 3. ローカルストレージの状態復元
function loadFromLocalStorage() {
    const saved = localStorage.getItem('ba_drawn_student_ids');
    if (saved) {
        try {
            drawnStudentIds = JSON.parse(saved);
        } catch (e) {
            drawnStudentIds = [];
        }
    }
}

// 4. ローカルストレージへの保存
function saveToLocalStorage() {
    localStorage.setItem('ba_drawn_student_ids', JSON.stringify(drawnStudentIds));
}

// 5. UIの更新（残人数や当選カードの描画）
function updateUI() {
    // 抽選可能なプール（まだ当選していない生徒）を取得
    const pool = allStudents.filter(s => !drawnStudentIds.includes(s.id));
    
    elRemainingCount.textContent = pool.length;
    elTotalCount.textContent = allStudents.length;

    // 当選者グリッドのリセットと再描画（ページリロード時などの再現用）
    elResultsGrid.innerHTML = '';
    
    // 時系列順（古い順、または新しい順）で表示するため、保存されているID順にカードを生成
    drawnStudentIds.forEach(id => {
        const student = allStudents.find(s => s.id === id);
        if (student) {
            appendStudentCard(student);
        }
    });
}

// 6. 生徒カードの動的生成
function appendStudentCard(student) {
    const card = document.createElement('div');
    card.className = 'student-card';
    
    // 将来の拡張（フィルター・検索）で操作しやすいようカスタムデータ属性を付与
    card.dataset.id = student.id;
    card.dataset.school = student.school;
    
    card.innerHTML = `
        <span class="school-tag">${escapeHtml(student.school)}</span>
        <div class="student-name">${escapeHtml(student.name)}</div>
    `;
    
    // 新しいものを先頭に追加する場合は prepend、後ろなら appendChild
    elResultsGrid.appendChild(card);
}

// 7. 抽選ロジックとルーレット演出
async function startLottery() {
    // 入力された抽選人数の取得とバリデーション
    const count = parseInt(elDrawCount.value, 10);
    if (isNaN(count) || count < 1) {
        alert('1以上の正しい人数を入力してください。');
        return;
    }

    // 現在抽選可能な生徒のプールを作成
    let pool = allStudents.filter(s => !drawnStudentIds.includes(s.id));

    if (pool.length === 0) {
        alert('全ての生徒が抽選されました！リセットしてください。');
        return;
    }

    // 抽選要求数が残り人数より多い場合は、残り全数をターゲットにする
    const actualDrawCount = Math.min(count, pool.length);
    
    // ボタンの無効化（演出中の連続クリック防止）
    setControlsEnabled(false);
    elRouletteDisplay.classList.remove('hidden');

    // 指定された人数分、1人ずつ連続でルーレット演出を行いながら抽選
    for (let i = 0; i < actualDrawCount; i++) {
        // 残りプールが途中で空になった場合の安全弁
        if (pool.length === 0) break;

        // 今回の当選者をランダムに選定
        const randomIndex = Math.floor(Math.random() * pool.length);
        const winner = pool[randomIndex];

        // ルーレット演出（名前が高速切り替わり⇒ゆっくり停止）を実行
        await runRouletteAnimation(pool, winner);

        // 状態の更新
        drawnStudentIds.push(winner.id);
        saveToLocalStorage();
        
        // 画面にカードを追加し、ステータスを更新
        appendStudentCard(winner);
        
        // 次の周回のためにプールから今選ばれた生徒を除外
        pool = pool.filter(s => s.id !== winner.id);
        elRemainingCount.textContent = pool.length;
    }

    // 演出終了後の後処理
    setTimeout(() => {
        elRouletteDisplay.classList.add('hidden');
        setControlsEnabled(true);
    }, 1000);
}

// 8. ルーレットのアニメーション処理（Promiseで同期制御）
function runRouletteAnimation(currentPool, finalWinner) {
    return new Promise((resolve) => {
        let speed = 50;       // 初期切り替え速度 (ミリ秒)
        let duration = 0;     // 経過時間カウント
        const maxFastDuration = 1200; // 高速回転する時間
        let intervalId;

        // 高速フラッシュおよび段階的減速を行う関数
        const tick = () => {
            duration += speed;
            
            // ランダムにプール内の生徒を表示してシャッフル感を出す
            const randomPick = currentPool[Math.floor(Math.random() * currentPool.length)];
            elRouletteName.textContent = randomPick.name;
            elRouletteSchool.textContent = randomPick.school;

            if (duration < maxFastDuration) {
                // 高速期間中は一定間隔でループ
                intervalId = setTimeout(tick, speed);
            } else if (speed < 300) {
                // ゆっくり停止させるために徐々にディレイ（ウェイト）を重くする
                speed += 50;
                intervalId = setTimeout(tick, speed);
            } else {
                // 最後に最終決定した当選者を表示して停止
                elRouletteName.textContent = finalWinner.name;
                elRouletteSchool.textContent = finalWinner.school;
                
                // 少し余韻を残してから次の処理へ進む
                setTimeout(resolve, 600);
            }
        };

        // アニメーション開始
        tick();
    });
}

// 9. 暗号化対応・ホスト認証付き全復元（リセット）
async function resetLottery() {
    // パスワード入力ダイアログを表示
    const userInput = prompt('抽選履歴をリセットするには、ホスト用のリセットコードを入力してください：');
    
    // キャンセルされた場合は何もしない
    if (userInput === null) {
        return;
    }
    
    // 入力された文字をその場で暗号化
    const inputHash = await sha256(userInput);
    
    // 暗号同士を比較して判定 (RESET_CODE_HASH に修正)
    if (inputHash === RESET_CODE_HASH) {
        drawnStudentIds = [];
        saveToLocalStorage();
        updateUI();
        elRouletteDisplay.classList.add('hidden');
        alert('抽選履歴をリセットしました。');
    } else {
        alert('リセットコードが正しくありません。ホスト権限がありません。');
    }
}

// 10. 操作パーツの有効・無効切り替え補助関数
function setControlsEnabled(enabled) {
    elBtnStart.disabled = !enabled;
    elBtnReset.disabled = !enabled;
    elDrawCount.disabled = !enabled;
    
    // スタイル変更用
    elBtnStart.style.opacity = enabled ? '1' : '0.5';
    elBtnReset.style.opacity = enabled ? '1' : '0.5';
}

// 11. XSS対策用のエスケープ関数
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, (match) => {
        const escapeMap = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        };
        return escapeMap[match];
    });
}