// HTMLの要素を取得
const gridContainer = document.getElementById('grid-container');
const gridItems = document.querySelectorAll('.grid-item');

// 各アイテムをクリックした時の処理
gridItems.forEach(item => {
    item.addEventListener('click', (event) => {
        event.preventDefault(); // リンクのデフォルト動作を無効化

        // クリックされたアイテムに 'is-focused' クラスを付ける
        gridContainer.classList.add('focus-active');
        
        // 他のアイテムから 'is-focused' を外す
        gridItems.forEach(i => i.classList.remove('is-focused'));
        
        // クリックされたアイテムにクラスを付ける
        item.classList.add('is-focused');
    });
});

// コンテナの背景部分をクリックしてフォーカスを解除する処理
gridContainer.addEventListener('click', (event) => {
    // クリックされた場所がコンテナ自身（アイテムではない）の場合
    if (event.target === gridContainer) {
        gridContainer.classList.remove('focus-active');
        gridItems.forEach(i => i.classList.remove('is-focused'));
    }
});
