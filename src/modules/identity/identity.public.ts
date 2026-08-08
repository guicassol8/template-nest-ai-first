// Única superfície importável por outro módulo. Re-export nomeado, nunca
// `export *`: quem lê este arquivo tem que descobrir os nomes sem grepar a pasta.
//
// IdentityRepository e UserRecord ficam de fora de propósito — passwordHash não
// atravessa a fronteira do módulo.
export { IdentityService } from './identity.service';
export type { AuthTokens, User } from './identity.contracts';
