/** German texts, keyed by the English wording (see ../index.svelte.ts). Informal "du". */
import { screens } from './screens';
import { study } from './study';
import { setup } from './setup';
import { common } from './common';

export const de: Record<string, string> = { ...common, ...setup, ...screens, ...study };
