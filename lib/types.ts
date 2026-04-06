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
