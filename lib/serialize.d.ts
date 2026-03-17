import type {ASTNode} from './index.js'

export function serialize(ast: ASTNode): string

declare const serializeDefault: typeof serialize

export type {ASTNode} from './index.js'
export default serializeDefault
