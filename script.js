// --- 基本設定 ---
const NOTION_API_KEY = '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';
const MOVIE_DATABASE_ID = 'b3c72857276f4ca9a3c99b94ba910b53';
const TMDB_API_KEY = '9581389ef7dc448dc8b17ea22a930bf3';

// --- HTML要素の取得 ---
const gridContainer = document.getElementById('grid-container');
const gridItems = document.querySelectorAll('.grid-item');

// --- API通信用の関数 ---
// 1. Notionから映画リストを取得
async function fetchNotionMovies() {
    try {
        const response = await fetch(`https://api.notion.com/v1/databases/${MOVIE_DATABASE_ID}/query`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${NOTION_API_KEY}`, 'Content-Type': 'application/json', 'Notion-Version': '2022-06-28' }
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Notion API Error: ${errorData.message}`);
        }
        const data = await response.json();
        
        return data.results.map(page => {
            const properties = page.properties;
            const titlePropertyKey = Object.keys(properties).find(key => properties[key].type === 'title');
            const titleProperty = properties[titlePropertyKey];

            return {
                pageId: page.id,
                title: titleProperty?.title[0]?.plain_text || 'タイトル不明',
                cover: page.cover?.file?.url || page.cover?.external?.url || null,
                isWatched: properties["視聴済み"]?.checkbox || false
            };
        });
    } catch (error) { console.error(error); return []; }
}

// 2. TMDbで映画を検索し、IDを取得
async function searchTmdbMovie(title) {
    try {
        const response = await fetch(`https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&language=ja-JP`);
        if (!response.ok) throw new Error('TMDb Search Error');
        const data = await response.json();
        return data.results[0]?.id || null;
    } catch (error) { console.error(error); return null; }
}

// 3. TMDbで配信サービス情報を取得
async function getTmdbWatchProviders(movieId) {
    try {
        const response = await fetch(`https://api.themoviedb.org/3/movie/${movieId}/watch/providers?api_key=${TMDB_API_KEY}`);
        if (!response.ok) throw new Error('TMDb Providers Error');
        const data = await response.json();
        return data.results?.JP?.flatrate || [];
    } catch (error) { console.error(error); return []; }
}

// 4. Notionのページを更新（チェックボックスをオンにする）
async function updateNotionPageAsWatched(pageId) {
    try {
        const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${NOTION_API_KEY}`, 'Content-Type': 'application/json', 'Notion-Version': '2022-06-28' },
            body: JSON.stringify({
                properties: { "視聴済み": { checkbox: true } }
            })
        });
        if (!response.ok) throw new Error('Notion Update Error');
        return true;
    } catch (error) { console.error(error); return false; }
}

// --- イベントリスナーの処理 ---
gridItems.forEach(item => {
    item.addEventListener('click', async (event) => {
        if (event.target.closest('.watched-button') || event.target.closest('.fullscreen-button')) {
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
                const detailView = item.querySelector('.content-detail');
                detailView.innerHTML = `<p style="padding: 20px; color: #888;">Notionから情報を取得中...</p>`;

                const notionMovies = await fetchNotionMovies();
                
                let moviesHtml = '';
                if (notionMovies.length === 0) {
                    moviesHtml = '<p style="padding: 20px; color: #888;">Notionに映画データがありません。</p>';
                } else {
                    const moviePromises = notionMovies.map(async (movie) => {
                        const tmdbId = await searchTmdbMovie(movie.title);
                        const providers = tmdbId ? await getTmdbWatchProviders(tmdbId) : [];
                        
                        const providersHtml = providers.map(p => `
                            <a href="#" target="_blank" title="${p.provider_name}">
                                <img src="https://image.tmdb.org/t/p/w500${p.logo_path}" alt="${p.provider_name}" class="provider-logo">
                            </a>
                        `).join('');

                        return `
                            <div class="movie-focus-view" style="background-image: url(${movie.cover || ''})">
                                <h2 class="movie-title">${movie.title}</h2>
                                <div class="watch-providers">
                                    <h3>視聴可能なサービス</h3>
                                    <div class="provider-list">${providersHtml || '見放題サービスは見つかりませんでした。'}</div>
                                </div>
                                <button class="watched-button" data-page-id="${movie.pageId}" ${movie.isWatched ? 'disabled' : ''}>
                                    ${movie.isWatched ? '✅ 視聴済み' : '視聴済みにする'}
                                </button>
                            </div>
                        `;
                    });
                    moviesHtml = (await Promise.all(moviePromises)).join('');
                }
                
                detailView.innerHTML = moviesHtml;
                
                detailView.querySelectorAll('.watched-button').forEach(button => {
                    button.addEventListener('click', async () => {
                        const pageId = button.dataset.pageId;
                        button.textContent = '更新中...';
                        const success = await updateNotionPageAsWatched(pageId);
                        if (success) {
                            button.textContent = '✅ 視聴済みにしました';
                            button.classList.add('is-watched');
                            button.disabled = true;
                        } else {
                            button.textContent = 'エラーが発生しました';
                        }
                    });
                });
            }
        }
    });

    // 全画面表示ボタンの処理
    const fullscreenButton = item.querySelector('.fullscreen-button');
    if (fullscreenButton) { // ボタンが存在する場合のみリスナーを追加
        fullscreenButton.addEventListener('click', (event) => {
            event.stopPropagation();
            
            const detailContent = item.querySelector('.content-detail').innerHTML;
            const overlay = document.createElement('div');
            overlay.className = 'fullscreen-overlay';
            const closeButton = document.createElement('button');
            closeButton.className = 'close-button';
            closeButton.innerHTML = '&times;';
            overlay.innerHTML = detailContent;
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
    }
});

// 背景クリックでフォーカス解除
gridContainer.addEventListener('click', (event) => {
    if (event.target === gridContainer) {
        gridContainer.classList.remove('focus-active');
        gridItems.forEach(i => i.classList.remove('is-focused'));
    }
});
