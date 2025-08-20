// --- 基本設定 ---
const NOTION_API_KEY = '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';
const MOVIE_DATABASE_ID = '6acc1111f02f4977b5b782b2d4d64b71';
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
            
            // ▼▼▼【修正点】プロパティの中から「タイプがtitleのもの」を自動で探すように変更 ▼▼▼
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
        const response = await fetch(`https://api.themoviedb.org/3/movie/${movieId}/watch/providers?api_key=${
