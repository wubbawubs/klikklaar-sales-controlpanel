#!/usr/bin/env node
// Eenmalig: genereert import.sql uit finance-control-exports. Voert niets uit en verbindt met geen database.
// Gebruik: node scripts/finance-control-import.mjs <map>
// De map bevat companies.json, revenue_targets.json, expenses.json en mapping.json
// ({ "<fc company id>": <exact_division> }). Resultaat: <map>/import.sql, handmatig te draaien na controle.
// Laadt src/lib/finance/fcImport.ts rechtstreeks via Node type stripping (Node >= 22.18); geen extra dependencies.
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { buildImportSql } from '../src/lib/finance/fcImport.ts'

const dir = process.argv[2]
if (!dir) {
  console.error('Gebruik: node scripts/finance-control-import.mjs <map>')
  process.exit(1)
}
const read = (f) => JSON.parse(readFileSync(join(resolve(dir), f), 'utf8'))

const sql = buildImportSql({
  companies: read('companies.json'),
  targets: read('revenue_targets.json'),
  expenses: read('expenses.json'),
  mapping: read('mapping.json'),
})
const target = join(resolve(dir), 'import.sql')
writeFileSync(target, sql)
console.log(`Geschreven: ${target} (niet uitgevoerd)`)
