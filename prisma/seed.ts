// tsx não carrega .env: sem isto, `pnpm db:seed` falha em máquina limpa porque
// o EnvironmentSchema exige DATABASE_URL e os segredos JWT.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { PasswordHasherService } from '../src/platform/auth/password-hasher.service';
import { EnvironmentSchema } from '../src/platform/config/environment.contracts';

// Único caminho para criar um admin. Não existe endpoint de promoção, de
// propósito: um endpoint desses é a porta dos fundos favorita de quem invade.
const seedAdminUser = async (): Promise<void> => {
  const environment = EnvironmentSchema.parse(process.env);

  if (
    environment.SEED_ADMIN_EMAIL === undefined ||
    environment.SEED_ADMIN_PASSWORD === undefined
  ) {
    if (environment.NODE_ENV === 'production') {
      throw new Error(
        'SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD são obrigatórios em produção',
      );
    }
    console.log('SEED_ADMIN_* não definidos: nada a semear');
    return;
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: environment.DATABASE_URL }),
  });
  // Mesmo hasher da aplicação: reimplementar argon2 aqui criaria uma segunda
  // fonte de verdade para o formato do hash.
  const passwordHasher = new PasswordHasherService();

  try {
    const passwordHash = await passwordHasher.hashPassword(environment.SEED_ADMIN_PASSWORD);
    // O update também redefine a senha: sem isso, alguém que registrasse o
    // email do admin pela rota pública antes do primeiro seed seria promovido
    // mantendo a PRÓPRIA senha. O seed é a fonte de verdade da credencial.
    const admin = await prisma.user.upsert({
      where: { email: environment.SEED_ADMIN_EMAIL },
      update: { role: 'admin', passwordHash },
      create: { email: environment.SEED_ADMIN_EMAIL, passwordHash, role: 'admin' },
    });
    console.log(`admin pronto: ${admin.email}`);
  } finally {
    await prisma.$disconnect();
  }
};

void seedAdminUser();
