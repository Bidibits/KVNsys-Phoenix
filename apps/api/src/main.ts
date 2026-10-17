import './env.js';
import { Logger } from '@nestjs/common';
import { createPhoenixApp } from './create-app.js';

const port = Number(process.env.PORT ?? 3000);
const app = await createPhoenixApp();

// 0.0.0.0, not localhost: the registers are other devices on the shop's network.
await app.listen(port, '0.0.0.0');
new Logger('Phoenix').log(`API listening on port ${port}`);
