import { type DynamicModule, Inject, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import type { PcIdentity } from '@kvnsys/core';
import {
  PrismaCatalogBook,
  PrismaProductCatalog,
  PrismaRegisterBook,
  PrismaRoleCatalog,
  PrismaSalesJournal,
  PrismaShiftBook,
  PrismaShopDirectory,
  PrismaStockLedger,
  PrismaUserAccounts,
  PrismaUserDirectory,
  type PrismaClient,
} from '@kvnsys/postgres';
import { Authorizer } from '../identity/authorizer.js';
import { ScryptPasswordHasher } from '../identity/scrypt-password-hasher.js';
import { Sessions } from '../identity/sessions.js';
import { SignIn } from '../identity/sign-in.js';
import { ServerPassword } from '../security/server-password.js';
import { CatalogController, type CatalogOperationParts } from './catalog.controller.js';
import { HelloController } from './hello.controller.js';
import { JoinController } from './join.controller.js';
import { ProductsController } from './products.controller.js';
import { SessionController } from './session.controller.js';
import { SignInController, type SignInOperationParts } from './sign-in.controller.js';
import { RegistersController, type RegistersOperationParts } from './registers.controller.js';
import { RolesController, type RolesOperationParts } from './roles.controller.js';
import { SalesController, type SalesOperationParts } from './sales.controller.js';
import { ShiftsController, type ShiftsOperationParts } from './shifts.controller.js';
import { StockController, type StockOperationParts } from './stock.controller.js';
import {
  CatalogOperation,
  DatabaseClient,
  ProductsOperation,
  RegistersOperation,
  RolesOperation,
  SalesOperation,
  ShiftsOperation,
  SignInOperation,
  StockOperation,
  UsersOperation,
} from './tokens.js';
import { UsersController, type UsersOperationParts } from './users.controller.js';

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
  /**
   * `server` is the PC this server runs on, which says which shop's stock it keeps. `serverPassword`
   * is the password registers must give, when it's on.
   */
  static withDatabase(client: PrismaClient | null, server: PcIdentity, serverPassword: ServerPassword): DynamicModule {
    return {
      module: ServerModule,
      controllers: [HelloController, JoinController, SignInController, SessionController, ProductsController, UsersController, RolesController, StockController, SalesController, RegistersController, ShiftsController, CatalogController],
      providers: [
        { provide: DatabaseClient, useValue: { client } satisfies Database },
        DatabaseLifecycle,
        // One per server, so two servers in one test run never share who's signed in.
        { provide: Sessions, useFactory: () => new Sessions() },
        { provide: ServerPassword, useValue: serverPassword },
        {
          provide: SignInOperation,
          inject: [DatabaseClient],
          useFactory: ({ client: db }: Database) => ({
            signIn: db
              ? ({
                  signIn: new SignIn(new PrismaUserDirectory(db), new ScryptPasswordHasher()),
                  registers: new PrismaRegisterBook(db),
                  shops: new PrismaShopDirectory(db),
                  server,
                } satisfies SignInOperationParts)
              : null,
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
        {
          provide: CatalogOperation,
          inject: [DatabaseClient, Sessions],
          useFactory: ({ client: db }: Database, sessions: Sessions) => ({
            catalog: db
              ? ({ book: new PrismaCatalogBook(db), authorizer: new Authorizer(sessions, new PrismaUserDirectory(db)) } satisfies CatalogOperationParts)
              : null,
          }),
        },
        {
          provide: UsersOperation,
          inject: [DatabaseClient, Sessions],
          useFactory: ({ client: db }: Database, sessions: Sessions) => ({
            users: db
              ? ({
                  accounts: new PrismaUserAccounts(db),
                  authorizer: new Authorizer(sessions, new PrismaUserDirectory(db)),
                  hasher: new ScryptPasswordHasher(),
                  sessions,
                } satisfies UsersOperationParts)
              : null,
          }),
        },
        {
          provide: RolesOperation,
          inject: [DatabaseClient, Sessions],
          useFactory: ({ client: db }: Database, sessions: Sessions) => ({
            roles: db
              ? ({
                  roles: new PrismaRoleCatalog(db),
                  authorizer: new Authorizer(sessions, new PrismaUserDirectory(db)),
                  sessions,
                } satisfies RolesOperationParts)
              : null,
          }),
        },
        {
          provide: StockOperation,
          inject: [DatabaseClient, Sessions],
          useFactory: ({ client: db }: Database, sessions: Sessions) => ({
            stock: db
              ? ({
                  ledger: new PrismaStockLedger(db),
                  catalog: new PrismaProductCatalog(db),
                  shops: new PrismaShopDirectory(db),
                  accounts: new PrismaUserAccounts(db),
                  authorizer: new Authorizer(sessions, new PrismaUserDirectory(db)),
                  server,
                } satisfies StockOperationParts)
              : null,
          }),
        },
        {
          provide: SalesOperation,
          inject: [DatabaseClient, Sessions],
          useFactory: ({ client: db }: Database, sessions: Sessions) => ({
            sales: db
              ? ({
                  journal: new PrismaSalesJournal(db),
                  catalog: new PrismaProductCatalog(db),
                  shops: new PrismaShopDirectory(db),
                  accounts: new PrismaUserAccounts(db),
                  registers: new PrismaRegisterBook(db),
                  shifts: new PrismaShiftBook(db),
                  authorizer: new Authorizer(sessions, new PrismaUserDirectory(db)),
                  server,
                } satisfies SalesOperationParts)
              : null,
          }),
        },
        {
          provide: RegistersOperation,
          inject: [DatabaseClient, Sessions],
          useFactory: ({ client: db }: Database, sessions: Sessions) => ({
            registers: db
              ? ({
                  registers: new PrismaRegisterBook(db),
                  shops: new PrismaShopDirectory(db),
                  authorizer: new Authorizer(sessions, new PrismaUserDirectory(db)),
                  sessions,
                  server,
                } satisfies RegistersOperationParts)
              : null,
          }),
        },
        {
          provide: ShiftsOperation,
          inject: [DatabaseClient, Sessions],
          useFactory: ({ client: db }: Database, sessions: Sessions) => ({
            shifts: db
              ? ({
                  shifts: new PrismaShiftBook(db),
                  shops: new PrismaShopDirectory(db),
                  accounts: new PrismaUserAccounts(db),
                  authorizer: new Authorizer(sessions, new PrismaUserDirectory(db)),
                  server,
                } satisfies ShiftsOperationParts)
              : null,
          }),
        },
      ],
    };
  }
}
