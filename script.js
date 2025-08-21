// --- 基本設定 ---
// セキュリティのため、これらのキーは本来サーバーサイドや環境変数で管理するのが安全です。
const NOTION_API_KEY = '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';
const MOVIE_DATABASE_ID = 'b3c72857276f4ca9a3c99b94ba910b53';
const TMDB_API_KEY = '9581389ef7dc448dc8b17ea22a930bf3';

// --- HTML要素の取得 ---
const gridContainer = document.getElementById('grid-container');
const gridItems = document.querySelectorAll('.grid-item');

// --- CORSエラー対策用のプロキシURL ---
// ブラウザから直接APIを叩くとセキュリティでブロックされるため、仲介サーバーを経由させます。
// 注意：この公開プロキシは開発・テスト用です。本番環境では使用しないでください。
const CORS_PROXY_URL = 'https://proxy.cors.sh/';


// --- API通信用の関数 ---

/**
 * 1. Notionデータベースから映画のリストを取得します。
 */
async function fetchNotionMovies() {
    try {
        // ★★★ 修正点：プロキシURLを経由してAPIにリクエストします ★★★
        const apiUrl = `${CORS_PROXY_URL}https://api.notion.com/v1/databases/${MOVIE_DATABASE_ID}/query`;
        
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${NOTION_API_KEY}`,
                'Content-Type': 'application/json',
                'Notion-Version': '2022-06-28'
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Notion API Error:', errorData);
            throw new Error(`Notion API Error: ${errorData.message}`);
        }

        const data = await response.json();

        return data.results.map(page => {
            const properties = page.properties;
            const titleProperty = properties['名前'];

            return {
                pageId: page.id,
                title: titleProperty?.title[0]?.plain_text || 'タイトル不明',
                cover: page.cover?.file?.url || page.cover?.external?.url || null,
                isWatched: properties["視聴済み"]?.checkbox || false
            };
        });
    } catch (error) {
        console.error("Notionの映画データ取得中にエラーが発生しました:", error);
        return [];
    }
}


/**
 * 2. TMDbで映画を検索し、映画IDを取得します。
 * @param {string} title - 検索する映画のタイトル
 */
async function searchTmdbMovie(title) {
    if (!title || title === 'タイトル不明') return null;
    try {
        // TMDb APIはCORSを許可している場合が多いため、プロキシは不要なことが多いです。
        const response = await fetch(`https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&language=ja-JP`);
        if (!response.ok) throw new Error('TMDb Search Error');
        const data = await response.json();
        return data.results[0]?.id || null;
    } catch (error) {
        console.error("TMDbでの映画検索中にエラーが発生しました:", error);
        return null;
    }
}

/**
 * 3. TMDbで指定された映画の配信サービス情報を取得します。
 * @param {number} movieId - TMDbの映画ID
 */
async function getTmdbWatchProviders(movieId) {
    if (!movieId) return [];
    try {
        const response = await fetch(`https://api.themoviedb.org/3/movie/${movieId}/watch/providers?api_key=${TMDB_API_KEY}`);
        if (!response.ok) throw new Error('TMDb Providers Error');
        const data = await response.json();
        return data.results?.JP?.flatrate || [];
    } catch (error) {
        console.error("TMDbでの配信サービス情報取得中にエラーが発生しました:", error);
        return [];
    }
}

/**
 * 4. Notionのページを更新し、「視聴済み」チェックボックスをオンにします。
 * @param {string} pageId - 更新するNotionページのID
 */
