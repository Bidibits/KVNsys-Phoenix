import { type DynamicModule, Inject, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import { PrismaUserDirectory, type PrismaClient } from '@kvnsys/postgres';
import { ScryptPasswordHasher } from '../identity/scrypt-password-hasher.js';
import { SignIn } from '../identity/sign-in.js';
import { HelloController } from './hello.controller.js';
import { SignInController } from './sign-in.controller.js';
import { DatabaseClient, SignInOperation } from './tokens.js';

type Database = { client: PrismaClient | null };

/** Closes the database connection when the server stops. */
@Injectable()
class DatabaseLifecycle implements OnModuleDestroy {
  constructor(@Inject(DatabaseClient) private readonly database: Database) {}

  async onModuleDestroy(): Promise<void> {
    await this.database.client?.$disconnect();
  }
}

/** Everything the server answers. Each new area adds its controllers here. */
@Module({})
export class ServerModule {
  static withDatabase(client: PrismaClient | null): DynamicModule {
    return {
      module: ServerModule,
      controllers: [HelloController, SignInController],
      providers: [
        { provide: DatabaseClient, useValue: { client } satisfies Database },
        DatabaseLifecycle,
        {
          provide: SignInOperation,
          inject: [DatabaseClient],
          useFactory: ({ client: db }: Database) => ({
            signIn: db ? new SignIn(new PrismaUserDirectory(db), new ScryptPasswordHasher()) : null,
          }),
        },
      ],
    };
  }
}
