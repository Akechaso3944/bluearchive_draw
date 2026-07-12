/**
 * ブルーアーカイブ生徒抽選システム - 状態管理と演出ロジック
 */

const IS_TEST_PERIOD = true;

const PUBLIC_TEST_CODE_ID = 'e74676be461fbf21d4c88a8d6b63d917d5c5fa35ab7809a473ee502e6c5354e7';

const USER_RESET_MAP = {
    
};


async function whycanyouseethecode(key) {
    if (!key) return '';
    const buffer = new TextEncoder().encode(key);
    const p1 = 'S'; const p2 = 'H'; const p3 = 'A'; const p4 = '-'; const p5 = '256';
    const targetMethod = p1 + p2 + p3 + p4 + p5;
    const digest = await crypto.subtle.digest(targetMethod, buffer);
    const array = Array.from(new Uint8Array(digest));
    return array.map(b => b.toString(16).padStart(2, '0')).join('');
}

// アプリケーション全体の状態管理（State）
let allStudents = [];      
let drawnStudentIds = [];  
let currentUserId = '';    

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
    await checkAndRegisterUser();
    await loadStudentsData();
    loadFromLocalStorage();
    updateUI();
    
    // イベントリスナーの登録
    elBtnStart.addEventListener('click', startLottery);
    elBtnReset.addEventListener('click', resetLottery);
});

// ユーザーIDの確認と新規登録
async function checkAndRegisterUser() {
    let savedUserId = localStorage.getItem('ba_user_id');
    
    while (!savedUserId || savedUserId.trim() === '') {
        const inputId = prompt('【初回登録】あなたのユーザーID（英数字）を決めて入力してください：\n（例: AAA1111）');
        if (inputId !== null && inputId.trim() !== '') {
            savedUserId = inputId.trim();
            localStorage.setItem('ba_user_id', savedUserId);
            alert(`ユーザーID「${savedUserId}」をこのブラウザに登録しました。`);
        } else {
            alert('ユーザーIDの登録が必要です。もう一度入力してください。');
        }
    }
    
    currentUserId = savedUserId;
}

// 2. データの読み込み
async function loadStudentsData() {
    try {
        const response = await fetch('./students.json');
        const data = await response.json();
        allStudents = data.filter(student => student.implemented === true);
    } catch (error) {
        console.error('データ同期エラー:', error);
        alert('生徒データのインポートに失敗しました。');
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

// 5. UIの更新
function updateUI() {
    const pool = allStudents.filter(s => !drawnStudentIds.includes(s.id));
    
    elRemainingCount.textContent = pool.length;
    elTotalCount.textContent = allStudents.length;
    elResultsGrid.innerHTML = '';
    
    drawnStudentIds.forEach(id => {
        const student = allStudents.find(s => s.id === id);
        if (student) {
            appendStudentCard(student);
        }
    });

    setControlsEnabled(true);
}

// 6. 生徒カードの動的生成
function appendStudentCard(student) {
    const card = document.createElement('div');
    card.className = 'student-card';
    card.dataset.id = student.id;
    card.dataset.school = student.school;
    
    card.innerHTML = `
        <span class="school-tag">${escapeHtml(student.school)}</span>
        <div class="student-name">${escapeHtml(student.name)}</div>
    `;
    elResultsGrid.appendChild(card);
}

// 7. 抽選ロジックとルーレット演出
async function startLottery() {
    const count = parseInt(elDrawCount.value, 10);
    if (isNaN(count) || count < 1) {
        alert('1以上の正しい人数を入力してください。');
        return;
    }

    let pool = allStudents.filter(s => !drawnStudentIds.includes(s.id));
    if (pool.length === 0) {
        alert('全ての生徒が抽選されました！');
        return;
    }

    const actualDrawCount = Math.min(count, pool.length);
    setControlsEnabled(false);
    elRouletteDisplay.classList.remove('hidden');

    for (let i = 0; i < actualDrawCount; i++) {
        if (pool.length === 0) break;

        const randomIndex = Math.floor(Math.random() * pool.length);
        const winner = pool[randomIndex];

        await runRouletteAnimation(pool, winner);

        drawnStudentIds.push(winner.id);
        saveToLocalStorage();
        appendStudentCard(winner);
        
        pool = pool.filter(s => s.id !== winner.id);
        elRemainingCount.textContent = pool.length;
    }

    setTimeout(() => {
        elRouletteDisplay.classList.add('hidden');
        setControlsEnabled(true);
    }, 1000);
}

// 8. ルーレットのアニメーション処理
function runRouletteAnimation(currentPool, finalWinner) {
    return new Promise((resolve) => {
        let speed = 50;
        let duration = 0;
        const maxFastDuration = 1200;
        let intervalId;

        const tick = () => {
            duration += speed;
            const randomPick = currentPool[Math.floor(Math.random() * currentPool.length)];
            elRouletteName.textContent = randomPick.name;
            elRouletteSchool.textContent = randomPick.school;

            if (duration < maxFastDuration) {
                intervalId = setTimeout(tick, speed);
            } else if (speed < 300) {
                speed += 50;
                intervalId = setTimeout(tick, speed);
            } else {
                elRouletteName.textContent = finalWinner.name;
                elRouletteSchool.textContent = finalWinner.school;
                setTimeout(resolve, 600);
            }
        };
        tick();
    });
}

// 9. パブリックテストコード＆個別コード対応のリセット処理
async function resetLottery() {
    const userIdHash = await whycanyouseethecode(currentUserId);
    
    // 【判定条件の拡張】テスト期間中ではない、かつホスト側マップにも登録がない場合は拒否
    if (!IS_TEST_PERIOD && !USER_RESET_MAP[userIdHash]) {
        alert(`ユーザーID「${currentUserId}」のリセット権限がホスト側で登録されていません。\nホスト（制作者）にリセットを依頼してください。`);
        return;
    }

    // パスワード入力ダイアログを表示
    const userInputCode = prompt(`【ID: ${currentUserId}】\nリセットを行うには、テスト用パブリックコードまたは指定されたリセットコードを入力してください：`);
    if (userInputCode === null) {
        return;
    }
    
    // 入力されたコードを暗号化
    const inputCodeHash = await whycanyouseethecode(userInputCode);
    
    let isSuccess = false;

    // A. テスト期間中の場合、パブリックコードとの一致を確認
    if (IS_TEST_PERIOD && inputCodeHash === PUBLIC_TEST_CODE_ID) {
        isSuccess = true;
    } 
    // B. 通常のユーザー個別コードとの一致を確認
    else if (USER_RESET_MAP[userIdHash] && inputCodeHash === USER_RESET_MAP[userIdHash]) {
        isSuccess = true;
    }

    // リセット実行判定
    if (isSuccess) {
        drawnStudentIds = [];
        saveToLocalStorage();
        updateUI();
        elRouletteDisplay.classList.add('hidden');
        alert('初期化が完了しました。すべての生徒が抽選対象に戻ります。');
    } else {
        alert('コードが正しくありません。処理を中断します。');
    }
}

// 10. 操作パーツの有効・無効切り替え補助関数
function setControlsEnabled(enabled) {
    elBtnStart.disabled = !enabled;
    elBtnReset.disabled = !enabled;
    elDrawCount.disabled = !enabled;
    
    elBtnStart.style.opacity = enabled ? '1' : '0.5';
    elBtnReset.style.opacity = enabled ? '1' : '0.5';
    elDrawCount.style.opacity = enabled ? '1' : '0.5';
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