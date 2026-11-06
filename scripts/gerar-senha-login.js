// Gera o LOGIN_SENHA_HASH para o .env a partir de uma senha digitada aqui.
// A senha não aparece na tela nem fica no histórico do terminal.
// Uso: npm run login:senha
import readline from 'readline'
import { gerarHashSenha } from '../src/auth.js'

const TAMANHO_MINIMO = 10

// Lê uma linha sem mostrar o que é digitado.
function perguntarOculto(pergunta) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    let mostrando = true
    rl._writeToOutput = (texto) => { if (mostrando) process.stdout.write(texto) }
    rl.question(pergunta, (resposta) => {
      rl.close()
      process.stdout.write('\n')
      resolve(resposta)
    })
    mostrando = false
  })
}

const senha = await perguntarOculto('Nova senha: ')
if (senha.length < TAMANHO_MINIMO) {
  console.error(`A senha precisa ter pelo menos ${TAMANHO_MINIMO} caracteres.`)
  process.exit(1)
}

const confirmacao = await perguntarOculto('Repita a senha: ')
if (confirmacao !== senha) {
  console.error('As senhas não conferem.')
  process.exit(1)
}

console.log('\nCopie a linha abaixo para o .env e reinicie o servidor:\n')
console.log(`LOGIN_SENHA_HASH=${gerarHashSenha(senha)}\n`)
