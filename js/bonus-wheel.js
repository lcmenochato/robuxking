/* Roleta demonstrativa independente. Não altera preços, pedidos ou pagamentos. */
(() => {
  'use strict';
  const prizes = [100, 250, 300, 400, 500];
  const canvas = document.getElementById('krBonusWheel');
  const button = document.getElementById('krBonusSpin');
  const result = document.getElementById('krBonusResult');
  if (!canvas || !button || !result) return;
  const dialog = document.getElementById('krBonusDialog');
  const open = document.getElementById('krBonusOpen');
  const close = document.getElementById('krBonusClose');
  const preview = document.getElementById('krBonusPreview');
  const cartValue = document.getElementById('krBonusCartValue');
  if (!dialog || !open || !close || !preview || !cartValue) return;
  open.addEventListener('click', () => dialog.showModal());
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => open.focus());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const tokens = getComputedStyle(document.documentElement);
  const token = name => tokens.getPropertyValue(name).trim();
  const size = 560, center = size / 2, radius = center;
  canvas.width = size; canvas.height = size;
  const segment = Math.PI * 2 / prizes.length;
  prizes.forEach((prize, i) => {
    const start = -Math.PI / 2 + i * segment;
    ctx.beginPath(); ctx.moveTo(center, center);
    ctx.arc(center, center, radius, start, start + segment); ctx.closePath();
    ctx.fillStyle = token('--wheel-' + (i + 1)); ctx.fill();
    ctx.save(); ctx.translate(center, center); ctx.rotate(start + segment / 2);
    ctx.translate(radius * .66, 0); ctx.rotate(Math.PI / 2);
    ctx.fillStyle = token(i === 1 || i === 3 ? '--clean-text' : '--clean-on-accent');
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '800 34px Arial, sans-serif'; ctx.fillText('+' + prize, 0, -8);
    ctx.font = '600 18px Arial, sans-serif'; ctx.fillText('ROBUX', 0, 26);
    ctx.restore();
  });
  let spinning = false, rotation = 0;
  const showPrize = index => {
    result.textContent = 'Bônus sorteado: +' + prizes[index] + ' Robux';
    cartValue.textContent = '+' + prizes[index] + ' Robux · R$ 0,00';
    preview.hidden = false;
    button.querySelector('span').textContent = 'Girar novamente';
    button.disabled = false;
    canvas.setAttribute('aria-label', 'Resultado de prévia: +' + prizes[index] + ' Robux');
  };
  const randomIndex = () => {
    if (globalThis.crypto?.getRandomValues) {
      const values = new Uint32Array(1);
      const limit = Math.floor(4294967296 / prizes.length) * prizes.length;
      do { crypto.getRandomValues(values); } while (values[0] >= limit);
      return values[0] % prizes.length;
    }
    return Math.floor(Math.random() * prizes.length);
  };
  button.addEventListener('click', async () => {
    if (spinning) return;
    spinning = true; button.disabled = true;
    button.querySelector('span').textContent = 'Girando…';
    result.textContent = '';
    const index = randomIndex();
    const previous = rotation;
    rotation = Math.ceil(rotation / 360) * 360 + 360 * 5 + 360 - (index * 72 + 36);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animation = canvas.animate(
      [{ transform: 'rotate(' + previous + 'deg)' }, { transform: 'rotate(' + rotation + 'deg)' }],
      { duration: reduced ? 0 : 3800, easing: 'cubic-bezier(.12,.72,.13,1)', fill: 'forwards' }
    );
    try { await animation.finished; } catch { /* Mantém o resultado se a animação for interrompida. */ }
    canvas.style.transform = 'rotate(' + rotation + 'deg)'; animation.cancel();
    showPrize(index); spinning = false;
  });
})();
