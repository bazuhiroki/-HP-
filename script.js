<script>
    function showPopup(notionUrl) {
        const popupContainer = document.getElementById('popup-container');
        const iframeContainer = document.getElementById('iframe-container');
        
        // iframeを作成
        const iframe = document.createElement('iframe');
        iframe.src = notionUrl;

        // コンテナの中身をクリアして新しいiframeを挿入
        iframeContainer.innerHTML = '';
        iframeContainer.appendChild(iframe);
        
        // ポップアップを表示
        popupContainer.style.display = 'flex';
    }

    function closePopup() {
        const popupContainer = document.getElementById('popup-container');
        popupContainer.style.display = 'none';
        
        // ポップアップを閉じる際にiframeを削除
        const iframeContainer = document.getElementById('iframe-container');
        iframeContainer.innerHTML = '';
    }
</script>
