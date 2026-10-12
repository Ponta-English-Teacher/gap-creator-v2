/**
 * Draws the map from structured data. Student A, Student B and the answer key use the SAME
 * streets, buildings and features. Only two things differ by view: which place names are
 * shown, and which road works are shown (each closure is drawn on one student's map only).
 */
import type { ReactNode } from "react";
import type { MapData, MapFeatures, TownBuilding } from "@/lib/activitySchemas";
import { canSee, mapFeaturesOf, mapPlaceHolders } from "@/lib/gapLogic";
import { ENVIRONMENTS, mapGeometry } from "@/lib/mapEnvironments";
import type { MapGeometry } from "@/lib/mapEnvironments";
import { isBlock, parseBlock, townBuildings } from "@/lib/townMap";
import type { Holder } from "@/lib/types";

const FILL: Record<Holder, string> = { A: "#dbe8ff", B: "#ffe3c7", both: "#d6f0dc" };
const STROKE: Record<Holder, string> = { A: "#2c5cc5", B: "#c25e00", both: "#2d7a45" };
const WATER = "#9fd0ef";
const PARK = "#b9e2a6";
const ROAD = "#ffffff";

/** Gap between a building and its neighbours or the edge of its block. */
const GAP = 10;
const DOOR = "#39424e";

/** A building's rectangle on the map, from its footprint inside the block. */
function buildingRect(b: TownBuilding, g: MapGeometry) {
  const { row, col } = parseBlock(b.block);
  const block = g.block(row, col);
  const inner = { x: block.x + GAP / 2, y: block.y + GAP / 2, w: block.w - GAP, h: block.h - GAP };
  return { x: inner.x + b.x * inner.w + GAP / 2, y: inner.y + b.y * inner.h + GAP / 2, w: b.w * inner.w - GAP, h: b.h * inner.h - GAP };
}

/** The entrance: a door on the wall that faces the entrance street, reaching out to the pavement. */
function doorRect(b: TownBuilding, r: { x: number; y: number; w: number; h: number }) {
  const long = 22;
  const deep = GAP + 2;
  switch (b.entrance.side) {
    case "north":
      return { x: r.x + r.w / 2 - long / 2, y: r.y - GAP, width: long, height: deep };
    case "south":
      return { x: r.x + r.w / 2 - long / 2, y: r.y + r.h - 2, width: long, height: deep };
    case "west":
      return { x: r.x - GAP, y: r.y + r.h / 2 - long / 2, width: deep, height: long };
    case "east":
      return { x: r.x + r.w - 2, y: r.y + r.h / 2 - long / 2, width: deep, height: long };
  }
}

/** River: south half of row 1. Railway: north half of row 3. */
function riverBand(g: MapGeometry) {
  const b = g.block(1, 1);
  return { y: b.y + b.h / 2 + 2, h: b.h / 2 - 2 };
}
function railBand(g: MapGeometry) {
  const b = g.block(3, 1);
  return { y: b.y, h: b.h / 2 - 2 };
}

/** Point along a street segment; t = 0..1 along the free part of the segment, offset = sideways. */
function segmentPoint(segment: string, t: number, f: MapFeatures, g: MapGeometry) {
  const [street, part] = segment.split("-");
  const k = Number(street.slice(1));
  const n = Number(part.slice(1));
  if (street.startsWith("H")) {
    const b = g.block(1, n);
    return { horizontal: true, x: b.x + b.w * t, y: g.hY(k) + g.streetH / 2 };
  }
  const b = g.block(n, 1);
  let y0 = b.y;
  let len = b.h;
  if (n === 1 && f.river) len = b.h / 2;
  if (n === 3 && f.railway) {
    y0 = b.y + b.h / 2;
    len = b.h / 2;
  }
  return { horizontal: false, x: g.vX(k) + g.streetV / 2, y: y0 + len * t };
}

/** Picks up to `count` label positions whose street segment has no features (falls back to the first choice). */
function labelSlots(order: number[], segmentOf: (n: number) => string, busy: Set<string>, count: number): number[] {
  const free = order.filter((n) => !busy.has(segmentOf(n))).slice(0, count);
  return free.length ? free : order.slice(0, 1);
}

