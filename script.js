<script>
    document.addEventListener('DOMContentLoaded', () => {
        // 全てのカード要素を取得
        const allCards = document.querySelectorAll('.card');

        allCards.forEach(card => {
            card.addEventListener('click', (event) => {
                const cardType = card.dataset.cardType;

                if (cardType === 'movie') {
                    const notionUrl = card.dataset.notionUrl;
                    if (notionUrl) {
                        showMoviePopup(notionUrl);
                    }
                } else if (cardType === 'other') {
                    showOtherPopup();
                }
            });
        });
    });

    // 映画カード用のポップアップ表示関数
    function showMoviePopup(notionUrl) {
        const popupContainer = document.getElementById('popup-container');
        const popupInner = document.getElementById('popup-inner');
        
        // iframeを作成し、NotionのURLを設定
        const iframe = document.createElement('iframe');
        iframe.src = notionUrl;

        // コンテナの中身をクリアして新しいiframeを挿入
        popupInner.innerHTML = '';
        popupInner.appendChild(iframe);
        
        // ポップアップを表示
        popupContainer.style.display = 'flex';
    }

    // その他のカード用のポップアップ表示関数
    function showOtherPopup() {
        const popupContainer = document.getElementById('popup-container');
        const popupInner = document.getElementById('popup-inner');

        // ポップアップに表示する内部コンテンツ
        const content = `
            <h2>書籍の詳細</h2>
            <p>この書籍はとても面白いです。物語が深く、登場人物が魅力的です。</p>
            <p>読書体験を共有しましょう。</p>
        `;

        // コンテナに内部コンテンツを挿入
        popupInner.innerHTML = `<div class="inner-content">${content}</div>`;

        // ポップアップを表示
        popupContainer.style.display = 'flex';
    }

    // ポップアップを閉じる関数
    function closePopup() {
        const popupContainer = document.getElementById('popup-container');
        popupContainer.style.display = 'none';
        
        // コンテンツをクリア
        const popupInner = document.getElementById('popup-inner');
        popupInner.innerHTML = '';
    }
</script>
