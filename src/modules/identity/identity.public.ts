// Única superfície importável por outro módulo. Sempre re-export nomeado: quem
// lê este arquivo tem que descobrir os nomes aqui, sem grepar a pasta inteira.
//
// IdentityRepository e UserRecord ficam de fora de propósito — passwordHash não
// atravessa a fronteira do módulo.
export { IdentityService } from './identity.service';
export type { AuthTokens, User } from './identity.contracts';