/** Splits a name into lines that fit inside a building. */
function wrap(text: string, max = 15): string[] {
  const lines: string[] = [];
  for (const word of text.split(" ")) {
    const last = lines[lines.length - 1];
    if (last && (last + " " + word).length <= max) lines[lines.length - 1] = last + " " + word;
    else lines.push(word);
  }
  return lines.slice(0, 3);
}

function Label({ x, y, lines, className = "map-label" }: { x: number; y: number; lines: string[]; className?: string }) {
  return (
    <>
      {lines.map((line, i) => (
        <text key={i} x={x} y={y + (i - (lines.length - 1) / 2) * 21 + 7} className={className} textAnchor="middle">
          {line}
        </text>
      ))}
    </>
  );
}

/** Roadside stops are drawn as small text badges (clearer than emoji on phones). */
const BADGE = {
  "bus stop": { text: "BUS", fill: "#1f5fbf", color: "#fff", w: 44 },
  "taxi stand": { text: "TAXI", fill: "#f2c230", color: "#1c2430", w: 50 },
  "station entrance": { text: "STATION", fill: "#39424e", color: "#fff", w: 82 },
  "subway entrance": { text: "SUBWAY", fill: "#0a7d55", color: "#fff", w: 78 },
} as const;

function Badge({ kind, x, y, vertical }: { kind: keyof typeof BADGE; x: number; y: number; vertical: boolean }) {
  const b = BADGE[kind];
  return (
    <g transform={vertical ? `rotate(-90 ${x} ${y})` : undefined}>
      <rect x={x - b.w / 2} y={y - 12} width={b.w} height={24} rx={6} fill={b.fill} stroke="#fff" strokeWidth={2} />
      <text x={x} y={y + 6} textAnchor="middle" className="map-badge" fill={b.color}>
        {b.text}
      </text>
    </g>
  );
}

