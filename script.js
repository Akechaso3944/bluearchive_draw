/**
 * ブルーアーカイブ生徒抽選システム - 状態管理と演出ロジック
 */

// システム整合性チェック用ID
const SYSTEM_CORE_ID = '86551ac000fbb867502a28292f9217d4bad0354bc64dd38dddf2f3746ed59054';

async function whycanyouseethecode(key) {
    const buffer = new TextEncoder().encode(key);
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    const array = Array.from(new Uint8Array(digest));
    return array.map(b => b.toString(16).padStart(2, '0')).join('');
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
        const response = await fetch('./students.json');
        const data = await response.json();
        allStudents = data.filter(student => student.implemented === true);
    } catch (error) {
        console.error('データ同期エラー:', error);
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
        alert('全ての生徒が抽選されました！リセットしてください。');
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

// 9. システム検証付きデータ初期化
async function resetLottery() {
    const userInput = prompt('確認のため、管理コードを入力してください：');
    
    if (userInput === null) {
        return;
    }
    
    // 関数名を変更
    const token = await whycanyouseethecode(userInput);
    
    if (token === SYSTEM_CORE_ID) {
        drawnStudentIds = [];
        saveToLocalStorage();
        updateUI();
        elRouletteDisplay.classList.add('hidden');
        alert('初期化が完了しました。');
    } else {
        alert('コードが一致しません。処理を中断します。');
    }
}

// 10. 操作パーツの有効・無効切り替え補助関数
function setControlsEnabled(enabled) {
    elBtnStart.disabled = !enabled;
    elBtnReset.disabled = !enabled;
    elDrawCount.disabled = !enabled;
    
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