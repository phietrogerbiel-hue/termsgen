// Lista as pastas da conta do Clicksign configurada no .env, para descobrir o
// valor de CLICKSIGN_PASTA_ID. Uso: npm run clicksign:pastas
import { clicksignConfigurado, ambienteClicksign, listarPastas } from '../src/clicksign.js'

if (!clicksignConfigurado()) {
  console.error('Defina CLICKSIGN_ACCESS_TOKEN no .env antes de listar as pastas.')
  process.exit(1)
}

try {
  const pastas = await listarPastas()
  console.log(`\nPastas no Clicksign (${ambienteClicksign()}): ${pastas.length}\n`)
  for (const p of pastas) {
    console.log(`${p.id}  ${p.caminho ? `${p.caminho}/` : ''}${p.nome}`)
  }
  console.log('\nCopie o ID da pasta desejada para CLICKSIGN_PASTA_ID no .env.')
} catch (err) {
  console.error('Não foi possível listar as pastas:', err.message)
  process.exit(1)
}
