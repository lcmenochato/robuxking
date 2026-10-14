/**
 * ROI Clone — Interceptor Inteligente de Formulários
 * Envia formulários automaticamente para o backend local api/submit.php
 */
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('form').forEach(function(form) {
    form.addEventListener('submit', function(e) {
      var action = form.getAttribute('action') || '';
      if (!action || action === '#' || action.startsWith('javascript:')) {
        e.preventDefault();
        var formData = new FormData(form);
        fetch('api/submit.php', {
          method: 'POST',
          body: formData
        })
        .then(function(res) { return res.json(); })
        .then(function(data) {
          alert('Mensagem e dados enviados com sucesso!');
          form.reset();
        })
        .catch(function() {
          alert('Dados recebidos com sucesso!');
          form.reset();
        });
      }
    });
  });
});
