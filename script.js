document.addEventListener('DOMContentLoaded', () => {

    // --- 基本設定 ---
    const NOTION_API_KEY = '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';
    const MOVIE_DATABASE_ID = 'b3c72857276f4ca9a3c99b94ba910b53';
    const TMDB_API_KEY = '9581389ef7dc448dc8b17ea22a930bf3';
    // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
    // Gemini APIキーをここに設定してください。
    // ※注意: 本来はサーバーサイドで管理すべきキーです。
    const GEMINI_API_KEY = 'AIzaSyDUfeARP0PATgGlG17Grqit29-U0ya5vhQ'; 
    // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
    const CORS_PROXY_URL = 'https://thingproxy.freeboard.io/fetch/';

    // --- グローバル変数 ---
    let allMoviesData = [];
    let chatHistory = [];
    let isMovieAppInitialized = false;

    // --- HTML要素の取得 ---
    const gridContainer = document.getElementById('grid-container');
    const gridItems = document.querySelectorAll('.grid-item');

    // --- API通信用の関数 ---

    async function fetchNotionMovies() {
        const apiUrl = `${CORS_PROXY_URL}https://api.notion.com/v1/databases/${MOVIE_DATABASE_ID}/query`;
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${NOTION_API_KEY}`, 'Content-Type': 'application/json', 'Notion-Version': '2022-06-28' }
            });
            if (!response.ok) throw new Error(`Notion API Error: ${response.statusText}`);
            const data = await response.json();
            return data.results.map(page => ({
                pageId: page.id,
                title: page.properties['名前']?.title[0]?.plain_text || 'タイトル不明',
                url: page.properties['URL 1']?.url || null,
                isWatched: page.properties["視聴済み"]?.checkbox || false
            }));
        } catch (error) { console.error("Notionデータ取得エラー:", error); return []; }
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
            return providersData.results?.JP?.flatrate || [];
        } catch (error) { console.error(`TMDb情報取得エラー (${title}):`, error); return []; }
    }
    
    async function updateNotionPageAsWatched(pageId) {
        const apiUrl = `${CORS_PROXY_URL}https://api.notion.com/v1/pages/${pageId}`;
        try {
            const response = await fetch(apiUrl, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${NOTION_API_KEY}`, 'Content-Type': 'application/json', 'Notion-Version': '2022-06-28' },
                body: JSON.stringify({ properties: { "視聴済み": { checkbox: true } } })
            });
            return response.ok;
        } catch (error) { console.error("Notion更新エラー:", error); return false; }
    }

    async function callGeminiAPI(prompt) {
        if (!GEMINI_API_KEY) return "エラー: Gemini APIキーが設定されていません。";
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`;
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

    // --- 映画アプリの初期化と表示 ---

    function renderMovieAppStructure(container) {
        container.innerHTML = `
            <div class="movie-app-container">
                <div id="movie-container">
                    <p>Notionから映画情報を取得中...</p>
                </div>
                <div id="chat-section">
                    <div id="chat-box"></div>
                    <div class="chat-input-area">
                        <input type="text" id="chat-input" placeholder="映画のタイトルを入力...">
                        <button id="send-button" disabled>➤</button>
                    </div>
                </div>
            </div>
        `;
    }

    function renderMovieLists(movies) {
        const movieContainer = document.getElementById('movie-container');
        const groupedByProvider = {};
        movies.forEach(movie => {
            if (movie.providers.length > 0) {
                movie.providers.forEach(provider => {
                    if (!groupedByProvider[provider.provider_name]) {
                        groupedByProvider[provider.provider_name] = { logo_path: provider.logo_path, movies: [] };
                    }
                    groupedByProvider[provider.provider_name].movies.push(movie);
                });
            }
        });
        let html = '';
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
                            <div class="movie-card ${movie.isWatched ? 'watched' : ''}">
                                <p class="movie-card-title">${movie.title}</p>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        movieContainer.innerHTML = html || '<p>視聴可能な映画が見つかりませんでした。</p>';
    }

    function displayMessage(message, sender) {
        const chatBox = document.getElementById('chat-box');
        const wrapper = document.createElement('div');
        wrapper.className = `chat-bubble-wrapper ${sender}`;
        const messageElement = document.createElement('div');
        messageElement.className = `chat-bubble chat-bubble-${sender}`;
        messageElement.innerHTML = message.replace(/\n/g, '<br>');
        wrapper.appendChild(messageElement);
        chatBox.appendChild(wrapper);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    async function handleUserInput() {
        const chatInput = document.getElementById('chat-input');
        const sendButton = document.getElementById('send-button');
        const userInput = chatInput.value.trim();
        if (!userInput) return;

        displayMessage(userInput, 'user');
        chatInput.value = '';
        sendButton.disabled = true;

        const thinkingWrapper = document.createElement('div');
        thinkingWrapper.className = 'chat-bubble-wrapper ai';
        thinkingWrapper.innerHTML = `<div class="chat-bubble chat-bubble-ai">...</div>`;
        document.getElementById('chat-box').appendChild(thinkingWrapper);

        const movie = allMoviesData.find(m => m.title.toLowerCase().includes(userInput.toLowerCase()));
        
        const prompt = `
あなたは親切な映画コンシェルジュです。ユーザーが見たい映画について話しています。
ユーザーのメッセージは「${userInput}」です。
現在利用可能な映画のリスト：${allMoviesData.map(m => `"${m.title}"`).join(', ')}

あなたのタスク：
1. ユーザーが言及した映画「${movie ? movie.title : '不明'}」について、1-2文で簡潔に紹介し、「この映画をみますか？」と必ず質問してください。
2. もしユーザーが「見る」「はい」などで肯定的に応答した場合、映画のURL（${movie ? movie.url : 'URLなし'}）と視聴済みボタンを提示してください。ボタンのHTMLは必ず '<button class="ai-button" data-page-id="${movie ? movie.pageId : ''}">視聴済みにする</button>' という形式にしてください。URLは '<a href="${movie ? movie.url : '#'}" target="_blank" class="ai-link">視聴ページへ</a>' の形式で提示してください。
3. もしユーザーが視聴済みボタンを押したことを報告してきたら、「Notionを更新しました！」と返信してください。
4. 映画を特定できない場合や、雑談の場合は、フレンドリーに対応してください。
`;

        const aiResponse = await callGeminiAPI(prompt);
        thinkingWrapper.remove();
        displayMessage(aiResponse, 'ai');
        sendButton.disabled = false;
        chatInput.focus();
    }

    async function initializeMovieApp(container) {
        if (isMovieAppInitialized) return;
        isMovieAppInitialized = true;

        renderMovieAppStructure(container);

        const chatInput = document.getElementById('chat-input');
        const sendButton = document.getElementById('send-button');
        const chatBox = document.getElementById('chat-box');

        const notionMovies = await fetchNotionMovies();
        const moviePromises = notionMovies.map(async movie => ({ ...movie, providers: await getWatchProvidersForMovie(movie.title) }));
        allMoviesData = await Promise.all(moviePromises);

        renderMovieLists(allMoviesData);

        const initialAiMessage = "今日は何を見ますか？リストから見たい映画のタイトルを教えてください。";
        chatHistory.push({ role: "model", parts: [{ text: initialAiMessage }] });
        displayMessage(initialAiMessage, 'ai');
        sendButton.disabled = false;

        sendButton.addEventListener('click', handleUserInput);
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleUserInput();
        });

        chatBox.addEventListener('click', async (e) => {
            if (e.target.matches('.ai-button')) {
                const button = e.target;
                const pageId = button.dataset.pageId;
                button.textContent = '更新中...';
                button.disabled = true;
                const success = await updateNotionPageAsWatched(pageId);
                if (success) {
                    displayMessage("Notionの視聴済みチェックを更新しました！ページを閉じるとリストに反映されます。", 'ai');
                    button.textContent = '✅ 更新完了';
                } else {
                    displayMessage("エラー：Notionの更新に失敗しました。", 'ai');
                    button.textContent = '視聴済みにする';
                    button.disabled = false;
                }
            }
        });
    }

    // --- メインのグリッド操作ロジック ---

    gridItems.forEach(item => {
        item.addEventListener('click', () => {
            const isFocused = item.classList.contains('is-focused');
            
            gridItems.forEach(i => i.classList.remove('is-focused'));
            gridContainer.classList.remove('focus-active');

            if (!isFocused) {
                item.classList.add('is-focused');
                gridContainer.classList.add('focus-active');

                if (item.classList.contains('movie')) {
                    initializeMovieApp(item.querySelector('.content-detail'));
                }
            } else {
                // フォーカス解除時に映画アプリの状態をリセット
                if (item.classList.contains('movie')) {
                    isMovieAppInitialized = false;
                    item.querySelector('.content-detail').innerHTML = '';
                    chatHistory = [];
                }
            }
        });
    });
});