export default function ProgrammaticMap({ data, view }: { data: MapData; view: "A" | "B" | "key" }) {
  const f = mapFeaturesOf(data);
  const g = mapGeometry(data.environment);
  const look = (ENVIRONMENTS[data.environment ?? "town"] ?? ENVIRONMENTS.town).look;
  const { width, height } = g;
  const hStreetY = g.hY;
  const vStreetX = g.vX;
  const blockRect = g.block;
  const holders = mapPlaceHolders(data.places);
  const byBuilding = new Map(data.places.map((p, i) => [p.building ?? p.lot, { place: p, holder: holders[i] }]));
  const start = { x: vStreetX(2) + g.streetV / 2, y: hStreetY(3) + g.streetH / 2 };
  const river = riverBand(g);
  const rail = railBand(g);
  // Road works: each one is drawn only for the student who is meant to know about it.
  const closures = (data.closures ?? []).filter((c) => view === "key" || c.knownBy === view);
  const legend = new Set<string>(["entrance"]);
  const busy = new Set([...f.pedestrianCrossings.map((c) => c.segment), ...f.roadsideStops.map((st) => st.segment)]);

  const crossingMarks: ReactNode[] = f.pedestrianCrossings.map((c, i) => {
    const p = segmentPoint(c.segment, 0.7, f, g);
    legend.add(c.kind);
    // Local frame: "along" = direction of traffic, "across" = the way pedestrians cross.
    const across = p.horizontal ? g.streetH : g.streetV;
    const stripes = Math.max(3, Math.floor((across - 6) / 10.5));
    const rot = p.horizontal ? 0 : 90;
    let body: ReactNode;
    if (c.kind === "zebra crossing") {
      body = Array.from({ length: stripes }, (_, s) => <rect key={s} x={-14} y={-across / 2 + 4 + s * 10.5} width={28} height={6} fill="#39424e" />);
    } else if (c.kind === "pedestrian overpass") {
      body = <rect x={-8} y={-across / 2 + 1} width={16} height={across - 2} rx={3} fill="#c9a36a" stroke="#6b4f22" strokeWidth={2} />;
    } else {
      body = (
        <>
          <line x1={0} y1={-across / 2 + 10} x2={0} y2={across / 2 - 10} stroke="#6b4f22" strokeWidth={3} strokeDasharray="6 5" />
          <rect x={-8} y={-across / 2 + 1} width={16} height={9} fill="#6b4f22" />
          <rect x={-8} y={across / 2 - 10} width={16} height={9} fill="#6b4f22" />
        </>
      );
    }
    return (
      <g key={`c${i}`} transform={`translate(${p.x} ${p.y}) rotate(${rot})`}>
        {body}
      </g>
    );
  });

  const stops: ReactNode[] = f.roadsideStops.map((st, i) => {
    const horizontal = st.segment.startsWith("H");
    const p = segmentPoint(st.segment, 0.3, f, g);
    legend.add(st.kind);
    // Badges sit on the pavement edge of the named side, clear of the centred street name.
    const off = (horizontal ? g.streetH : g.streetV) / 2 - 13;
    const x = p.x + (st.side === "east" ? off : st.side === "west" ? -off : 0);
    const y = p.y + (st.side === "south" ? off : st.side === "north" ? -off : 0);
    return <Badge key={`s${i}`} kind={st.kind} x={x} y={y} vertical={!horizontal} />;
  });

  const intersections: ReactNode[] = [
    ...f.roundabouts.map((id) => {
      const [h, v] = id.split("-");
      legend.add("roundabout");
      const cx = vStreetX(Number(v.slice(1))) + g.streetV / 2;
      const cy = hStreetY(Number(h.slice(1))) + g.streetH / 2;
      return <circle key={`r${id}`} cx={cx} cy={cy} r={17} fill={PARK} stroke="#8a939e" strokeWidth={5} />;
    }),
    ...f.trafficLights.map((id) => {
      const [h, v] = id.split("-");
      legend.add("traffic lights");
      const cx = vStreetX(Number(v.slice(1))) + g.streetV / 2;
      const cy = hStreetY(Number(h.slice(1))) + g.streetH / 2;
      return (
        <text key={`t${id}`} x={cx} y={cy + 10} fontSize={28} textAnchor="middle">
          🚦
        </text>
      );
    }),
  ];

  if (f.river) legend.add("river").add("bridge");
  if (f.railway) {
    legend.add("railway");
    f.railwayCrossings.forEach((c) => legend.add(c.kind));
  }
  if (f.parks.length) legend.add("park");
  if (closures.length) legend.add("road closed");

  const closureMarks: ReactNode[] = closures.map((c, i) => {
    const p = segmentPoint(c.segment, 0.5, f, g);
    const across = (p.horizontal ? g.streetH : g.streetV) - 4;
    // A striped barrier right across the street, with the sign beside it.
    return (
      <g key={`x${i}`} transform={`translate(${p.x} ${p.y}) rotate(${p.horizontal ? 0 : 90})`}>
        <rect x={-34} y={-across / 2} width={68} height={across} fill="#f6c343" opacity={0.55} />
        {[-24, 24].map((x) => (
          <g key={x} transform={`translate(${x} 0)`}>
            <rect x={-5} y={-across / 2} width={10} height={across} fill="#fff" stroke="#b3261e" strokeWidth={2} />
            {Array.from({ length: Math.floor(across / 12) }, (_, s) => (
              <rect key={s} x={-5} y={-across / 2 + 3 + s * 12} width={10} height={6} fill="#b3261e" />
            ))}
          </g>
        ))}
        <g transform={`rotate(${p.horizontal ? 0 : -90})`}>
          <rect x={-17} y={-11} width={34} height={22} rx={4} fill="#b3261e" stroke="#fff" strokeWidth={2} />
          <text x={0} y={5} textAnchor="middle" className="map-closed">
            ✕
          </text>
        </g>
      </g>
    );
  });
  data.places.forEach((p, i) => {
    if (p.kind !== "building" && (view === "key" || canSee(holders[i], view))) legend.add(p.kind);
  });

  return (
    <div>
      <div className="map-wrap">
        <svg viewBox={`0 0 ${width} ${height}`} className="map" role="img" aria-label="Map">
          <rect width={width} height={height} fill={look.ground} />

          {/* River and railway run across the whole map, under the streets. */}
          {f.river && <rect x={0} y={river.y} width={width} height={river.h} fill={WATER} />}
          {f.railway && (
            <g>
              <rect x={0} y={rail.y} width={width} height={rail.h} fill="#d5d0c8" />
              {Array.from({ length: Math.ceil(width / 18) }, (_, i) => (
                <line key={i} x1={i * 18 + 4} y1={rail.y + rail.h / 2 - 14} x2={i * 18 + 4} y2={rail.y + rail.h / 2 + 14} stroke="#8b7d6b" strokeWidth={4} />
              ))}
              <line x1={0} y1={rail.y + rail.h / 2 - 8} x2={width} y2={rail.y + rail.h / 2 - 8} stroke="#4a4f57" strokeWidth={3} />
              <line x1={0} y1={rail.y + rail.h / 2 + 8} x2={width} y2={rail.y + rail.h / 2 + 8} stroke="#4a4f57" strokeWidth={3} />
            </g>
          )}

          {/* Streets */}
          {[0, 1, 2, 3].map((k) => (
            <rect key={`h${k}`} x={0} y={hStreetY(k)} width={width} height={g.streetH} fill={ROAD} />
          ))}
          {[1, 2, 3].map((k) => (
            <rect key={`v${k}`} x={vStreetX(k)} y={0} width={g.streetV} height={height} fill={ROAD} />
          ))}
          {/* Wide city avenues get a centre line. */}
          {look.centreLine &&
            [1, 2, 3].map((k) => (
              <line key={`cl${k}`} x1={vStreetX(k) + g.streetV / 2} y1={0} x2={vStreetX(k) + g.streetV / 2} y2={height} stroke="#c9ced6" strokeWidth={3} strokeDasharray="14 12" />
            ))}

          {/* Bridges over the river (every avenue). */}
          {f.river &&
            [1, 2, 3].map((k) => (
              <g key={`br${k}`}>
                <line x1={vStreetX(k) - 3} y1={river.y - 4} x2={vStreetX(k) - 3} y2={river.y + river.h + 4} stroke="#6b4f22" strokeWidth={5} />
                <line x1={vStreetX(k) + g.streetV + 3} y1={river.y - 4} x2={vStreetX(k) + g.streetV + 3} y2={river.y + river.h + 4} stroke="#6b4f22" strokeWidth={5} />
              </g>
            ))}

          {/* Where avenues meet the railway: level crossing (rails over the road) or tunnel (railway bridge over the road). */}
          {f.railway &&
            f.railwayCrossings.map((c) => {
              const x = vStreetX(Number(c.street.slice(1)));
              const mid = rail.y + rail.h / 2;
              if (c.kind === "tunnel") {
                return (
                  <g key={c.street}>
                    <rect x={x - 6} y={mid - 20} width={g.streetV + 12} height={40} fill="#6d737b" />
                    <line x1={x - 6} y1={mid - 8} x2={x + g.streetV + 6} y2={mid - 8} stroke="#e7e2d8" strokeWidth={3} />
                    <line x1={x - 6} y1={mid + 8} x2={x + g.streetV + 6} y2={mid + 8} stroke="#e7e2d8" strokeWidth={3} />
                  </g>
                );
              }
              return (
                <g key={c.street}>
                  <line x1={x} y1={mid - 8} x2={x + g.streetV} y2={mid - 8} stroke="#4a4f57" strokeWidth={3} />
                  <line x1={x} y1={mid + 8} x2={x + g.streetV} y2={mid + 8} stroke="#4a4f57" strokeWidth={3} />
                  {[-22, 22].map((dy) => (
                    <rect key={dy} x={x + 4} y={mid + dy - 3} width={g.streetV - 8} height={6} fill="#d62828" stroke="#fff" strokeDasharray="8 8" />
                  ))}
                </g>
              );
            })}

          {/* Street names, placed on segments without features so nothing overlaps. */}
          {data.horizontalStreets.map((name, k) =>
            labelSlots([1, 4, 2, 3], (c) => `H${k}-c${c}`, busy, 2).map((col) => {
              const b = blockRect(1, col);
              return (
                <text key={`hn${k}${col}`} x={b.x + b.w / 2} y={hStreetY(k) + g.streetH / 2 + 7} className="map-street" textAnchor="middle">
                  {name}
                </text>
              );
            }),
          )}
          {data.verticalStreets.map((name, i) => {
            const row = labelSlots([2, 1, 3], (r) => `V${i + 1}-r${r}`, busy, 1)[0];
            const x = vStreetX(i + 1) + g.streetV / 2 + 7;
            const y = segmentPoint(`V${i + 1}-r${row}`, 0.5, f, g).y;
            return (
              <text key={`vn${i}`} x={x} y={y} className="map-street" textAnchor="middle" transform={`rotate(-90 ${x} ${y})`}>
                {name}
              </text>
            );
          })}
          {f.river && (
            <text x={blockRect(1, 2).x + blockRect(1, 2).w / 2} y={river.y + river.h / 2 + 7} className="map-water" textAnchor="middle">
              {f.riverName}
            </text>
          )}

          {/* Parks fill a whole block. */}
          {f.parks.filter((p) => isBlock(p.block)).map((p) => {
            const { row, col } = parseBlock(p.block);
            const b = blockRect(row, col);
            return (
              <g key={p.block}>
                <rect x={b.x + 6} y={b.y + 6} width={b.w - 12} height={b.h - 12} rx={14} fill={PARK} stroke="#5f9a4a" strokeWidth={2} />
                {[
                  [0.2, 0.25],
                  [0.8, 0.3],
                  [0.25, 0.8],
                  [0.78, 0.78],
                ].map(([tx, ty], i) => (
                  <circle key={i} cx={b.x + b.w * tx} cy={b.y + b.h * ty} r={11} fill="#6fae57" />
                ))}
                <Label x={b.x + b.w / 2} y={b.y + b.h / 2} lines={wrap(p.name)} />
              </g>
            );
          })}

          {/* Buildings: all drawn the same way for everyone, each with its entrance; only the names differ by view. */}
          {townBuildings(data).map((b) => {
            const r = buildingRect(b, g);
            const door = doorRect(b, r);
            const large = b.position === "whole";
            // A shop front: an awning along the wall with the door. The same for everyone, named or not.
            const horizontalDoor = b.entrance.side === "north" || b.entrance.side === "south";
            const awning = horizontalDoor
              ? { x: r.x + 3, y: b.entrance.side === "north" ? r.y + 3 : r.y + r.h - 10, width: r.w - 6, height: 7 }
              : { x: b.entrance.side === "west" ? r.x + 3 : r.x + r.w - 10, y: r.y + 3, width: 7, height: r.h - 6 };
            const entry = byBuilding.get(b.id);
            const visible = entry && (view === "key" || canSee(entry.holder, view));
            const holder = entry?.holder ?? "both";
            const parking = visible && entry.place.kind === "parking lot";
            const narrow = b.w < 1;
            const fill = !visible ? look.unnamed : view === "key" ? FILL[holder] : parking ? "#e9edf2" : "#ffffff";
            const stroke = !visible ? "#9aa3ad" : view === "key" ? STROKE[holder] : "#39424e";
            return (
              <g key={b.id}>
                <rect
                  x={r.x}
                  y={r.y}
                  width={r.w}
                  height={r.h}
                  rx={6}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={visible ? 2.5 : 1.5}
                  strokeDasharray={parking ? "8 5" : undefined}
                />
                {narrow && <rect {...awning} rx={2} fill="#b9c3cf" />}
                {/* A large building: a second outline inside, like a tower seen from above. */}
                {large && <rect x={r.x + 9} y={r.y + 9} width={r.w - 18} height={r.h - 18} rx={3} fill="none" stroke={stroke} strokeWidth={1.5} opacity={0.55} />}
                <rect {...door} rx={2} fill={DOOR} />
                {parking && (
                  <text x={r.x + 20} y={r.y + r.h / 2 + 12} className="map-parking" textAnchor="middle">
                    P
                  </text>
                )}
                {visible && (
                  <Label
                    x={r.x + r.w / 2 + (parking ? 12 : 0)}
                    y={r.y + r.h / 2 + (view === "key" && narrow ? 8 : 0)}
                    lines={wrap(entry.place.name, parking ? 12 : narrow ? 9 : 15)}
                    className={!narrow ? "map-label" : entry.place.name.split(" ").some((w) => w.length > 7) ? "map-label map-label-tiny" : "map-label map-label-small"}
                  />
                )}
                {view === "key" && entry && (
                  <text x={r.x + r.w - 8} y={r.y + 20} className="map-tag" textAnchor="end" fill={STROKE[holder]}>
                    {holder === "both" ? "A+B" : holder}
                  </text>
                )}
              </g>
            );
          })}

          {crossingMarks}
          {intersections}
          {stops}
          {closureMarks}

          {/* START */}
          <circle cx={start.x} cy={start.y} r={15} fill="#d62828" stroke="#fff" strokeWidth={3} />
          <text x={start.x + 24} y={start.y + 8} className="map-start">
            START
          </text>
          {/* North arrow */}
          <g transform={`translate(${width - 40}, 30)`}>
            <path d="M0 -18 L10 10 L0 4 L-10 10 Z" fill="#39424e" />
            <text y={30} textAnchor="middle" className="map-tag">
              N
            </text>
          </g>
        </svg>
      </div>
      {legend.size > 0 && <MapLegend items={[...legend]} />}
    </div>
  );
}

