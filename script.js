// HTMLの要素を取得
const gridContainer = document.getElementById('grid-container');
const gridItems = document.querySelectorAll('.grid-item');

// 各アイテムをクリックした時の処理
gridItems.forEach(item => {
    item.addEventListener('click', (event) => {
        if (event.target.classList.contains('fullscreen-button')) {
            return;
        }
        event.preventDefault();

        if (item.classList.contains('is-focused')) {
            gridContainer.classList.remove('focus-active');
            item.classList.remove('is-focused');
        } else {
            gridContainer.classList.add('focus-active');
            gridItems.forEach(i => i.classList.remove('is-focused'));
            item.classList.add('is-focused');

            // ▼▼▼ 映画カードがフォーカスされた際の特別処理 ▼▼▼
            if (item.classList.contains('movie')) {
                const detailView = item.querySelector('.content-detail');
                const notionLink = item.dataset.notionLink;
                
                if (notionLink) {
                    detailView.innerHTML = `
                        <iframe class="notion-iframe" src="${notionLink}"></iframe>
                        <button class="fullscreen-button">全画面で開く</button>
                    `;
                } else {
                    detailView.innerHTML = `<p style="padding: 30px;">Notionリンクが設定されていません。</p>`;
                }
            }
        }
    });

    // 全画面表示ボタンの処理
    item.addEventListener('click', function(event) {
        if (event.target.classList.contains('fullscreen-button')) {
            event.stopPropagation();

            // 映画カードの場合はリンクを新しいタブで開く
            if (item.classList.contains('movie')) {
                const notionLink = item.dataset.notionLink;
                if (notionLink) {
                    window.open(notionLink, '_blank');
                }
                return; // オーバーレイ処理は行わない
            }
            
            // それ以外のカードはオーバーレイ表示
            const detailContent = item.querySelector('.content-detail').innerHTML;
            const overlay = document.createElement('div');
            overlay.className = 'fullscreen-overlay';
            const closeButton = document.createElement('button');
            closeButton.className = 'close-button';
            closeButton.innerHTML = '&times;';
            overlay.innerHTML = detailContent;
            const originalFsBtn = overlay.querySelector('.fullscreen-button');
            if (originalFsBtn) {
                originalFsBtn.remove();
            }
            overlay.appendChild(closeButton);
            document.body.appendChild(overlay);
            closeButton.addEventListener('click', () => {
                document.body.removeChild(overlay);
            });
        }
    });
});

// 背景クリックでフォーカス解除
gridContainer.addEventListener('click', (event) => {
    if (event.target === gridContainer) {
        gridContainer.classList.remove('focus-active');
        gridItems.forEach(i => i.classList.remove('is-focused'));
    }
});
