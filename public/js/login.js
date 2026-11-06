// Tela de login: envia usuário e senha e, se o servidor aceitar, volta para o
// formulário. O cookie da sessão é gravado pelo próprio servidor (HttpOnly), então
// este script nunca vê nem guarda nada da sessão.

const form = document.getElementById('form-login')
const botao = document.getElementById('login-botao')
const rotulo = botao.querySelector('.login-botao-rotulo')
const erro = document.getElementById('login-erro')
const erroTexto = document.getElementById('login-erro-texto')
const senha = form.senha
const verSenha = document.getElementById('ver-senha')
const avisoCaps = document.getElementById('login-caps')

function mostrarErro(texto) {
  erroTexto.textContent = texto
  erro.hidden = !texto
  if (!texto) return
  // tremida curta para chamar atenção; reinicia se errar de novo
  form.classList.remove('tremer')
  void form.offsetWidth
  form.classList.add('tremer')
}

function carregando(ativo) {
  botao.disabled = ativo
  botao.classList.toggle('carregando', ativo)
  rotulo.textContent = ativo ? 'Entrando…' : 'Entrar'
}

// mostrar/ocultar a senha
verSenha.addEventListener('click', () => {
  const mostrando = senha.type === 'text'
  senha.type = mostrando ? 'password' : 'text'
  verSenha.setAttribute('aria-pressed', String(!mostrando))
  verSenha.setAttribute('aria-label', mostrando ? 'Mostrar senha' : 'Ocultar senha')
  senha.focus()
})

// aviso de Caps Lock enquanto digita a senha
function conferirCaps(evento) {
  if (typeof evento.getModifierState === 'function') {
    avisoCaps.hidden = !evento.getModifierState('CapsLock')
  }
}
senha.addEventListener('keydown', conferirCaps)
senha.addEventListener('keyup', conferirCaps)
senha.addEventListener('blur', () => { avisoCaps.hidden = true })

form.addEventListener('submit', async (evento) => {
  evento.preventDefault()
  mostrarErro('')

  const usuario = form.usuario.value.trim()
  if (!usuario || !senha.value) {
    mostrarErro('Preencha usuário e senha.')
    ;(usuario ? senha : form.usuario).focus()
    return
  }

  carregando(true)
  let entrou = false

  try {
    const resp = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, senha: senha.value })
    })

    if (resp.ok) {
      // o botão continua "Entrando…" até a página trocar
      entrou = true
      window.location.replace('/')
      return
    }

    const { erro: mensagem } = await resp.json().catch(() => ({}))
    mostrarErro(mensagem || 'Não foi possível entrar.')
    senha.value = ''
    senha.focus()
  } catch {
    mostrarErro('Não foi possível conectar ao servidor. Tente novamente.')
  } finally {
    if (!entrou) carregando(false)
  }
})