const LEGEND: Record<string, { icon: ReactNode; label: string }> = {
  entrance: { icon: <><rect x={1} y={2} width={20} height={12} rx={2} fill="#fff" stroke="#39424e" strokeWidth={1.5} /><rect x={7} y={12} width={8} height={6} fill={DOOR} /></>, label: "entrance (door)" },
  river: { icon: <rect width={22} height={14} y={3} fill={WATER} />, label: "river" },
  bridge: { icon: <><rect width={22} height={14} y={3} fill={WATER} /><rect x={6} width={10} height={20} fill={ROAD} stroke="#6b4f22" strokeWidth={2} /></>, label: "bridge" },
  railway: { icon: <><line x1={0} y1={7} x2={22} y2={7} stroke="#4a4f57" strokeWidth={2} /><line x1={0} y1={13} x2={22} y2={13} stroke="#4a4f57" strokeWidth={2} /></>, label: "railway" },
  "railway crossing": { icon: <rect x={1} y={7} width={20} height={6} fill="#d62828" stroke="#fff" strokeDasharray="5 5" />, label: "railway crossing" },
  tunnel: { icon: <rect x={1} y={3} width={20} height={14} fill="#6d737b" />, label: "tunnel (road under the railway)" },
  "traffic lights": { icon: <text x={11} y={17} fontSize={17} textAnchor="middle">🚦</text>, label: "traffic lights" },
  roundabout: { icon: <circle cx={11} cy={10} r={7} fill={PARK} stroke="#8a939e" strokeWidth={3} />, label: "roundabout" },
  "zebra crossing": { icon: <>{[2, 8, 14].map((y) => <rect key={y} x={2} y={y} width={18} height={4} fill="#39424e" />)}</>, label: "zebra crossing" },
  "pedestrian underpass": { icon: <line x1={2} y1={10} x2={20} y2={10} stroke="#6b4f22" strokeWidth={3} strokeDasharray="4 3" />, label: "pedestrian underpass" },
  "pedestrian overpass": { icon: <rect x={2} y={6} width={18} height={8} rx={2} fill="#c9a36a" stroke="#6b4f22" />, label: "pedestrian overpass" },
  "bus stop": { icon: <rect x={1} y={4} width={20} height={12} rx={3} fill="#1f5fbf" />, label: "BUS = bus stop" },
  "taxi stand": { icon: <rect x={1} y={4} width={20} height={12} rx={3} fill="#f2c230" />, label: "TAXI = taxi stand" },
  "station entrance": { icon: <rect x={1} y={4} width={20} height={12} rx={3} fill="#39424e" />, label: "STATION = station entrance" },
  "subway entrance": { icon: <rect x={1} y={4} width={20} height={12} rx={3} fill="#0a7d55" />, label: "SUBWAY = subway entrance" },
  "road closed": { icon: <><rect x={1} y={3} width={20} height={14} fill="#f6c343" opacity={0.6} /><rect x={5} y={4} width={12} height={12} rx={2} fill="#b3261e" /></>, label: "road closed (road works)" },
  park: { icon: <rect x={1} y={2} width={20} height={16} rx={4} fill={PARK} stroke="#5f9a4a" />, label: "park" },
  "parking lot": { icon: <text x={11} y={17} fontSize={17} fontWeight={800} textAnchor="middle" fill="#2c5cc5">P</text>, label: "parking lot" },
  "police box": { icon: <rect x={4} y={3} width={14} height={14} rx={2} fill="#fff" stroke="#39424e" strokeWidth={2} />, label: "police box (building)" },
};

function MapLegend({ items }: { items: string[] }) {
  return (
    <div className="map-legend" aria-label="Map key">
      {items
        .filter((i) => LEGEND[i])
        .map((i) => (
          <span key={i}>
            <svg width={22} height={20} viewBox="0 0 22 20" aria-hidden style={{ verticalAlign: "middle", marginRight: 6 }}>
              {LEGEND[i].icon}
            </svg>
            {LEGEND[i].label}
          </span>
        ))}
    </div>
  );
}
