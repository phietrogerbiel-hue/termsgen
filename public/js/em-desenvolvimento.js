// Tema, botão Sair e menu lateral vêm de topo.js, igual às outras páginas.
import './topo.js'
import { OPCOES } from './menu.js'

// Página de espera das opções "Em breve". Só aceita recursos que estão em
// OPCOES: um ?recurso= qualquer cai no texto genérico do HTML.
const recurso = new URLSearchParams(location.search).get('recurso')
const opcao = OPCOES.find(o => o.recurso && o.recurso === recurso)

if (opcao) {
  document.title = `${opcao.rotulo} — Gerador de Termos`
  document.getElementById('em-dev-texto').textContent =
    `${opcao.rotulo} ainda está em construção. Logo aparece por aqui.`
}
