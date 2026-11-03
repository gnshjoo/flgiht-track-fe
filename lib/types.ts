export interface Airport {
  name: string;
  iata: string;
  lat: number | null;
  lng: number | null;
}

export interface AircraftState {
  icao24: string;
  callsign: string;
  originCountry: string;
  longitude: number;
  latitude: number;
  altitude: number | null;
  velocity: number | null;
  heading: number | null;
  verticalRate: number | null;
}

export interface AircraftResponse {
  time: number;
  aircraft: AircraftState[];
}

export interface TrackWaypoint {
  time: number;
  latitude: number;
  longitude: number;
  altitude: number | null;
  heading: number | null;
  onGround: boolean;
}

export interface TrackResponse {
  icao24: string;
  callsign: string;
  path: TrackWaypoint[];
  estDepartureAirport: string | null;
  estArrivalAirport: string | null;
}

export interface AircraftInfo {
  icao24: string;
  registration: string | null;
  manufacturerName: string | null;
  model: string | null;
  operator: string | null;
  owner: string | null;
  built: string | null;
  categoryDescription: string | null;
}

export type Bounds = {
  lamin: number;
  lomin: number;
  lamax: number;
  lomax: number;
};

export interface Route {
  icao24: string;
  status: "loading" | "ready" | "failed";
  path: TrackWaypoint[];
  departure: string | null;
  arrival: string | null;
  arrivalCoords: { lat: number; lng: number } | null;
}

export type Feed =
  | { status: "waking"; startedAt: number }
  | { status: "down"; message: string }
  | {
      status: "live";
      aircraft: AircraftState[];
      updatedAt: Date;
      refreshing: boolean;
      staleError: string | null;
    };
