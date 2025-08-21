// --- 基本設定 ---
// セキュリティのため、これらのキーは本来サーバーサイドや環境変数で管理するのが安全です。
const NOTION_API_KEY = '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';
const MOVIE_DATABASE_ID = 'b3c72857276f4ca9a3c99b94ba910b53';
const TMDB_API_KEY = '9581389ef7dc448dc8b17ea22a930bf3';

// --- HTML要素の取得 ---
const gridContainer = document.getElementById('grid-container');
const gridItems = document.querySelectorAll('.grid-item');

// --- API通信用の関数 ---

/**
 * 1. Notionデータベースから映画のリストを取得します。
 */
async function fetchNotionMovies() {
    try {
        const response = await fetch(`https://api.notion.com/v1/databases/${MOVIE_DATABASE_ID}/query`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${NOTION_API_KEY}`,
                'Content-Type': 'application/json',
                'Notion-Version': '2022-06-28'
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            // APIからのエラーメッセージをコンソールに表示
            console.error('Notion API Error:', errorData);
            throw new Error(`Notion API Error: ${errorData.message}`);
        }

        const data = await response.json();

        // 取得した各ページ（映画）の情報を整形する
        return data.results.map(page => {
            const properties = page.properties;

            // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
            // 修正点：プロパティ名 '名前' を直接指定してタイトル情報を取得します。
            // これが最も確実でシンプルな方法です。
            // 以前のコードはプロパティの「種類(type)」と「名前」を混同していました。
            const titleProperty = properties['名前'];
            // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★

            return {
                pageId: page.id,
                // titlePropertyが存在し、その中にtitle配列があればテキストを取得
                title: titleProperty?.title[0]?.plain_text || 'タイトル不明',
                // ページのカバー画像URLを取得
                cover: page.cover?.file?.url || page.cover?.external?.url || null,
                // '視聴済み' チェックボックスの状態を取得
                isWatched: properties["視聴済み"]?.checkbox || false
            };
        });
    } catch (error) {
        console.error("Notionの映画データ取得中にエラーが発生しました:", error);
        return []; // エラーが発生した場合は空の配列を返す
    }
}


/**
 * 2. TMDbで映画を検索し、映画IDを取得します。
 * @param {string} title - 検索する映画のタイトル
 */
async function searchTmdbMovie(title) {
    if (!title || title === 'タイトル不明') return null;
    try {
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
        // 日本の定額配信サービス(flatrate)を返す
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
        const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
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
        detailView.innerHTML = '<p style="padding: 20px; color: #888;">Notionに映画データがありません。インテグレーションの招待などを確認してください。</p>';
        return;
    }

    // 全ての映画情報を並行して取得
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

    // 全てのHTMLが生成されたら結合して表示
    const moviesHtml = (await Promise.all(moviePromises)).join('');
    detailView.innerHTML = moviesHtml;

    // 「視聴済みにする」ボタンにイベントリスナーを設定
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
                button.disabled = false; // エラー時は再度押せるようにする
            }
        });
    });
}


// --- 初期化処理 ---

// 各グリッドアイテムにクリックイベントを設定
gridItems.forEach(item => {
    item.addEventListener('click', async (event) => {
        // ボタンクリックの場合は何もしない
        if (event.target.closest('.watched-button') || event.target.closest('.fullscreen-button')) {
            return;
        }
        event.preventDefault();

        const isFocused = item.classList.contains('is-focused');

        // 全てのアイテムからフォーカスを外す
        gridContainer.classList.remove('focus-active');
        gridItems.forEach(i => i.classList.remove('is-focused'));

        // クリックしたアイテムがフォーカスされていなかった場合、フォーカスを当てる
        if (!isFocused) {
            gridContainer.classList.add('focus-active');
            item.classList.add('is-focused');

            // 映画アイテムであれば詳細情報を表示
            if (item.classList.contains('movie')) {
                displayMovieDetails(item);
            }
        }
    });

    // 全画面表示ボタンの処理
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

// 背景クリックでフォーカス解除
gridContainer.addEventListener('click', (event) => {
    if (event.target === gridContainer) {
        gridContainer.classList.remove('focus-active');
        gridItems.forEach(i => i.classList.remove('is-focused'));
    }
});

