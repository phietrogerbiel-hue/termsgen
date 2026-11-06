// Traz para o painel os termos que já estão na pasta do Clicksign configurada em
// CLICKSIGN_PASTA_ID (os enviados antes de o painel existir ou criados à mão).
// Pode rodar mais de uma vez: o que já está no banco é pulado.
//
// Uso: npm run clicksign:importar
//      npm run clicksign:importar -- --desde=2026-01-01   (só os criados a partir da data)
import { clicksignConfigurado, ambienteClicksign } from '../src/clicksign.js'
import { importarDaPasta } from '../src/painel.js'

if (!clicksignConfigurado()) {
  console.error('Defina CLICKSIGN_ACCESS_TOKEN no .env antes de importar.')
  process.exit(1)
}

const desde = process.argv.find(a => a.startsWith('--desde='))?.split('=')[1]
if (desde && !/^\d{4}-\d{2}-\d{2}$/.test(desde)) {
  console.error('Use a data no formato AAAA-MM-DD, ex: --desde=2026-01-01')
  process.exit(1)
}

console.log(`\nImportando a pasta configurada (${ambienteClicksign()})${desde ? ` desde ${desde}` : ''}.`)
console.log('A API não filtra por pasta: cada envelope da conta é conferido, pode demorar.\n')

try {
  // Só contagens no terminal: nomes e e-mails dos colaboradores não aparecem (LGPD).
  const r = await importarDaPasta({ desde }, ({ vistos, total, importados }) => {
    process.stdout.write(`\r${vistos} de ${total} envelopes conferidos, ${importados} importados`)
  })
  console.log(`\n\nConcluído: ${r.importados} importados, ${r.jaRegistrados} já estavam no painel.`)
  if (r.falhas > 0) console.log(`${r.falhas} envelope(s) pulados por erro (detalhes acima). Rode de novo para tentar outra vez.`)
} catch (err) {
  console.error('\nA importação parou:', err.message)
  console.error('O que já foi importado ficou salvo; rode de novo para continuar.')
  process.exit(1)
}
