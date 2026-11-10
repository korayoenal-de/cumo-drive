/**
 * Baut driver-entry.ts mit esbuild zu einem CommonJS Bundle (Aliase wie in der Vorlage stress/build.cjs):
 * @/ zeigt auf app/src, supabase auf den Fake Client, react-native und expo Pakete auf leere Stubs.
 */
import { build } from 'esbuild';
import { existsSync, readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HERE = __dirname;
const APP = path.resolve(HERE, '../..');

function res(p: string): string {
  for (const e of ['', '.ts', '.tsx', '.json', '/index.ts', '/index.tsx']) if (existsSync(p + e) && statSync(p + e).isFile()) return p + e;
  throw new Error(`nicht gefunden ${p}`);
}

export async function buildDriverBundle(): Promise<string> {
  const outfile = path.join(os.tmpdir(), `cumo-sim-driver-${process.pid}.cjs`);
  await build({
    entryPoints: [path.join(HERE, 'driver-entry.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile,
    loader: { '.json': 'json', '.png': 'empty', '.jpg': 'empty', '.ttf': 'empty' },
    logLevel: 'error',
    nodePaths: [path.join(APP, 'node_modules')],
    define: { 'process.env.EXPO_PUBLIC_ROUTING_URL': 'undefined', __DEV__: 'false' },
    plugins: [
      {
        name: 'sim-alias',
        setup(b) {
          b.onResolve({ filter: /^@\// }, (a) => ({ path: res(path.join(APP, 'src', a.path.slice(2))) }));
          b.onResolve({ filter: /(^|\/)supabase$/ }, (a) => (a.importer.includes(`${path.sep}src${path.sep}`) ? { path: path.join(HERE, 'stubs/supabase.ts') } : undefined));
          b.onResolve({ filter: /^react$/ }, () => ({ path: path.join(HERE, 'stubs/react.ts') }));
          b.onResolve({ filter: /^@react-native-async-storage\/async-storage$/ }, () => ({ path: path.join(HERE, 'stubs/async-storage.ts') }));
          b.onResolve({ filter: /^expo-location$/ }, () => ({ path: path.join(HERE, 'stubs/expo-location.ts') }));
          b.onResolve({ filter: /^(react-native.*|expo.*|@expo\/.*|@react-native.*|@react-navigation\/.*|react-dom.*|@supabase\/supabase-js)$/ }, () => ({ path: path.join(HERE, 'stubs/empty.cjs') }));
        },
      },
    ],
  });
  return readFileSync(outfile, 'utf8');
}
