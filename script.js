// HTMLの要素を取得
const gridContainer = document.getElementById('grid-container');
const gridItems = document.querySelectorAll('.grid-item');

// 各アイテムをクリックした時の処理
gridItems.forEach(item => {
    // --- フォーカスモードの処理 ---
    const contentMain = item.querySelector('.content-main');
    contentMain.addEventListener('click', (event) => {
        event.preventDefault();

        if (item.classList.contains('is-focused')) {
            gridContainer.classList.remove('focus-active');
            item.classList.remove('is-focused');
        } else {
            gridContainer.classList.add('focus-active');
            gridItems.forEach(i => i.classList.remove('is-focused'));
            item.classList.add('is-focused');
        }
    });

    // --- 全画面表示ボタンの処理 ---
    const fullscreenButton = item.querySelector('.fullscreen-button');
    fullscreenButton.addEventListener('click', (event) => {
        event.stopPropagation(); // 親要素へのクリックイベントの伝播を停止

        // 表示するコンテンツを取得
        const detailContent = item.querySelector('.content-detail').innerHTML;

        // オーバーレイを生成
        const overlay = document.createElement('div');
        overlay.className = 'fullscreen-overlay';
        
        const closeButton = document.createElement('button');
        closeButton.className = 'close-button';
        closeButton.innerHTML = '&times;'; // ×記号

        // コンテンツと閉じるボタンをオーバーレイに追加
        overlay.innerHTML = detailContent;
        // ボタンはinnerHTMLで上書きされるので、再度追加
        overlay.querySelector('.fullscreen-button').remove(); // 元のボタンは削除
        overlay.appendChild(closeButton);

        // オーバーレイをbodyに追加
        document.body.appendChild(overlay);

        // 閉じるボタンのクリックイベント
        closeButton.addEventListener('click', () => {
            document.body.removeChild(overlay);
        });
    });
});

// コンテナの背景部分をクリックしてフォーカスを解除する処理
gridContainer.addEventListener('click', (event) => {
    if (event.target === gridContainer) {
        gridContainer.classList.remove('focus-active');
        gridItems.forEach(i => i.classList.remove('is-focused'));
    }
});
