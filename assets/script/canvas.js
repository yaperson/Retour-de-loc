export default () => {
    const canvas = document.getElementById('signatureCanvas');
    const ctx = canvas.getContext('2d');
    let drawing = false;

    canvas.addEventListener('mousedown', (e) => {
        drawing = true;
        ctx.beginPath();
        ctx.moveTo(e.offsetX, e.offsetY);
    });

    canvas.addEventListener('mousemove', (e) => {
        if (drawing) {
            ctx.lineTo(e.offsetX, e.offsetY);
            ctx.stroke();
        }
    });

    canvas.addEventListener('mouseup', () => {
        drawing = false;
    });

    canvas.addEventListener('mouseleave', () => {
        drawing = false;
    });

    canvas.addEventListener("touchstart", (e) => {
        e.preventDefault();
        isDrawing = true;
        const { x, y } = getXY(e);
        ctx.beginPath();
        ctx.moveTo(x, y);
    });
    canvas.addEventListener("touchmove", (e) => {
        e.preventDefault();
        if (!isDrawing) return;
        const { x, y } = getXY(e);
        ctx.lineTo(x, y);
        ctx.stroke();
    });
    canvas.addEventListener("touchend", () => isDrawing = false);

    document.getElementById('clearSignature').addEventListener('click', () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    });
}
