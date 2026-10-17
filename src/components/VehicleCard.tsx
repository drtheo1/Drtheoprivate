import type { DecodedVehicle } from "../lib/api";
import type { VinCheck } from "../lib/vin";

export function VehicleCard({ vehicle, check }: { vehicle: DecodedVehicle; check: VinCheck }) {
  const rows: [string, string][] = [
    ["Manufacturer", vehicle.manufacturer],
    ["Trim / series", [vehicle.trim, vehicle.series].filter(Boolean).join(" ")],
    ["Body", vehicle.bodyClass],
    ["Vehicle type", vehicle.vehicleType],
    ["Engine", vehicle.engineCc ? `${vehicle.engineCc} cc${vehicle.cylinders ? `, ${vehicle.cylinders} cyl` : ""}` : ""],
    ["Fuel", [vehicle.fuelPrimary, vehicle.electrification].filter(Boolean).join(", ")],
    ["Drive", vehicle.drive],
    ["Transmission", vehicle.transmission],
    ["Seats / doors", [vehicle.seats, vehicle.doors].filter(Boolean).join(" / ")],
    ["GVWR", vehicle.gvwr],
    ["Assembled in", vehicle.plant],
    ["VIN origin", check.region],
  ];
  return (
    <section className="card">
      <h2>
        {vehicle.year} {vehicle.make} {vehicle.model}
      </h2>
      <p className="muted mono">{check.vin}</p>
      {!check.checkDigitOk && (
        <p className="notice warn">
          The check digit (position 9) does not match. North American VINs must pass this check, so the VIN may be mistyped
          or altered.
        </p>
      )}
      {vehicle.errorText && <p className="notice">Decoder note: {vehicle.errorText}</p>}
      <dl className="specs">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
      </dl>
    </section>
  );
}
