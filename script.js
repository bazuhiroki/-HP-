document.addEventListener('DOMContentLoaded', () => {

    // --- 基本設定 ---
    const NOTION_API_KEY = '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';
    const MOVIE_DATABASE_ID = 'b3c72857276f4ca9a3c99b94ba910b53';
    const TMDB_API_KEY = '9581389ef7dc448dc8b17ea22a930bf3';
    // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
    // Gemini APIキーをここに設定してください。
    const GEMINI_API_KEY = 'AIzaSyCVo6Wu77DJryjPh3tNtBQzvtgMnrIJBYA'; 
    // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
    const CORS_PROXY_URL = 'https://corsproxy.io/?';
    const ALLOWED_PROVIDERS = ['Netflix', 'Hulu', 'Amazon Prime Video'];

    // --- グローバル変数 ---
    let allMoviesData = [];
    let chatHistory = [];
    let isMovieAppInitialized = false;

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
                setTimeout(() => {
                    if (button.classList.contains('copy-title-button')) {
                         button.textContent = '📋';
                    } else {
                         button.textContent = 'タイトルをコピー';
                    }
                }, 1500);
            }
        } catch (err) {
            console.error('テキストのコピーに失敗しました: ', err);
        }
        document.body.removeChild(textArea);
    }

    // --- API通信用の関数 ---

    async function fetchNotionMovies() {
        const targetUrl = `https://api.notion.com/v1/databases/${MOVIE_DATABASE_ID}/query`;
        const apiUrl = `${CORS_PROXY_URL}${encodeURIComponent(targetUrl)}`;
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
                body: JSON.stringify({ properties: { "視聴済み": { checkbox: true } } })
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
            if (!response.ok) {
                 const errorData = await response.json();
                 console.error("Gemini API Error Response:", errorData);
                 throw new Error("Gemini API request failed");
            }
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
            <button class="fullscreen-toggle-button" title="全画面表示切り替え">⛶</button>
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
                                    <button class="copy-title-button" data-title="${movie.title}" title="タイトルをコピー">📋</button>
                                    <p class="movie-card-title">${movie.title}</p>
                                    ${movie.isWatched ? '<span class="watched-badge">✅ 視聴済み</span>' : ''}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }
        }
        movieContainer.innerHTML = html;
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
        
        const prompt = userInput;

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

        container.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        const chatInput = document.getElementById('chat-input');
        const sendButton = document.getElementById('send-button');
        const chatBox = document.getElementById('chat-box');
        const movieContainer = document.getElementById('movie-container');
        const fullscreenButton = container.querySelector('.fullscreen-toggle-button');

        fullscreenButton.addEventListener('click', (e) => {
            e.stopPropagation();
            container.parentElement.classList.toggle('is-fullscreen');
        });

        const notionMovies = await fetchNotionMovies();
        const moviePromises = notionMovies.map(async movie => ({ ...movie, providers: await getWatchProvidersForMovie(movie.title) }));
        allMoviesData = await Promise.all(moviePromises);

        renderMovieLists(allMoviesData);

        movieContainer.addEventListener('click', (e) => {
            const copyButton = e.target.closest('.copy-title-button');
            if (copyButton) {
                e.stopPropagation();
                copyToClipboard(copyButton.dataset.title, copyButton);
                return;
            }

            const card = e.target.closest('.movie-card');
            if (card) {
                chatInput.value = card.dataset.title;
                chatInput.focus();
            }
        });

        // ★★★ 改善点: AIへの指示（プロンプト）をコピーボタン対応に更新 ★★★
        const unWatchedMovies = allMoviesData.filter(m => !m.isWatched);
        const initialSystemPrompt = `
あなたは知識豊富でフレンドリーな映画コンシェルジュAIです。

# あなたが持っている情報
以下の映画リストを知っています。各映画の視聴URLとIDも把握しています。
${allMoviesData.map(m => `- タイトル: "${m.title}", 視聴状況: ${m.isWatched ? '視聴済み' : '未視聴'}, URL: ${m.url || 'なし'}, pageId: ${m.pageId}`).join('\n')}

# あなたの行動ルール
1. **映画の特定と確認:** ユーザーの発言がリスト内の特定の映画タイトルに言及している場合、その映画を1-2文で簡潔に紹介し、「この映画について、もっと詳しく知りたいですか？それとも視聴しますか？」と尋ねてください。
2. **視聴の意思表示への対応:** ユーザーが「見る」「視聴する」「みたい」と答えた場合、**会話の文脈からどの映画について話しているかを判断**してください。そして、その映画の正しい情報を使って、以下の対応をしてください。
    - **もしURLが登録されている場合:** 以下の2つを提示してください。
        - 視聴ページのリンク: '<a href="[該当映画の正しいURL]" target="_blank" class="ai-link">視聴ページへ</a>'
        - 視聴済みボタン: '<button class="ai-button" data-page-id="[該当映画の正しいpageId]">視聴済みにする</button>'
    - **もしURLが「なし」の場合:** 「申し訳ありません、この映画の視聴URLは登録されていませんでした。代わりにFilmarksでレビューや情報を探せるリンクをご用意しました。」と伝えた上で、以下の3つを提示してください。
        - タイトルコピーボタン: '<button class="ai-button copy-ai-title" data-title="[該当映画の正しいタイトル]">タイトルをコピー</button>'
        - Filmarksの検索リンク: '<a href="https://filmarks.com/search/movies?q=${encodeURIComponent('[該当映画の正しいタイトル]')}" target="_blank" class="ai-link">Filmarksで探す</a>'
        - 視聴済みボタン: '<button class="ai-button" data-page-id="[該当映画の正しいpageId]">視聴済みにする</button>'
3. **おすすめの提案:** ユーザーが「おすすめは？」と尋ねてきた場合、リストの中から**未視聴の映画**を1つ選び、推薦してください。「例えば『${unWatchedMovies.length > 0 ? unWatchedMovies[0].title : '（現在、未視聴の映画はありません）'}』はいかがでしょう？[ここに簡単な推薦理由を記述]」のように提案してください。
4. **雑談:** 上記以外の場合は、映画に関する知識を活かして、自由に会話を楽しんでください。
`;
        
        chatHistory = [
            { role: "user", parts: [{ text: initialSystemPrompt }] },
            { role: "model", parts: [{ text: "承知いたしました。映画コンシェルジュとして、ご案内します。" }] }
        ];

        const initialAiMessage = "今日は何を見ますか？リストの映画をクリックするか、タイトルを入力してください。おすすめを聞いてくれてもいいですよ。";
        displayMessage(initialAiMessage, 'ai');
        sendButton.disabled = false;

        sendButton.addEventListener('click', handleUserInput);
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleUserInput();
        });

        chatBox.addEventListener('click', async (e) => {
            // ★★★ 改善点: AIが生成したコピーボタンの処理を追加 ★★★
            if (e.target.matches('.copy-ai-title')) {
                copyToClipboard(e.target.dataset.title, e.target);
                return;
            }

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
            
            gridItems.forEach(i => i.classList.remove('is-focused', 'is-fullscreen'));
            gridContainer.classList.remove('focus-active');

            if (!isFocused) {
                item.classList.add('is-focused');
                gridContainer.classList.add('focus-active');

                if (item.classList.contains('movie')) {
                    initializeMovieApp(item.querySelector('.content-detail'));
                }
            } else {
                if (item.classList.contains('movie')) {
                    isMovieAppInitialized = false;
                    item.querySelector('.content-detail').innerHTML = '';
                    chatHistory = [];
                }
            }
        });
    });
});










