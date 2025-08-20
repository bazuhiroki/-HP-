// --- 基本設定 ---
const NOTION_API_KEY = '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'; 
const MOVIE_DATABASE_ID = 'f0cc111f02f45fbab2d2bf4b9db7d71';

// --- HTML要素の取得 ---
const gridContainer = document.getElementById('grid-container');
const gridItems = document.querySelectorAll('.grid-item');

// --- Notionから映画データを取得する関数 ---
async function fetchNotionMovieData() {
    try {
        const response = await fetch(`https://api.notion.com/v1/databases/${MOVIE_DATABASE_ID}/query`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${NOTION_API_KEY}`,
                'Content-Type': 'application/json',
                'Notion-Version': '2022-06-28'
            }
        });
        if (!response.ok) throw new Error('Notion API Error');
        const data = await response.json();

        return data.results.map(page => {
            const properties = page.properties;
            const titleProp = properties["名前"] || properties["タイトル"];
            const tagsProp = properties["ジャンル"] || properties["Tags"];
            
            return {
                title: titleProp?.title[0]?.plain_text || 'タイトル不明',
                cover: page.cover?.file?.url || page.cover?.external?.url || null,
                tags: tagsProp?.multi_select?.map(tag => tag.name) || []
            };
        });
    } catch (error) {
        console.error(error);
        return null;
    }
}

// --- イベントリスナーの処理 ---
gridItems.forEach(item => {
    // ▼▼▼【修正点】リスナーを item そのものに付け直しました ▼▼▼
    item.addEventListener('click', async (event) => {
        // 全画面表示ボタンをクリックした場合は、この処理を中断する
        if (event.target.classList.contains('fullscreen-button')) {
            return;
        }
        event.preventDefault();

        if (item.classList.contains('is-focused')) {
            gridContainer.classList.remove('focus-active');
            item.classList.remove('is-focused');
        } else {
            gridContainer.classList.add('focus-active');
            gridItems.forEach(i => i.classList.remove('is-focused'));
            item.classList.add('is-focused');

            if (item.classList.contains('movie')) {
                const movieDetailElement = item.querySelector('.content-detail');
                movieDetailElement.innerHTML = `<h2>映画</h2><p>Notionからデータを読み込み中...</p><button class="fullscreen-button">全画面表示</button>`;
                
                const movies = await fetchNotionMovieData();
                if (movies) {
                    const cardsHtml = movies.map(movie => {
                        const tagsHtml = movie.tags.map(tag => `<span class="movie-card-tag">${tag}</span>`).join('');
                        const coverStyle = movie.cover ? `style="background-image: url(${movie.cover})"` : '';

                        return `
                            <div class="movie-card">
                                <div class="movie-card-cover" ${coverStyle}></div>
                                <div class="movie-card-info">
                                    <div class="movie-card-tags">${tagsHtml}</div>
                                    <p class="movie-card-title">${movie.title}</p>
                                </div>
                            </div>
                        `;
                    }).join('');
                    
                    movieDetailElement.innerHTML = `
                        <h2>映画</h2>
                        <p>Notionで記録した映画リストです。</p>
                        <div class="card-view-container">${cardsHtml}</div>
                        <button class="fullscreen-button">全画面表示</button>
                    `;
                } else {
                     movieDetailElement.innerHTML = `<h2>映画</h2><p>データの読み込みに失敗しました。</p><button class="fullscreen-button">全画面表示</button>`;
                }
            }
        }
    });

    // --- 全画面表示ボタンの処理 ---
    const fullscreenButton = item.querySelector('.fullscreen-button');
    fullscreenButton.addEventListener('click', (event) => {
        event.stopPropagation();
        const detailContent = item.querySelector('.content-detail').innerHTML;
        const overlay = document.createElement('div');
        overlay.className = 'fullscreen-overlay';
        const closeButton = document.createElement('button');
        closeButton.className = 'close-button';
        closeButton.innerHTML = '&times;';
        overlay.innerHTML = detailContent;
        // 詳細エリア内の全画面ボタンはオーバーレイでは不要なので削除
        const originalFsBtn = overlay.querySelector('.fullscreen-button');
        if (originalFsBtn) {
            originalFsBtn.remove();
        }
        overlay.appendChild(closeButton);
        document.body.appendChild(overlay);
        closeButton.addEventListener('click', () => {
            document.body.removeChild(overlay);
        });
    });
});

// --- 背景クリックでフォーカス解除 ---
gridContainer.addEventListener('click', (event) => {
    if (event.target === gridContainer) {
        gridContainer.classList.remove('focus-active');
        gridItems.forEach(i => i.classList.remove('is-focused'));
    }
});
