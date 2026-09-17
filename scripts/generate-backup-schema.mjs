import ts from 'typescript'
import { writeFileSync } from 'node:fs'
const program = ts.createProgram(['src/types.ts'], { strict: true })
const checker = program.getTypeChecker()
const source = program.getSourceFile('src/types.ts')
function schema(type) {
  if (type.isUnion()) return { anyOf: type.types.filter(t => !(t.flags & ts.TypeFlags.Undefined)).map(schema) }
  if (type.isLiteral()) return { const: type.value }
  if (type.flags & ts.TypeFlags.BooleanLiteral) return { const: type.intrinsicName === 'true' }
  for (const [flag, name] of [[ts.TypeFlags.String, 'string'], [ts.TypeFlags.Number, 'number'], [ts.TypeFlags.Boolean, 'boolean']]) if (type.flags & flag) return { type: name }
  if (checker.isArrayType(type)) return { type: 'array', items: schema(checker.getTypeArguments(type)[0]) }
  const properties = {}, required = []
  for (const p of type.getProperties()) {
    properties[p.name] = schema(checker.getTypeOfSymbolAtLocation(p, p.valueDeclaration || p.declarations[0]))
    if (!(p.flags & ts.SymbolFlags.Optional)) required.push(p.name)
  }
  return { type: 'object', properties, required }
}
const declaration = source.statements.find(s => s.name?.text === 'FleetState')
writeFileSync('src/lib/backupSchema.json', JSON.stringify(schema(checker.getTypeAtLocation(declaration)), null, 2) + '\n')
