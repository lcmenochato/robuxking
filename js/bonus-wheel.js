/* Roleta demonstrativa independente. Não altera preços, pedidos ou pagamentos. */
(() => {
  'use strict';
  const prizes = [50, 100, 200, 275];
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
  open.remove();
  const offer=document.createElement('dialog');
  offer.className='kr-offer-dialog';
  offer.innerHTML='<button type="button" class="kr-offer-close" aria-label="Fechar">×</button><img class="kr-offer-brand" src="https://i.postimg.cc/L50G5CsM/IMG-20261014-WA0041.jpg" alt="Robux Kingdom"><h2>Roleta de bônus</h2><p>Você desbloqueou uma chance na roleta! Quer girar agora e ganhar Robux extra grátis na compra?</p><button type="button" class="kr-offer-yes">Quero girar a roleta</button><button type="button" class="kr-offer-no">Agora não</button>';
  document.body.appendChild(offer);
  let pending=null, bypass=false, offered=false, bonus=0;
  function proceed(){const b=pending;pending=null;if(b){bypass=true;b.click();bypass=false;}}
  function dismiss(){offer.close();proceed();}
  offer.querySelector('.kr-offer-no').onclick=dismiss;
  offer.querySelector('.kr-offer-close').onclick=dismiss;
  offer.querySelector('.kr-offer-yes').onclick=()=>{offer.close();dialog.showModal();};
  document.addEventListener('click',e=>{
    if(bypass||offered||!e.target.closest)return;
    const b=e.target.closest('button');
    if(!b||!b.textContent.includes('Adicionar ao'))return;
    e.preventDefault();e.stopImmediatePropagation();
    pending=b;offered=true;offer.showModal();
  },true);
  window.addEventListener('kr-bonus-awarded',e=>{bonus=e.detail||0;});
  const continueButton=document.createElement('button');
  continueButton.type='button';continueButton.className='kr-bonus-continue';continueButton.textContent='Continuar para o carrinho';continueButton.hidden=true;
  dialog.appendChild(continueButton);
  continueButton.onclick=()=>{dialog.close();proceed();};
  dialog.addEventListener('close',()=>{if(pending)proceed();});
  function addBonusToCart(n){
    const cartDialog=document.getElementById('krCheckoutModal');
    // Exibe o bônus no carrinho; a entrega deve ser confirmada pelo sistema responsável.
    const show=()=>{if(!cartDialog)return;const body=cartDialog.querySelector('.kr-cart-body');if(body&&!body.querySelector('.kr-free-bonus'))body.insertAdjacentHTML('beforeend','<div class="kr-free-bonus">🎁 BÔNUS DA ROLETA: +'+n+' Robux <strong>GRÁTIS</strong></div>');};
    const observer=new MutationObserver(show);if(cartDialog)observer.observe(cartDialog,{childList:true,subtree:false});
    show();
  }
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => open.focus());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  const size = 600, center = size / 2, radius = 287;
  canvas.width = size; canvas.height = size;
  const segment = Math.PI * 2 / prizes.length;
  const colors = ['#1fc45e','#f2b900','#367ff1','#a34cf2'];
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  prizes.forEach((prize, i) => {
    const start = -Math.PI / 2 + i * segment;
    const gradient = ctx.createRadialGradient(center,center,35,center,center,radius);
    gradient.addColorStop(0, colors[i]);
    gradient.addColorStop(1, colors[i]);
    ctx.beginPath(); ctx.moveTo(center,center); ctx.arc(center,center,radius,start,start+segment);ctx.closePath();
    ctx.fillStyle=gradient;ctx.fill();
    ctx.lineWidth=6;ctx.strokeStyle='#f9e5a0';ctx.stroke();
    ctx.save();ctx.translate(center,center);ctx.rotate(start+segment/2);
    ctx.translate(radius*.65,0);ctx.rotate(Math.PI/2);
    ctx.shadowColor='#0009';ctx.shadowBlur=5;
    ctx.fillStyle='#ffffff';
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.font='900 52px Montserrat,Arial,sans-serif';ctx.fillText(prize,0,-11);
    ctx.font='800 19px Montserrat,Arial,sans-serif';ctx.fillText('Robux',0,30);
    ctx.restore();
  });
  for(let i=0;i<0;i++){
    const a=i*Math.PI*2/30;
    ctx.beginPath();ctx.arc(center+275*Math.cos(a),center+275*Math.sin(a),4.5,0,Math.PI*2);
    ctx.fillStyle='#fff5c4';ctx.fill();
  }
  let spinning = false, rotation = 0;
  const showPrize = index => {
    result.textContent = 'Você ganhou +' + prizes[index] + ' Robux de bônus!';
    cartValue.textContent = '+' + prizes[index] + ' Robux · Grátis';
    preview.hidden = false;
    button.querySelector('span').textContent = 'Bônus sorteado';
    button.hidden=true;continueButton.hidden=false;addBonusToCart(prizes[index]);
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
    if (spinning || bonus) return;
    spinning = true; button.disabled = true;
    button.querySelector('span').textContent = 'Girando…';
    result.textContent = '';
    const index = randomIndex();
    const previous = rotation;
    rotation = Math.ceil(rotation / 360) * 360 + 360 * 5 - (index * 90 + 45);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animation = canvas.animate(
      [{ transform: 'rotate(' + previous + 'deg)' }, { transform: 'rotate(' + rotation + 'deg)' }],
      { duration: reduced ? 0 : 3800, easing: 'cubic-bezier(.12,.72,.13,1)', fill: 'forwards' }
    );
    try { await animation.finished; } catch { /* Mantém o resultado se a animação for interrompida. */ }
    canvas.style.transform = 'rotate(' + rotation + 'deg)'; animation.cancel();
    showPrize(index); bonus=prizes[index]; spinning = false;
  });
})();
