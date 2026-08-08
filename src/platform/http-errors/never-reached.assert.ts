// Fecha switch sobre union: se alguém adicionar um valor novo e esquecer de
// tratá-lo, o parâmetro deixa de ser `never` e o build quebra — que é o objetivo.
export const assertNeverReached = (value: never): never => {
  throw new Error(`Valor não tratado em switch exaustivo: ${JSON.stringify(value)}`);
};