async function updateNotionPageAsWatched(pageId) {
    try {
        // ★★★ 修正点：こちらもプロキシURLを経由させます ★★★
        const apiUrl = `${CORS_PROXY_URL}https://api.notion.com/v1/pages/${pageId}`;

        const response = await fetch(apiUrl, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${NOTION_API_KEY}`,
                'Content-Type': 'application/json',
                'Notion-Version': '2022-06-28'
            },
            body: JSON.stringify({
                properties: {
                    "視聴済み": {
                        checkbox: true
                    }
                }
            })
        });
        if (!response.ok) throw new Error('Notion Update Error');
        return true;
    } catch (error) {
        console.error("Notionページの更新中にエラーが発生しました:", error);
        return false;
    }
}

// --- メイン処理とイベントリスナー ---

/**
 * 映画の詳細情報を取得し、HTMLを生成して表示します。
 * @param {HTMLElement} item - クリックされたグリッドアイテム
 */
async function displayMovieDetails(item) {
    const detailView = item.querySelector('.content-detail');
    detailView.innerHTML = `<p style="padding: 20px; color: #888;">Notionから情報を取得中...</p>`;

    const notionMovies = await fetchNotionMovies();

    if (notionMovies.length === 0) {
        detailView.innerHTML = '<p style="padding: 20px; color: #888;">Notionに映画データがないか、APIリクエストに失敗しました。コンソールを確認してください。</p>';
        return;
    }

    const moviePromises = notionMovies.map(async (movie) => {
        const tmdbId = await searchTmdbMovie(movie.title);
        const providers = tmdbId ? await getTmdbWatchProviders(tmdbId) : [];

        const providersHtml = providers.length > 0 ?
            providers.map(p => `
                <a href="#" target="_blank" title="${p.provider_name}">
                    <img src="https://image.tmdb.org/t/p/w500${p.logo_path}" alt="${p.provider_name}" class="provider-logo">
                </a>
            `).join('') :
            '見放題サービスは見つかりませんでした。';

        return `
            <div class="movie-focus-view" style="background-image: url(${movie.cover || ''})">
                <div class="movie-info-content">
                    <h2 class="movie-title">${movie.title}</h2>
                    <div class="watch-providers">
                        <h3>視聴可能なサービス</h3>
                        <div class="provider-list">${providersHtml}</div>
                    </div>
                    <button class="watched-button" data-page-id="${movie.pageId}" ${movie.isWatched ? 'disabled' : ''}>
                        ${movie.isWatched ? '✅ 視聴済み' : '視聴済みにする'}
                    </button>
                </div>
            </div>
        `;
    });

    const moviesHtml = (await Promise.all(moviePromises)).join('');
    detailView.innerHTML = moviesHtml;

    detailView.querySelectorAll('.watched-button').forEach(button => {
        button.addEventListener('click', async () => {
            const pageId = button.dataset.pageId;
            button.textContent = '更新中...';
            button.disabled = true;
            const success = await updateNotionPageAsWatched(pageId);
            if (success) {
                button.textContent = '✅ 視聴済みにしました';
            } else {
                button.textContent = 'エラーが発生しました';
                button.disabled = false;
            }
        });
    });
}


// --- 初期化処理 ---

gridItems.forEach(item => {
    item.addEventListener('click', async (event) => {
        if (event.target.closest('.watched-button') || event.target.closest('.fullscreen-button')) {
            return;
        }
        event.preventDefault();

        const isFocused = item.classList.contains('is-focused');

        gridContainer.classList.remove('focus-active');
        gridItems.forEach(i => i.classList.remove('is-focused'));

        if (!isFocused) {
            gridContainer.classList.add('focus-active');
            item.classList.add('is-focused');

            if (item.classList.contains('movie')) {
                displayMovieDetails(item);
            }
        }
    });

    const fullscreenButton = item.querySelector('.fullscreen-button');
    if (fullscreenButton) {
        fullscreenButton.addEventListener('click', (event) => {
            event.stopPropagation();

            const detailContent = item.querySelector('.content-detail').innerHTML;
            const overlay = document.createElement('div');
            overlay.className = 'fullscreen-overlay';
            overlay.innerHTML = detailContent;

            const closeButton = document.createElement('button');
            closeButton.className = 'close-button';
            closeButton.innerHTML = '&times;';
            closeButton.onclick = () => document.body.removeChild(overlay);

            overlay.appendChild(closeButton);
            document.body.appendChild(overlay);
        });
    }
});

gridContainer.addEventListener('click', (event) => {
    if (event.target === gridContainer) {
        gridContainer.classList.remove('focus-active');
        gridItems.forEach(i => i.classList.remove('is-focused'));
    }
});


