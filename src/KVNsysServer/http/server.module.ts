import { type DynamicModule, Inject, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import { PrismaProductCatalog, PrismaUserDirectory, type PrismaClient } from '@kvnsys/postgres';
import { Authorizer } from '../identity/authorizer.js';
import { ScryptPasswordHasher } from '../identity/scrypt-password-hasher.js';
import { Sessions } from '../identity/sessions.js';
import { SignIn } from '../identity/sign-in.js';
import { HelloController } from './hello.controller.js';
import { ProductsController } from './products.controller.js';
import { SessionController } from './session.controller.js';
import { SignInController } from './sign-in.controller.js';
import { DatabaseClient, ProductsOperation, SignInOperation } from './tokens.js';

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
      controllers: [HelloController, SignInController, SessionController, ProductsController],
      providers: [
        { provide: DatabaseClient, useValue: { client } satisfies Database },
        DatabaseLifecycle,
        // One per server, so two servers in one test run never share who's signed in.
        { provide: Sessions, useFactory: () => new Sessions() },
        {
          provide: SignInOperation,
          inject: [DatabaseClient],
          useFactory: ({ client: db }: Database) => ({
            signIn: db ? new SignIn(new PrismaUserDirectory(db), new ScryptPasswordHasher()) : null,
          }),
        },
        {
          provide: ProductsOperation,
          inject: [DatabaseClient, Sessions],
          useFactory: ({ client: db }: Database, sessions: Sessions) => ({
            products: db
              ? { catalog: new PrismaProductCatalog(db), authorizer: new Authorizer(sessions, new PrismaUserDirectory(db)) }
              : null,
          }),
        },
      ],
    };
  }
}
