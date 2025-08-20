// --- 基本設定 ---
const NOTION_API_KEY = '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';
const MOVIE_DATABASE_ID = '6acc1111f02f4977b5b782b2d4d64b71';
const TMDB_API_KEY = '9581389ef7dc448dc8b17ea22a930bf3';

// --- HTML要素の取得 ---
const gridContainer = document.getElementById('grid-container');
const gridItems = document.querySelectorAll('.grid-item');

// --- API通信用の関数 (変更なし) ---
// (ここに fetchNotionMovies, searchTmdbMovie, getTmdbWatchProviders, updateNotionPageAsWatched の4つの関数が入ります)
// ...

// --- イベントリスナーの処理 ---
gridItems.forEach(item => {
    item.addEventListener('click', async (event) => {
        // ... (クリック時のフォーカス処理は前回と同じです)
    });

    // ▼▼▼【修正点】ボタンが存在するか確認する処理を追加 ▼▼▼
    const fullscreenButton = item.querySelector('.fullscreen-button');
    if (fullscreenButton) {
        fullscreenButton.addEventListener('click', (event) => {
            event.stopPropagation();

            if (item.classList.contains('movie')) {
                // ... (映画カードの全画面表示処理)
            } else {
                // ... (それ以外のカードの全画面表示処理)
            }
        });
    }
});

// --- 背景クリックでフォーカス解除 (変更なし) ---
// ...
