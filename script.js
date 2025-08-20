// HTML要素を取得
const viewport = document.getElementById('viewport');
const canvas = document.getElementById('canvas');

// キャンバスの状態を管理する変数
let scale = 1;
let panX = 0;
let panY = 0;
let isPanning = false;
let startX = 0;
let startY = 0;

// キャンバスの変形を適用する関数
function updateTransform() {
    canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
}

// マウスホイールでのズーム処理
viewport.addEventListener('wheel', (event) => {
    event.preventDefault(); // ページのスクロールを防止

    const zoomIntensity = 0.1;
    const wheel = event.deltaY < 0 ? 1 : -1;
    const zoom = Math.exp(wheel * zoomIntensity);

    // マウスカーソル位置を基準にズームする
    const rect = viewport.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    
    panX -= (mouseX - panX) * (zoom - 1);
    panY -= (mouseY - panY) * (zoom - 1);
    scale *= zoom;

    updateTransform();
});

// マウスドラッグでの移動処理
viewport.addEventListener('mousedown', (event) => {
    isPanning = true;
    startX = event.clientX;
    startY = event.clientY;
    viewport.style.cursor = 'grabbing';
});

viewport.addEventListener('mouseup', () => {
    isPanning = false;
    viewport.style.cursor = 'grab';
});

viewport.addEventListener('mouseleave', () => {
    isPanning = false;
    viewport.style.cursor = 'grab';
});

viewport.addEventListener('mousemove', (event) => {
    if (!isPanning) return;
    panX += event.clientX - startX;
    panY += event.clientY - startY;
    startX = event.clientX;
    startY = event.clientY;
    updateTransform();
});

// 初期状態を適用
updateTransform();
