document.addEventListener('DOMContentLoaded', () => {

    // --- 基本設定 ---
    const NOTION_API_KEY = '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';
    const ACADEMY_DB_ID = 'b3c72857276f4ca9a3c99b94ba910b53';
    const WATCHLIST_DB_ID = '257fba1c4ef18032a421fb487fc4ff89'
    const TMDB_API_KEY = '9581389ef7dc448dc8b17ea22a930bf3';
    const GEMINI_API_KEY = 'AIzaSyCVo6Wu77DJryjPh3tNtBQzvtgMnrIJBYA';
    const CORS_PROXY_URL = 'https://corsproxy.io/?';
    const ALLOWED_PROVIDERS = ['Netflix', 'Hulu', 'Amazon Prime Video'];
    const RELEASE_YEAR_PROPERTY_NAME = '公開年';

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
    async function fetchNotionPages(databaseId) {
        if (!databaseId || databaseId.includes('YOUR_NEW')) return [];
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
        return allResults;
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
                                <div class="movie-card ${movie.isWatched ? 'watched' : ''}" data-source="${movie.source}" data-title="${movie.title}">
                                    <span class="source-tag">${movie.source === 'academy' ? '🏆' : '🔖'}</span>
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
        return messageElement;
    }

    // --- 各機能の初期化関数 ---

    async function initializeMovieSearchApp(container) {
        if (isAppInitialized) return;
        isAppInitialized = true;
        currentMovieContext = null;
        
        container.innerHTML = `
            <div class="movie-app-container">
                <div class="filter-container">
                    <button class="filter-button active" data-filter="all">すべて表示</button>
                    <button class="filter-button" data-filter="academy">🏆 アカデミー賞</button>
                    <button class="filter-button" data-filter="watchlist">🔖 ウォッチリスト</button>
                </div>
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
        const listArea = container.querySelector('#movie-list-area');
        const filterButtons = container.querySelectorAll('.filter-button');

        const academyPages = await fetchNotionPages(ACADEMY_DB_ID);
        const watchlistPages = await fetchNotionPages(WATCHLIST_DB_ID);
        
        const academyMovies = academyPages.map(page => ({
            source: 'academy',
            pageId: page.id,
            title: page.properties['名前']?.title[0]?.plain_text || 'タイトル不明',
            url: page.properties['URL 1']?.url || null,
            isWatched: page.properties["視聴済"]?.checkbox === true
        }));
        const watchlistMovies = watchlistPages.map(page => ({
            source: 'watchlist',
            pageId: page.id,
            title: page.properties['名前']?.title[0]?.plain_text || 'タイトル不明',
            url: page.properties['URL 1']?.url || null,
            isWatched: page.properties["視聴済"]?.checkbox === true
        }));

        allMoviesData = [...academyMovies, ...watchlistMovies];

        const moviePromises = allMoviesData.map(async movie => ({ ...movie, providers: await getWatchProvidersForMovie(movie.title) }));
        const moviesWithProviders = await Promise.all(moviePromises);
        
        renderMovieLists(moviesWithProviders, listArea);

        filterButtons.forEach(button => {
            button.addEventListener('click', () => {
                filterButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');

                const filter = button.dataset.filter;
                const filteredMovies = (filter === 'all')
                    ? moviesWithProviders
                    : moviesWithProviders.filter(movie => movie.source === filter);
                
                renderMovieLists(filteredMovies, listArea);
            });
        });

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
2. おすすめの提案: 「おすすめは？」と聞かれたら、「未視聴」の映画を1つだけ選び、「『${unWatchedMovies.length > 0 ? unWatchedMovies[0].title : '未視聴映画なし'}』はいかがでしょう？[推薦理由]」のように提案する。
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

        listArea.addEventListener('click', (e) => {
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

    // ▼▼▼【ここからが新しい対話型AIの実装です】▼▼▼
    async function initializeMovieRegisterApp(container) {
        if (isAppInitialized) return;
        isAppInitialized = true;

        container.innerHTML = `
            <div id="register-chat-section" class="register-chat-section">
                <div id="register-chat-box" class="register-chat-box"></div>
                <div class="chat-input-area">
                    <input type="text" id="register-chat-input" placeholder="メッセージを入力...">
                    <button id="register-send-button">➤</button>
                </div>
            </div>`;
        
        const chatBox = container.querySelector('#register-chat-box');
        const chatInput = container.querySelector('#register-chat-input');
        const sendButton = container.querySelector('#register-send-button');

        // --- AIに与える「道具（ツール）」の定義 ---
        const tools = {
            functionDeclarations: [
                {
                    name: "search_movies_from_tmdb",
                    description: "ユーザーとの会話で特定された条件に基づいて、TMDBから映画を検索します。",
                    parameters: {
                        type: "OBJECT",
                        properties: {
                            query_type: { type: "STRING", description: "検索の種類。'now_playing', 'upcoming', 'discover'のいずれか。" },
                            region: { type: "STRING", description: "地域コード。日本の場合は'JP'。" },
                            year: { type: "NUMBER", description: "公開年。"},
                            genre_keywords: { type: "STRING", description: "ジャンルを示すキーワード（例: SF, アクション）。" },
                            director_name: { type: "STRING", description: "監督名。" }
                        },
                        required: ["query_type"]
                    }
                }
            ]
        };

        // --- AIの思考回路（システムプロンプト）---
        const systemPrompt = `あなたは、ユーザーがまだ観たことのない素晴らしい映画を見つける手助けをする、非常に優秀でフレンドリーな「映画コンシェルジュAI」です。
        
        # あなたの役割と行動ルール:
        - あなたの最終目標は、ユーザーとの自然な会話を通じて、ユーザーが興味を持つであろう映画のリストを提示し、ウォッチリストに追加してもらうことです。
        - 決して事務的な一問一答にならないでください。まるで映画好きな友人と雑談するように、会話を広げ、提案し、ユーザーの曖昧な言葉から意図を汲み取ってください。
        - ユーザーが「有名な監督を教えて」「泣ける映画のジャンルは？」のような具体的な知識を求めてきた場合は、あなたの知識を使って自由に答えてあげてください。
        - 会話の中で、ユーザーが観たい映画の条件（ジャンル、年代、監督名など）が十分に固まったと判断したら、**必ず search_movies_from_tmdb ツールを呼び出して**ください。
        - ツールを呼び出した後は、その結果（「〇件の映画が見つかりました」など）をユーザーに伝え、表示されたリストを確認するように促してください。
        `;

        chatHistory = [
            { role: "user", parts: [{ text: systemPrompt }] },
            { role: "model", parts: [{ text: "承知いたしました。最高の映画パートナーとして、ご案内します！" }] }
        ];

        // --- メインの対話処理 ---
        async function handleUserInput() {
            const userInput = chatInput.value.trim();
            if (!userInput) return;

            displayMessage(userInput, 'user', chatBox);
            chatInput.value = '';
            chatInput.disabled = true;
            sendButton.disabled = true;
            
            const thinkingBubble = displayMessage("...", 'ai', chatBox);
            
            // ユーザーの入力を会話履歴に追加
            chatHistory.push({ role: "user", parts: [{ text: userInput }] });

            // Gemini APIを呼び出し
            const response = await callGeminiAPIWithTools();

            // AIの応答を処理
            if (response.functionCall) {
                const functionCall = response.functionCall;
                const functionName = functionCall.name;
                const args = functionCall.args;

                if (functionName === "search_movies_from_tmdb") {
                    thinkingBubble.innerHTML = "TMDBで映画を検索しています...";
                    const searchResult = await searchAndDisplayMovies(args);
                    
                    // 関数の実行結果を会話履歴に追加
                    chatHistory.push({
                        role: "tool",
                        parts: [{ functionResponse: { name: "search_movies_from_tmdb", response: { result: searchResult } } }]
                    });

                    // 実行結果を元に、AIに最終的な返答を生成させる
                    const finalResponse = await callGeminiAPIWithTools();
                    thinkingBubble.innerHTML = finalResponse.text;
                }
            } else {
                // 通常のテキスト応答
                thinkingBubble.innerHTML = response.text.replace(/\n/g, '<br>');
            }

            chatInput.disabled = false;
            sendButton.disabled = false;
            chatInput.focus();
        }
        
        // --- Gemini API呼び出し（ツール使用版） ---
        async function callGeminiAPIWithTools() {
            const modelName = 'gemini-1.5-flash-latest';
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`;
            
            try {
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: chatHistory, tools: [tools] })
                });
                if (!response.ok) throw new Error("Gemini API request failed");
                const data = await response.json();
                
                const candidate = data.candidates[0];
                const part = candidate.content.parts[0];
                
                // AIの応答を会話履歴に追加
                chatHistory.push(candidate.content);

                if (part.functionCall) {
                    return { functionCall: part.functionCall };
                } else {
                    return { text: part.text };
                }

            } catch (error) {
                console.error("Gemini API Fetch Error:", error);
                return { text: "AIとの通信でエラーが発生しました。" };
            }
        }
        
        // --- ツールとして呼び出される関数 ---
        async function searchAndDisplayMovies(args) {
            const academyPages = await fetchNotionPages(ACADEMY_DB_ID);
            const watchlistPages = await fetchNotionPages(WATCHLIST_DB_ID);
            const existingIds = new Set([...academyPages, ...watchlistPages].map(p => p.properties.TMDB?.number).filter(id => id != null));

            const apiUrl = await buildTmdbUrl(args);
            if (!apiUrl) return "監督が見つかりませんでした。";

            const response = await fetch(apiUrl);
            if (!response.ok) return "映画情報の取得に失敗しました。";
            
            const data = await response.json();
            const movies = data.results;

            if (!movies || movies.length === 0) {
                return "条件に合う映画は見つかりませんでした。";
            }

            const thinkingBubble = chatBox.lastChild.querySelector('.chat-bubble-ai');
            renderMovieSelectionTable(movies, existingIds, thinkingBubble);
            
            return `${movies.length}件の映画が見つかりました。リストを確認してください。`;
        }

        async function buildTmdbUrl(args) {
            let endpoint = '';
            const params = new URLSearchParams({ api_key: TMDB_API_KEY, language: 'ja-JP' });

            switch (args.query_type) {
                case 'now_playing':
                    endpoint = 'movie/now_playing';
                    if (args.region) params.append('region', args.region);
                    break;
                case 'upcoming':
                    endpoint = 'movie/upcoming';
                    if (args.region) params.append('region', args.region);
                    break;
                case 'discover':
                    endpoint = 'discover/movie';
                    if (args.year) params.append('primary_release_year', args.year);
                    if (args.director_name) {
                        const personSearchUrl = `https://api.themoviedb.org/3/search/person?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(args.director_name)}&language=ja-JP`;
                        const personRes = await fetch(personSearchUrl);
                        if (!personRes.ok) return null;
                        const personData = await personRes.json();
                        const directorId = personData.results[0]?.id;
                        if (!directorId) return null;
                        params.append('with_crew', directorId);
                    }
                    params.append('sort_by', 'popularity.desc');
                    break;
            }
            return `https://api.themoviedb.org/3/${endpoint}?${params.toString()}`;
        }

        function renderMovieSelectionTable(movies, existingIds, bubbleToUpdate) {
            let tableHtml = `
                <div class="movie-selection-container">
                    <p>追加したい映画にチェックを入れてください。</p>
                    <table class="movie-selection-table">
                        <thead>
                            <tr>
                                <th>追加</th>
                                <th>ポスター</th>
                                <th>タイトル</th>
                                <th>公開日</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${movies.map(movie => `
                                <tr>
                                    <td>
                                        <input type="checkbox" class="movie-checkbox" data-movie-id="${movie.id}" 
                                        ${existingIds.has(movie.id) ? 'disabled' : 'checked'}>
                                        ${existingIds.has(movie.id) ? '<span style="font-size:10px; color: green;">登録済</span>' : ''}
                                    </td>
                                    <td><img src="${movie.poster_path ? `https://image.tmdb.org/t/p/w92${movie.poster_path}` : 'https://placehold.co/50x75?text=N/A'}" alt="ポスター" width="50"></td>
                                    <td>${movie.title}</td>
                                    <td>${movie.release_date || '不明'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    <button class="ai-button" id="add-to-notion-button">選択した映画をNotionに追加</button>
                </div>
            `;
            bubbleToUpdate.innerHTML = tableHtml;
            chatBox.scrollTop = chatBox.scrollHeight;

            const addButton = bubbleToUpdate.querySelector('#add-to-notion-button');
            addButton.addEventListener('click', handleAddToNotion);
        }

        async function handleAddToNotion(e) {
            const button = e.target;
            button.textContent = '登録中...';
            button.disabled = true;

            const selectionContainer = button.closest('.movie-selection-container');
            const checkboxes = selectionContainer.querySelectorAll('.movie-checkbox:checked');
            const movieIdsToAdd = Array.from(checkboxes).map(cb => cb.dataset.movieId);

            if (movieIdsToAdd.length === 0) {
                displayMessage("追加する映画が選択されていません。", 'ai', chatBox);
                button.textContent = '選択した映画をNotionに追加';
                button.disabled = false;
                return;
            }
            
            displayMessage(`${movieIdsToAdd.length}件の映画をNotionに登録します...`, 'ai', chatBox);
            
            let successCount = 0;
            for (const movieId of movieIdsToAdd) {
                const success = await addSingleMovieToNotion(movieId);
                if (success) {
                    successCount++;
                }
                await new Promise(resolve => setTimeout(resolve, 350));
            }

            displayMessage(`${successCount}件の映画をウォッチリストに追加しました！<br>続けて他の映画も探しますか？`, 'ai', chatBox);
            chatInput.disabled = false;
            sendButton.disabled = false;
        }

        async function addSingleMovieToNotion(movieId) {
            try {
                const detailUrl = `https://api.themoviedb.org/3/movie/${movieId}?api_key=${TMDB_API_KEY}&language=ja-JP&append_to_response=credits`;
                const detailRes = await fetch(detailUrl);
                const movie = await detailRes.json();

                const director = movie.credits.crew.find(c => c.job === 'Director')?.name || '';
                const writer = movie.credits.crew.find(c => c.job === 'Screenplay' || c.job === 'Writer')?.name || '';
                const cast = movie.credits.cast.slice(0, 5).map(c => c.name).join(', ');

                const properties = {
                    '名前': { title: [{ text: { content: movie.title } }] },
                    'TMDB': { number: movie.id },
                    'あらすじ': { rich_text: [{ text: { content: (movie.overview || '').substring(0, 2000) } }] },
                    'ジャンル': { multi_select: movie.genres.map(g => ({ name: g.name })) },
                    '監督': { rich_text: [{ text: { content: director } }] },
                    '脚本家': { rich_text: [{ text: { content: writer } }] },
                    'キャスト': { rich_text: [{ text: { content: cast } }] },
                    '視聴済': { checkbox: false }
                };
                
                if (movie.release_date) {
                    const year = parseInt(movie.release_date.substring(0, 4), 10);
                    if (!isNaN(year)) {
                        properties[RELEASE_YEAR_PROPERTY_NAME] = { number: year };
                    }
                }

                if (movie.poster_path) {
                    properties['ポスター画像'] = { files: [{ name: movie.poster_path, type: "external", external: { url: `https://image.tmdb.org/t/p/w500${movie.poster_path}` } }] };
                }
                if (movie.backdrop_path) {
                    properties['背景画像'] = { files: [{ name: movie.backdrop_path, type: "external", external: { url: `https://image.tmdb.org/t/p/w1280${movie.backdrop_path}` } }] };
                }

                const notionPageData = {
                    parent: { database_id: WATCHLIST_DB_ID },
                    properties: properties
                };

                const targetUrl = `https://api.notion.com/v1/pages`;
                const apiUrl = `${CORS_PROXY_URL}${encodeURIComponent(targetUrl)}`;
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${NOTION_API_KEY}`, 'Content-Type': 'application/json', 'Notion-Version': '2022-06-28' },
                    body: JSON.stringify(notionPageData)
                });
                
                return response.ok;

            } catch (error) {
                console.error(`Movie ID ${movieId} の登録中にエラー:`, error);
                return false;
            }
        }

        // --- 初期化処理の実行 ---
        displayMessage("こんにちは！何かお探しの映画はありますか？<br>「感動する映画」のように、気分を伝えてくれてもいいですよ。", 'ai', chatBox);
        chatInput.disabled = false;
        sendButton.disabled = false;
        chatInput.focus();

        sendButton.addEventListener('click', handleUserInput);
        chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleUserInput(); });
    }

    function initializeMovieMenu(container) {
        const menuContainer = container.querySelector('#movie-menu-container');
        const contentArea = container.querySelector('#movie-content-area');
        const searchButton = container.querySelector('#show-search-button');
        const registerButton = container.querySelector('#show-register-button');

        if (!menuContainer.dataset.initialized) {
            menuContainer.dataset.initialized = 'true';
            searchButton.addEventListener('click', (e) => {
                e.stopPropagation();
                menuContainer.style.display = 'none';
                initializeMovieSearchApp(contentArea);
            });
            registerButton.addEventListener('click', (e) => {
                e.stopPropagation();
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
                    menuContainer.style.display = 'grid';
                    menuContainer.removeAttribute('data-initialized');
                    isAppInitialized = false;
                    chatHistory = [];
                }
            }
        });
    });
});


























