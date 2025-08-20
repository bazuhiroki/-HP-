// --- 基本設定 ---
const NOTION_API_KEY = 'ここにあなたのAPIキーを貼り付け'; 
const MOVIE_DATABASE_ID = 'ここに映画データベースのIDを貼り付け';

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
    // ... (前回のコードと全く同じです)
});
