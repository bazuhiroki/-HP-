document.addEventListener('DOMContentLoaded', () => {

    // --- 基本設定 ---
    const NOTION_API_KEY = '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';
    const ACADEMY_DB_ID = 'b3c72857276f4ca9a3c99b94ba910b53';
    const WATCHLIST_DB_ID = '257fba1c4ef18032a421fb487fc4ff89'; // ★★★後で設定★★★
    const TMDB_API_KEY = '9581389ef7dc448dc8b17ea22a930bf3';
    const GEMINI_API_KEY = 'AIzaSyCVo6Wu77DJryjPh3tNtBQzvtgMnrIJBYA';
    const CORS_PROXY_URL = 'https://corsproxy.io/?';
    const ALLOWED_PROVIDERS = ['Netflix', 'Hulu', 'Amazon Prime Video'];

    // --- グローバル変数 ---
    let allMoviesData = [];
    let chatHistory = [];
    let isAppInitialized = false;
    let currentMovieContext = null;

    // --- HTML要素の取得 ---
    const gridContainer = document.getElementById('grid-container');
    const gridItems = document.querySelectorAll('.grid-item');

    // --- ヘルパー関数 ---
    function copyToClipboard(text, button) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            if (button) {
                button.textContent = '✅ コピー完了';
                setTimeout(() => { button.textContent = 'タイトルをコピー'; }, 1500);
            }
        } catch (err) { console.error('テキストのコピーに失敗しました: ', err); }
        document.body.removeChild(textArea);
    }

    // --- API通信用の関数 ---
    async function fetchNotionMovies(databaseId) {
        let allResults = [];
        let hasMore = true;
        let startCursor = undefined;
        while (hasMore) {
            const targetUrl = `https://api.notion.com/v1/databases/${databaseId}/query`;
            const apiUrl = `${CORS_PROXY_URL}${encodeURIComponent(targetUrl)}`;
            const body = { page_size: 100, start_cursor: startCursor };
            try {
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${NOTION_API_KEY}`, 'Content-Type': 'application/json', 'Notion-Version': '2022-06-28' },
                    body: JSON.stringify(body)
                });
                if (!response.ok) throw new Error(`Notion API Error (DB: ${databaseId})`);
                const data = await response.json();
                allResults = allResults.concat(data.results);
                hasMore = data.has_more;
                startCursor = data.next_cursor;
            } catch (error) {
                console.error(`Notion DB (${databaseId}) の取得エラー:`, error);
                return [];
            }
        }
        return allResults.map(page => ({
            pageId: page.id,
            title: page.properties['名前']?.title[0]?.plain_text || 'タイトル不明',
            url: page.properties['URL 1']?.url || null,
            isWatched: page.properties["視聴済"]?.checkbox === true
        }));
    }

    async function getWatchProvidersForMovie(title) {
        if (!title || title === 'タイトル不明') return [];
        try {
            const searchUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&language=ja-JP`;
            const searchRes = await fetch(searchUrl);
            if (!searchRes.ok) return [];
            const searchData = await searchRes.json();
            const movieId = searchData.results[0]?.id;
            if (!movieId) return [];
            const providersUrl = `https://api.themoviedb.org/3/movie/${movieId}/watch/providers?api_key=${TMDB_API_KEY}`;
            const providersRes = await fetch(providersUrl);
            if (!providersRes.ok) return [];
            const providersData = await providersRes.json();
            const allProviders = providersData.results?.JP?.flatrate || [];
            return allProviders.filter(p => ALLOWED_PROVIDERS.includes(p.provider_name));
        } catch (error) { console.error(`TMDb情報取得エラー (${title}):`, error); return []; }
    }
    
    async function updateNotionPageAsWatched(pageId) {
        const targetUrl = `https://api.notion.com/v1/pages/${pageId}`;
        const apiUrl = `${CORS_PROXY_URL}${encodeURIComponent(targetUrl)}`;
        try {
            const response = await fetch(apiUrl, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${NOTION_API_KEY}`, 'Content-Type': 'application/json', 'Notion-Version': '2022-06-28' },
                body: JSON.stringify({ properties: { "視聴済": { checkbox: true } } })
            });
            return response.ok;
        } catch (error) { console.error("Notion更新エラー:", error); return false; }
    }

    async function callGeminiAPI(prompt) {
        if (!GEMINI_API_KEY) return "エラー: Gemini APIキーが設定されていません。";
        const modelName = 'gemini-1.5-flash-latest';
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`;
        chatHistory.push({ role: "user", parts: [{ text: prompt }] });
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: chatHistory })
            });
            if (!response.ok) throw new Error("Gemini API request failed");
            const data = await response.json();
            const aiResponse = data.candidates[0].content.parts[0].text;
            chatHistory.push({ role: "model", parts: [{ text: aiResponse }] });
            return aiResponse;
        } catch (error) {
            console.error("Gemini API Fetch Error:", error);
            chatHistory.pop();
            return "AIとの通信でエラーが発生しました。";
        }
    }

    // --- 描画関連の関数 ---
    function renderMovieLists(movies, container) {
        const groupedByProvider = {};
        movies.forEach(movie => {
            if (movie.providers && movie.providers.length > 0) {
                movie.providers.forEach(provider => {
                    if (!groupedByProvider[provider.provider_name]) {
                        groupedByProvider[provider.provider_name] = { logo_path: provider.logo_path, movies: [] };
                    }
                    if (!groupedByProvider[provider.provider_name].movies.some(m => m.pageId === movie.pageId)) {
                        groupedByProvider[provider.provider_name].movies.push(movie);
                    }
                });
            }
        });
        let html = '';
        if (Object.keys(groupedByProvider).length === 0) {
            html = '<p>指定されたサービスで視聴可能な映画は見つかりませんでした。</p>';
        } else {
            for (const providerName in groupedByProvider) {
                const provider = groupedByProvider[providerName];
                html += `
                    <div class="provider-section">
                        <div class="provider-header">
                            <img src="https://image.tmdb.org/t/p/w92${provider.logo_path}" alt="${providerName}" class="provider-logo">
                            <h3 class="provider-name">${providerName}</h3>
                        </div>
                        <div class="movie-grid">
                            ${provider.movies.map(movie => `
                                <div class="movie-card ${movie.isWatched ? 'watched' : ''}" data-title="${movie.title}">
                                    <p class="movie-card-title">${movie.title}</p>
                                    ${movie.isWatched ? '<span class="watched-badge">✅ 視聴済み</span>' : ''}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }
        }
        container.innerHTML = html;
    }

    function displayMessage(message, sender, chatBox) {
        const wrapper = document.createElement('div');
        wrapper.className = `chat-bubble-wrapper ${sender}`;
        const messageElement = document.createElement('div');
        messageElement.className = `chat-bubble chat-bubble-${sender}`;
        messageElement.innerHTML = message.replace(/\n/g, '<br>');
        wrapper.appendChild(messageElement);
        chatBox.appendChild(wrapper);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    // --- 各機能の初期化関数 ---

    async function initializeMovieSearchApp(container) {
        if (isAppInitialized) return;
        isAppInitialized = true;
        currentMovieContext = null;
        
        container.innerHTML = `
            <div class="movie-app-container">
                <div id="movie-list-area"><p>Notionから映画情報を取得中...</p></div>
                <div id="chat-section">
                    <div id="chat-box"></div>
                    <div class="chat-input-area">
                        <input type="text" id="chat-input" placeholder="映画のタイトルを入力...">
                        <button id="send-button" disabled>➤</button>
                    </div>
                </div>
            </div>`;
        
        const chatBox = container.querySelector('#chat-box');
        const chatInput = container.querySelector('#chat-input');
        const sendButton = container.querySelector('#send-button');

        const academyMovies = await fetchNotionMovies(ACADEMY_DB_ID);
        const watchlistMovies = (WATCHLIST_DB_ID !== 'YOUR_NEW_WATCHLIST_DATABASE_ID') 
            ? await fetchNotionMovies(WATCHLIST_DB_ID) 
            : [];
        allMoviesData = [...academyMovies, ...watchlistMovies];

        const moviePromises = allMoviesData.map(async movie => ({ ...movie, providers: await getWatchProvidersForMovie(movie.title) }));
        const moviesWithProviders = await Promise.all(moviePromises);
        
        renderMovieLists(moviesWithProviders, container.querySelector('#movie-list-area'));

        async function handleUserInput() {
            const userInput = chatInput.value.trim();
            if (!userInput) return;
            displayMessage(userInput, 'user', chatBox);
            chatInput.value = '';
            const viewIntentKeywords = ['見る', 'みたい', '視聴'];
            const isViewIntent = viewIntentKeywords.some(keyword => userInput.toLowerCase().includes(keyword));
            if (isViewIntent && currentMovieContext) {
                let responseHtml = `「${currentMovieContext.title}」ですね。<br>`;
                if (currentMovieContext.url) {
                    responseHtml += `<a href="${currentMovieContext.url}" target="_blank" class="ai-link">視聴ページへ</a>`;
                } else {
                    responseHtml += `申し訳ありません、視聴URLは未登録でした。<br>` +
                                    `<button class="ai-button copy-ai-title" data-title="${currentMovieContext.title}">タイトルをコピー</button>` +
                                    `<a href="https://filmarks.com/search/movies?q=${encodeURIComponent(currentMovieContext.title)}" target="_blank" class="ai-link">Filmarksで探す</a>`;
                }
                responseHtml += `<button class="ai-button watched-button" data-page-id="${currentMovieContext.pageId}">視聴済みにする</button>`;
                displayMessage(responseHtml, 'ai', chatBox);
                currentMovieContext = null;
                return;
            }
            sendButton.disabled = true;
            const thinkingWrapper = document.createElement('div');
            thinkingWrapper.className = 'chat-bubble-wrapper ai';
            thinkingWrapper.innerHTML = `<div class="chat-bubble chat-bubble-ai">...</div>`;
            chatBox.appendChild(thinkingWrapper);
            const mentionedMovie = allMoviesData.find(m => userInput.includes(m.title));
            if (mentionedMovie) {
                currentMovieContext = mentionedMovie;
            } else if (!isViewIntent) {
                currentMovieContext = null;
            }
            const aiResponse = await callGeminiAPI(userInput);
            thinkingWrapper.remove();
            displayMessage(aiResponse, 'ai', chatBox);
            sendButton.disabled = false;
            chatInput.focus();
        }

        const unWatchedMovies = allMoviesData.filter(m => !m.isWatched);
        const initialSystemPrompt = `
あなたは知識豊富でフレンドリーな映画コンシェルジュAIです。
# あなたが持っている情報: ${allMoviesData.map(m => `"${m.title}"(${m.isWatched ? '視聴済み' : '未視聴'})`).join(', ')}
# あなたの行動ルール
1. 映画の特定と確認: ユーザーの発言がリスト内の映画に言及している場合、簡潔に紹介し「詳しく知りたいですか？視聴しますか？」と尋ねる。
2. おすすめの提案: 「おすすめは？」と聞かれたら、**「未視聴」の映画**を1つだけ選び、「『${unWatchedMovies.length > 0 ? unWatchedMovies[0].title : '未視聴映画なし'}』はいかがでしょう？[推薦理由]」のように提案する。
3. 雑談: 上記以外は自由に会話する。`;
        
        chatHistory = [
            { role: "user", parts: [{ text: initialSystemPrompt }] },
            { role: "model", parts: [{ text: "承知いたしました。映画コンシェルジュとして、ご案内します。" }] }
        ];

        const initialAiMessage = "今日は何を見ますか？リストの映画をクリックするか、タイトルを入力してください。";
        displayMessage(initialAiMessage, 'ai', chatBox);
        sendButton.disabled = false;

        sendButton.addEventListener('click', handleUserInput);
        chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleUserInput(); });

        container.querySelector('#movie-list-area').addEventListener('click', (e) => {
            const card = e.target.closest('.movie-card');
            if (card) {
                const title = card.dataset.title;
                chatInput.value = title;
                chatInput.focus();
                currentMovieContext = allMoviesData.find(m => m.title === title) || null;
            }
        });

        chatBox.addEventListener('click', async (e) => {
            if (e.target.matches('.copy-ai-title')) {
                copyToClipboard(e.target.dataset.title, e.target);
                return;
            }
            if (e.target.matches('.watched-button')) {
                const button = e.target;
                const pageId = button.dataset.pageId;
                if (!pageId) { displayMessage("エラー: 更新対象が見つかりません。", 'ai', chatBox); return; }
                button.textContent = '更新中...';
                button.disabled = true;
                const success = await updateNotionPageAsWatched(pageId);
                if (success) {
                    displayMessage("Notionを更新しました！パネルを閉じると反映されます。", 'ai', chatBox);
                    button.textContent = '✅ 更新完了';
                } else {
                    displayMessage("エラー：Notionの更新に失敗しました。", 'ai', chatBox);
                    button.textContent = '視聴済みにする';
                    button.disabled = false;
                }
            }
        });
    }

    async function initializeMovieRegisterApp(container) {
        if (isAppInitialized) return;
        isAppInitialized = true;
        container.innerHTML = `<div id="register-chat-section" style="height: 100%; display: flex; flex-direction: column;"><div id="register-chat-box" style="flex-grow: 1; overflow-y: auto; padding: 15px; background-color: #f9f9f9; border: 1px solid #e0e0e0; border-radius: 8px 8px 0 0;"></div><div class="chat-input-area" style="border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;"><input type="text" id="register-chat-input" placeholder="メッセージを入力..."><button id="register-send-button">➤</button></div></div>`;
        const chatBox = container.querySelector('#register-chat-box');
        displayMessage("新しい映画を探しましょう！どのような切り口で探しますか？", 'ai', chatBox);
    }

    function initializeMovieMenu(container) {
        const menuContainer = container.querySelector('#movie-menu-container');
        const contentArea = container.querySelector('#movie-content-area');
        const searchButton = container.querySelector('#show-search-button');
        const registerButton = container.querySelector('#show-register-button');

        if (!menuContainer.dataset.initialized) {
            menuContainer.dataset.initialized = 'true';

            searchButton.addEventListener('click', (e) => {
                e.stopPropagation(); // ★★★修正点1：イベントの伝播を停止
                menuContainer.style.display = 'none';
                initializeMovieSearchApp(contentArea);
            });

            registerButton.addEventListener('click', (e) => {
                e.stopPropagation(); // ★★★修正点1：イベントの伝播を停止
                menuContainer.style.display = 'none';
                initializeMovieRegisterApp(contentArea);
            });
        }
    }

    gridItems.forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.closest('#movie-content-area')) {
                return;
            }

            const isAlreadyFocused = item.classList.contains('is-focused');

            gridItems.forEach(i => i.classList.remove('is-focused', 'is-fullscreen'));
            gridContainer.classList.remove('focus-active');

            if (!isAlreadyFocused) {
                item.classList.add('is-focused');
                gridContainer.classList.add('focus-active');
                if (item.classList.contains('movie')) {
                    initializeMovieMenu(item.querySelector('.content-detail'));
                }
            } else {
                if (item.classList.contains('movie')) {
                    const detail = item.querySelector('.content-detail');
                    const menuContainer = detail.querySelector('#movie-menu-container');
                    
                    detail.querySelector('#movie-content-area').innerHTML = '';
                    menuContainer.style.display = 'flex';
                    menuContainer.removeAttribute('data-initialized'); // ★★★修正点2：初期化フラグをリセット
                    isAppInitialized = false;
                    chatHistory = [];
                }
            }
        });
    });
});















