import { createHash } from "node:crypto";

// Sample flight inventory provider. Deterministic, clearly labeled sandbox data.
// Swap in a real provider (for example Duffel) by implementing the same FlightProvider interface.

export interface FlightOffer {
  id: string;
  carrier: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departIso: string;
  arriveIso: string;
  durationMin: number;
  stops: number;
  priceUsd: number;
  refundable: boolean;
  cabin: "economy";
  aisleAvailable: boolean;
  source: "sample";
}

export interface FlightProvider {
  name: string;
  search(origin: string, destination: string, dateIso: string): Promise<FlightOffer[]>;
}

const CARRIERS = ["Bluebonnet Air", "Pacific Arc", "Lone Star Connect", "Northline"];
const cache = new Map<string, { offer: FlightOffer; expires: number }>();

export const sampleProvider: FlightProvider = {
  name: "sample-inventory",
  async search(origin, destination, dateIso) {
    const o = origin.toUpperCase().slice(0, 3);
    const d = destination.toUpperCase().slice(0, 3);
    const day = new Date(dateIso + (dateIso.length <= 10 ? "T00:00:00" : ""));
    if (isNaN(day.getTime())) throw new Error("Invalid date. Use YYYY-MM-DD.");
    const seed = createHash("sha256").update(o + d + day.toDateString()).digest();
    const offers: FlightOffer[] = [];
    const departHours = [6, 9, 13, 17, 20];
    for (let i = 0; i < 5; i++) {
      const b = seed[i];
      const dep = new Date(day); dep.setHours(departHours[i], (b % 4) * 15, 0, 0);
      const duration = 150 + (seed[i + 5] % 90) + (b % 3 === 0 ? 75 : 0);
      const arr = new Date(dep.getTime() + duration * 60000);
      const carrier = CARRIERS[b % CARRIERS.length];
      const refundable = seed[i + 10] % 3 === 0;
      const price = Math.round((180 + (seed[i + 15] % 260) + (refundable ? 120 : 0)) * 100) / 100;
      const id = "off_" + createHash("sha1").update(o + d + dep.toISOString() + carrier).digest("hex").slice(0, 10);
      const offer: FlightOffer = {
        id, carrier, flightNumber: carrier.split(" ").map((w) => w[0]).join("") + (100 + (b % 800)), origin: o, destination: d,
        departIso: dep.toISOString(), arriveIso: arr.toISOString(), durationMin: duration, stops: b % 3 === 0 ? 1 : 0,
        priceUsd: price, refundable, cabin: "economy", aisleAvailable: seed[i + 20] % 4 !== 0, source: "sample",
      };
      offers.push(offer);
      cache.set(id, { offer, expires: Date.now() + 30 * 60000 });
    }
    return offers.sort((a, b) => a.priceUsd - b.priceUsd);
  },
};

export function getOffer(id: string): FlightOffer | undefined {
  const c = cache.get(id);
  if (!c || c.expires < Date.now()) return undefined;
  return c.offer;
}
