/**
 * Virtuelle Fahrer: je Fahrer ein Konto in der lokalen Test DB, ein eigener Fake Supabase Client und
 * ein eigenes Bundle der App Module. Dazu Fahren entlang einer echten Tourlinie im Zeitraffer.
 */
import { clock, real } from './clock';
import { asAdmin, dbBusy, lit } from './db';
import type * as Entry from './driver-entry';
import { SimClient, SimServer } from './fake-supabase';

export type App = typeof Entry;
export type LatLon = [number, number];

let bundleCode = '';
export function setBundle(code: string) {
  bundleCode = code;
}

function loadApp(client: SimClient): App {
  const mod: { exports: Record<string, unknown> } = { exports: {} };
  // frischer Modulkontext je Fahrer: der Modulzustand (ride.ts, profile.ts ...) ist getrennt
  new Function('module', 'exports', 'require', '__simClient', bundleCode)(mod, mod.exports, require, client);
  return mod.exports as unknown as App;
}

let seq = 0;
const uuid = () => {
  seq++;
  const h = seq.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${h}`;
};

export class Driver {
  readonly app: App;
  readonly client: SimClient;
  /** Strecke entlang der Linie in m */
  dist = 0;
  /** fährt gerade (sendet Positionen) */
  driving = false;
  off = false;
  lastSent: LatLon | null = null;
  private profileHook: { unmount(): void } | null = null;

  constructor(
    readonly world: World,
    readonly name: string,
    readonly car: string | null,
    readonly id: string | null,
  ) {
    this.client = new SimClient(world.server, id, id ? `${name.toLowerCase().replace(/\W+/g, '.')}@sim.invalid` : null);
    this.app = loadApp(this.client);
  }

  /** Profil laden wie nach dem Anmelden (useMyProfile), damit Name und Auto stimmen. */
  async signIn() {
    if (!this.id) return;
    const id = this.id;
    this.profileHook = this.app.renderHook(() => this.app.profile.useMyProfile(id));
    await this.world.waitFor(() => this.app.profile.myProfile() != null, `Profil ${this.name}`);
  }

  get ride() {
    return this.app.ride.rideState();
  }

  member(of: Driver) {
    return this.ride.members.find((m) => m.id === (of.id ?? of.ride.me?.id));
  }

  dispose() {
    this.profileHook?.unmount();
  }
}

export class World {
  readonly server = new SimServer();
  readonly drivers: Driver[] = [];
  line: LatLon[] = [];
  cum: number[] = [];

  async init() {
    await this.server.init();
  }

  setLine(line: LatLon[]) {
    this.line = line;
    this.cum = [0];
    for (let i = 1; i < line.length; i++) this.cum.push(this.cum[i - 1] + haversine(line[i - 1], line[i]));
  }

  get lineLength() {
    return this.cum[this.cum.length - 1] ?? 0;
  }

  /** Punkt und Richtung bei d Metern entlang der Linie */
  at(d: number): { p: LatLon; heading: number } {
    const x = Math.max(0, Math.min(d, this.lineLength));
    let i = 1;
    while (i < this.cum.length - 1 && this.cum[i] < x) i++;
    const a = this.line[i - 1];
    const b = this.line[i];
    const seg = this.cum[i] - this.cum[i - 1] || 1;
    const f = (x - this.cum[i - 1]) / seg;
    const p: LatLon = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    const heading = (Math.atan2((b[1] - a[1]) * Math.cos((a[0] * Math.PI) / 180), b[0] - a[0]) * 180) / Math.PI;
    return { p, heading: (heading + 360) % 360 };
  }

  /** Konto anlegen wie bei der Registrierung (nur lokal: auth.users und profiles). */
  async addDriver(name: string, car: string | null, opts: { account?: boolean; allowMessages?: boolean } = {}): Promise<Driver> {
    let id: string | null = null;
    if (opts.account !== false) {
      id = uuid();
      const r = await asAdmin(
        `insert into auth.users (id, email) values (${lit(id)}, ${lit(`${name.toLowerCase().replace(/\W+/g, '.')}@sim.invalid`)});
insert into public.profiles (id, display_name, car, allow_messages) values (${lit(id)}, ${lit(name)}, ${lit(car)}, ${opts.allowMessages === false ? 'false' : 'true'});`,
      );
      if (r.error) throw new Error(`Konto ${name}: ${r.error.message}`);
    }
    const d = new Driver(this, name, car, id);
    this.drivers.push(d);
    await d.signIn();
    return d;
  }

  /** Warten, bis Bus, Datenbank und Mikrotasks ruhig sind (echte Zeit, kurz). */
  async settle(maxMs = 5000) {
    const until = real.now() + maxMs;
    let quiet = 0;
    while (real.now() < until) {
      await new Promise((r) => real.setTimeout(r, 2));
      clock.advance(0);
      if (!this.server.busy && !dbBusy()) quiet++;
      else quiet = 0;
      if (quiet >= 4) return;
    }
  }

  async waitFor(cond: () => boolean, what: string, maxMs = 5000) {
    const until = real.now() + maxMs;
    while (real.now() < until) {
      if (cond()) return;
      await new Promise((r) => real.setTimeout(r, 3));
      clock.advance(0);
    }
    if (!cond()) throw new Error(`Zeitüberschreitung: ${what}`);
  }

  /**
   * Zeitraffer: dt ms Simulationszeit vergehen, jeder fahrende Fahrer bewegt sich mit speed km/h und
   * sendet seine Position über sendPosition aus ride.ts (wie die Navigation).
   */
  async drive(steps: number, dtMs = 3000, speedKmh = 60) {
    for (let s = 0; s < steps; s++) {
      clock.advance(dtMs);
      this.server.tick();
      for (const d of this.drivers) {
        if (!d.driving) continue;
        d.dist += (speedKmh / 3.6) * (dtMs / 1000);
        const { p, heading } = this.at(d.dist);
        // abseits: 300 m seitlich versetzt
        const q: LatLon = d.off ? [p[0] + 0.0027, p[1]] : p;
        if (d.client.online) d.lastSent = q;
        d.app.ride.sendPosition(q, heading, speedKmh, d.off);
      }
      await this.settle();
    }
  }
}

export function haversine(a: LatLon, b: LatLon) {
  const R = 6371000;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
