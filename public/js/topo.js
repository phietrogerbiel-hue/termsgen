// Barra do topo, igual em todas as páginas logadas: menu lateral, troca de tema
// e botão Sair.

import './menu.js'

//tema claro / escuro
// O tema inicial já foi aplicado pelo script inline do <head>. Aqui ficam
// apenas o clique do botão e o acompanhamento da preferência do sistema.

const raiz = document.documentElement
const preferenciaSistema = window.matchMedia('(prefers-color-scheme: light)')

function aplicarTema(tema, salvar) {
  raiz.dataset.tema = tema
  if (!salvar) return
  try {
    localStorage.setItem('tema', tema)
  } catch (e) {
    // Modo privado pode bloquear o armazenamento: o tema vale só nesta aba.
  }
}

document.getElementById('tema-toggle').addEventListener('click', () => {
  aplicarTema(raiz.dataset.tema === 'claro' ? 'escuro' : 'claro', true)
})

// Se a pessoa nunca escolheu na mão, a página acompanha o tema do sistema mesmo
// com a aba já aberta (ex: Windows alternando claro/escuro ao anoitecer).
preferenciaSistema.addEventListener('change', (evento) => {
  let escolheuManualmente = false
  try {
    escolheuManualmente = !!localStorage.getItem('tema')
  } catch (e) { /* sem acesso ao armazenamento */ }

  if (!escolheuManualmente) aplicarTema(evento.matches ? 'claro' : 'escuro', false)
})

//login
// O servidor apaga a sessão; com o cookie inválido, a volta é sempre para o login.
export function irParaLogin() {
  window.location.replace('/login.html')
}

document.getElementById('sair').addEventListener('click', () => {
  fetch('/api/logout', { method: 'POST' }).finally(irParaLogin)
})
