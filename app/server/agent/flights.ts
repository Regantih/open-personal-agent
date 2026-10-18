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
  source: "sample" | "duffel";
  raw?: any; // provider payload retained for booking
}

export interface FlightProvider {
  name: string;
  search(origin: string, destination: string, dateIso: string): Promise<FlightOffer[]>;
  // Real providers implement order(); its absence means simulated booking.
  order?(offer: FlightOffer, passenger: PassengerInfo): Promise<{ reference: string; status: string }>;
}

export interface PassengerInfo { givenName: string; familyName: string; bornOn: string; email?: string }

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

// ---------- Duffel (live flight inventory + orders) ----------
// DUFFEL_API_KEY activates this provider. Duffel test tokens (duffel_test_*)
// run the same code path against sandbox inventory.
const DUFFEL = "https://api.duffel.com";
async function duffelFetch(path: string, init: RequestInit = {}): Promise<any> {
  const resp = await fetch(DUFFEL + path, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.DUFFEL_API_KEY}`, "Duffel-Version": "v2", "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const data: any = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const e = data?.errors?.[0];
    throw new Error(`Duffel ${resp.status}: ${e?.message ?? e?.title ?? "request failed"}`);
  }
  return data;
}

export const duffelProvider: FlightProvider = {
  name: "duffel",
  async search(origin, destination, dateIso) {
    const data = await duffelFetch("/air/offer_requests", {
      method: "POST",
      body: JSON.stringify({ data: { slices: [{ origin: origin.toUpperCase(), destination: destination.toUpperCase(), departure_date: dateIso }], passengers: [{ type: "adult" }], cabin_class: "economy" } }),
    });
    const offers: FlightOffer[] = (data.data?.offers ?? []).map((o: any) => {
      const seg = o.slices?.[0]?.segments?.[0] ?? {};
      const dep = seg.departing_at ?? "";
      const arr = seg.arriving_at ?? "";
      const refundable = !!o.conditions?.refund_before_departure?.allowed;
      const offer: FlightOffer = {
        id: `duffel_${o.id}`, carrier: seg.marketing_carrier?.name ?? o.owner?.name ?? "Unknown",
        flightNumber: `${seg.marketing_carrier_flight_number ?? ""}`, origin: seg.origin?.iata_code ?? origin.toUpperCase(),
        destination: seg.destination?.iata_code ?? destination.toUpperCase(), departIso: dep, arriveIso: arr,
        durationMin: seg.duration ? parseDur(seg.duration) : Math.round((Date.parse(arr) - Date.parse(dep)) / 60000),
        stops: (o.slices?.[0]?.segments?.length ?? 1) - 1, priceUsd: Number(o.total_amount ?? 0),
        refundable, cabin: "economy", aisleAvailable: true, source: "duffel", raw: { offerId: o.id, passengerId: o.passengers?.[0]?.id },
      };
      cache.set(offer.id, { offer, expires: Date.parse(o.expires_at ?? "") || Date.now() + 30 * 60000 });
      return offer;
    });
    return offers.sort((a, b) => a.priceUsd - b.priceUsd).slice(0, 10);
  },
  async order(offer, passenger) {
    const data = await duffelFetch("/air/orders", {
      method: "POST",
      body: JSON.stringify({
        data: {
          selected_offers: [offer.raw.offerId],
          passengers: [{ id: offer.raw.passengerId, given_name: passenger.givenName, family_name: passenger.familyName, born_on: passenger.bornOn, email: passenger.email }],
          payments: [{ type: "balance", amount: offer.priceUsd.toFixed(2), currency: "USD" }],
        },
      }),
    });
    return { reference: data.data?.booking_reference ?? data.data?.id ?? "?", status: "confirmed" };
  },
};

function parseDur(d: string): number {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?/.exec(d);
  return m ? Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0) : 0;
}

// The active provider: real inventory when DUFFEL_API_KEY is present.
export function flightProvider(): FlightProvider {
  return process.env.DUFFEL_API_KEY ? duffelProvider : sampleProvider;
}
export function flightsLive(): boolean { return !!process.env.DUFFEL_API_KEY; }
