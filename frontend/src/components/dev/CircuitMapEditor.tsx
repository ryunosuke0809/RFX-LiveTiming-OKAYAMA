"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import "@geoman-io/leaflet-geoman-free";

/** 岡山国際サーキット付近（衛星で合わせやすいよう中心のみ） */
const OKAYAMA_CENTER: L.LatLngTuple = [34.8381, 133.9286];

export type CircuitTag =
  | "sec1"
  | "sec2"
  | "sec3"
  | "pit"
  | "fl"
  | "pitIn"
  | "pitOut";

const TAG_LABEL: Record<CircuitTag, string> = {
  sec1: "Sec1 ライン",
  sec2: "Sec2 ライン",
  sec3: "Sec3 ライン",
  pit: "ピットロード",
  fl: "FL（フィニッシュライン）",
  pitIn: "Pit In",
  pitOut: "Pit Out",
};

const TAG_COLOR: Record<CircuitTag, string> = {
  sec1: "#3b82f6",
  sec2: "#ef4444",
  sec3: "#22c55e",
  pit: "#a1a1aa",
  fl: "#f59e0b",
  pitIn: "#eab308",
  pitOut: "#38bdf8",
};

const VIEW_W = 1000;
const VIEW_H = 560;

type Bounds = { south: number; west: number; north: number; east: number };

function padBounds(b: Bounds, ratio: number): Bounds {
  const latPad = (b.north - b.south) * ratio;
  const lngPad = (b.east - b.west) * ratio;
  return {
    south: b.south - latPad,
    north: b.north + latPad,
    west: b.west - lngPad,
    east: b.east + lngPad,
  };
}

function computeBounds(latlngs: L.LatLng[]): Bounds | null {
  if (latlngs.length === 0) return null;
  let south = latlngs[0].lat;
  let north = latlngs[0].lat;
  let west = latlngs[0].lng;
  let east = latlngs[0].lng;
  for (const ll of latlngs) {
    south = Math.min(south, ll.lat);
    north = Math.max(north, ll.lat);
    west = Math.min(west, ll.lng);
    east = Math.max(east, ll.lng);
  }
  return padBounds({ south, west, north, east }, 0.04);
}

function project(ll: L.LatLng, b: Bounds): { x: number; y: number } {
  const x = ((ll.lng - b.west) / (b.east - b.west)) * VIEW_W;
  const y = ((b.north - ll.lat) / (b.north - b.south)) * VIEW_H;
  return { x, y };
}

function latLngsToPathD(latlngs: L.LatLng[], b: Bounds): string {
  if (latlngs.length === 0) return "";
  const p0 = project(latlngs[0], b);
  let d = `M ${p0.x.toFixed(1)} ${p0.y.toFixed(1)}`;
  for (let i = 1; i < latlngs.length; i++) {
    const p = project(latlngs[i], b);
    d += ` L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  }
  return d;
}

function getLayerTag(layer: L.Layer): CircuitTag | undefined {
  return (layer as L.Layer & { _circuitTag?: CircuitTag })._circuitTag;
}

function flattenPolylineLatLngs(layer: L.Polyline): L.LatLng[] {
  const ll = layer.getLatLngs() as L.LatLng[] | L.LatLng[][];
  if (ll.length === 0) return [];
  if (Array.isArray(ll[0])) return (ll as L.LatLng[][]).flat();
  return ll as L.LatLng[];
}

function collectAllLatLngs(map: L.Map): L.LatLng[] {
  const out: L.LatLng[] = [];
  map.eachLayer((layer) => {
    if (layer instanceof L.TileLayer || layer instanceof L.LayerGroup) return;
    const tag = getLayerTag(layer);
    if (!tag) return;
    if (layer instanceof L.Polyline) {
      out.push(...flattenPolylineLatLngs(layer));
    } else if (layer instanceof L.Marker) {
      out.push(layer.getLatLng());
    }
  });
  return out;
}

function getPolylineLatLngs(layer: L.Polyline): L.LatLng[] {
  return flattenPolylineLatLngs(layer);
}

function buildExportSnippet(map: L.Map): string {
  const pts = collectAllLatLngs(map);
  const b = computeBounds(pts);
  if (!b) {
    return "// まだタグ付きのレイヤーがありません。下の手順で線・マーカーを描いてください。";
  }

  const byTag: Partial<Record<CircuitTag, L.Layer>> = {};
  map.eachLayer((layer) => {
    const tag = getLayerTag(layer);
    if (tag) byTag[tag] = layer;
  });

  const lines: string[] = [];
  lines.push(`// --- OkayamaCircuitSvg 用（viewBox は 0 0 ${VIEW_W} ${VIEW_H} に合わせる） ---`);
  lines.push(`// 投影バウンド: N=${b.north.toFixed(6)} S=${b.south.toFixed(6)} E=${b.east.toFixed(6)} W=${b.west.toFixed(6)}`);
  lines.push("");

  (["sec1", "sec2", "sec3", "pit"] as const).forEach((tag) => {
    const layer = byTag[tag];
    if (layer instanceof L.Polyline) {
      const d = latLngsToPathD(getPolylineLatLngs(layer), b);
      const constName =
        tag === "sec1" ? "PATH_S1" : tag === "sec2" ? "PATH_S2" : tag === "sec3" ? "PATH_S3" : "PATH_PIT";
      lines.push(`const ${constName} =`);
      lines.push(`  "${d.replace(/"/g, '\\"')}";`);
      lines.push("");
    } else {
      const constName =
        tag === "sec1" ? "PATH_S1" : tag === "sec2" ? "PATH_S2" : tag === "sec3" ? "PATH_S3" : "PATH_PIT";
      lines.push(`// TODO: ${TAG_LABEL[tag]} が未描画です (${constName})`);
      lines.push("");
    }
  });

  (["fl", "pitIn", "pitOut"] as const).forEach((tag) => {
    const layer = byTag[tag];
    if (layer instanceof L.Marker) {
      const p = project(layer.getLatLng(), b);
      const key =
        tag === "fl" ? "FL_POINT" : tag === "pitIn" ? "PIT_IN_POINT" : "PIT_OUT_POINT";
      lines.push(`const ${key} = { x: ${p.x.toFixed(1)}, y: ${p.y.toFixed(1)} }; // ${TAG_LABEL[tag]}`);
      lines.push("");
    } else {
      lines.push(`// TODO: ${TAG_LABEL[tag]} のマーカーがありません`);
      lines.push("");
    }
  });

  lines.push("// --- SVG ルート例 ---");
  lines.push(`<svg viewBox="0 0 ${VIEW_W} ${VIEW_H}" preserveAspectRatio="xMidYMid meet">`);
  lines.push('  <path d={PATH_S1} fill="none" stroke="#3b82f6" strokeWidth="4" />');
  lines.push('  <path d={PATH_S2} fill="none" stroke="#ef4444" strokeWidth="4" />');
  lines.push('  <path d={PATH_S3} fill="none" stroke="#22c55e" strokeWidth="4" />');
  lines.push('  <path d={PATH_PIT} fill="none" stroke="#a1a1aa" strokeWidth="3" strokeDasharray="6 4" />');
  lines.push(
    '  {/* FL: <line x1={FL_POINT.x-8} y1={FL_POINT.y} x2={FL_POINT.x+8} y2={FL_POINT.y} stroke="#fff" /> など */}',
  );
  lines.push("</svg>");

  return lines.join("\n");
}

function MapGeomanBridge({
  pendingTagRef,
  onLayersChange,
  onMapMounted,
}: {
  pendingTagRef: React.MutableRefObject<CircuitTag | null>;
  onLayersChange: () => void;
  onMapMounted: (map: L.Map) => void;
}) {
  const map = useMap();

  useEffect(() => {
    onMapMounted(map);
  }, [map, onMapMounted]);

  useEffect(() => {
    delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: string })._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });
  }, []);

  useEffect(() => {
    map.pm.addControls({
      position: "topleft",
      drawMarker: false,
      drawCircleMarker: false,
      drawPolyline: false,
      drawPolygon: false,
      drawRectangle: false,
      drawCircle: false,
      drawText: false,
      editMode: true,
      dragMode: true,
      cutPolygon: false,
      removalMode: true,
      rotateMode: false,
    });

    const onCreate = (e: { layer: L.Layer; shape: string }) => {
      const tag = pendingTagRef.current;
      if (!tag) {
        map.removeLayer(e.layer);
        return;
      }
      (e.layer as L.Layer & { _circuitTag: CircuitTag })._circuitTag = tag;
      if (e.layer instanceof L.Polyline) {
        e.layer.setStyle({ color: TAG_COLOR[tag], weight: 4, opacity: 0.9 });
      }
      if (e.layer instanceof L.Marker) {
        e.layer.bindTooltip(TAG_LABEL[tag], { permanent: false, direction: "top" });
      }
      pendingTagRef.current = null;
      map.pm.disableDraw();
      onLayersChange();
    };

    const onRemove = () => onLayersChange();

    map.on("pm:create", onCreate);
    map.on("pm:remove", onRemove);
    return () => {
      map.off("pm:create", onCreate);
      map.off("pm:remove", onRemove);
    };
  }, [map, onLayersChange, pendingTagRef]);

  return null;
}

export default function CircuitMapEditor() {
  const mapRef = useRef<L.Map | null>(null);
  const pendingTagRef = useRef<CircuitTag | null>(null);
  const [layerTick, setLayerTick] = useState(0);
  const [baseLayer, setBaseLayer] = useState<"osm" | "satellite">("satellite");
  const [exportText, setExportText] = useState("");

  const onLayersChange = useCallback(() => setLayerTick((n) => n + 1), []);

  const onMapMounted = useCallback((map: L.Map) => {
    mapRef.current = map;
    setExportText(buildExportSnippet(map));
  }, []);

  const runExport = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    setExportText(buildExportSnippet(map));
  }, []);

  useEffect(() => {
    runExport();
  }, [layerTick, runExport]);

  const tileUrl = useMemo(
    () =>
      baseLayer === "osm"
        ? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    [baseLayer],
  );

  const attribution =
    baseLayer === "osm"
      ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      : "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics";

  const startDrawLine = (tag: "sec1" | "sec2" | "sec3" | "pit") => {
    const map = mapRef.current;
    if (!map) return;
    pendingTagRef.current = tag;
    map.pm.enableDraw("Line", {
      pathOptions: {
        color: TAG_COLOR[tag],
        weight: 4,
      },
      finishOn: "dblclick",
      snapDistance: 25,
    });
  };

  const startDrawMarker = (tag: "fl" | "pitIn" | "pitOut") => {
    const map = mapRef.current;
    if (!map) return;
    pendingTagRef.current = tag;
    map.pm.enableDraw("Marker", { snappable: true });
  };

  return (
    <div className="flex flex-1 flex-col h-full min-h-0 bg-zinc-950 text-zinc-100">
      <header className="flex-shrink-0 border-b border-zinc-800 px-4 py-3 flex flex-wrap items-center gap-3">
        <h1 className="text-sm font-bold text-white">コースライン作成（サンプル地図）</h1>
        <span className="text-[10px] text-zinc-500">
          `/dev/circuit-map-editor` — 描画後、下のコードを `okayamaTrackAsset.ts` の `TRACK_PATH_*` に反映
        </span>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-[10px] text-zinc-500">底図</span>
          <button
            type="button"
            onClick={() => setBaseLayer("satellite")}
            className={`px-2 py-1 rounded text-[10px] font-semibold ${
              baseLayer === "satellite" ? "bg-amber-600 text-white" : "bg-zinc-800 text-zinc-400"
            }`}
          >
            衛星
          </button>
          <button
            type="button"
            onClick={() => setBaseLayer("osm")}
            className={`px-2 py-1 rounded text-[10px] font-semibold ${
              baseLayer === "osm" ? "bg-amber-600 text-white" : "bg-zinc-800 text-zinc-400"
            }`}
          >
            OSM
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 flex-col lg:flex-row">
        <aside className="w-full lg:w-72 flex-shrink-0 border-b lg:border-b-0 lg:border-r border-zinc-800 p-3 overflow-y-auto text-[11px] space-y-3">
          <p className="text-zinc-400 leading-relaxed">
            1. 種類ボタンを押す → 2. 地図上で折れ線（ダブルクリックで終了）または1回クリックでマーカー
            → 3. 左上の編集／削除ツールで調整可能。4. 下の出力をコピー。
          </p>

          <div>
            <div className="text-[10px] font-semibold text-zinc-500 uppercase mb-1.5">セクター（折れ線）</div>
            <div className="flex flex-wrap gap-1">
              {(["sec1", "sec2", "sec3", "pit"] as const).map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => startDrawLine(tag)}
                  className="px-2 py-1 rounded font-semibold text-[10px] border border-zinc-700 hover:bg-zinc-800"
                  style={{ borderColor: TAG_COLOR[tag], color: TAG_COLOR[tag] }}
                >
                  描画: {TAG_LABEL[tag]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[10px] font-semibold text-zinc-500 uppercase mb-1.5">点（1台ずつ）</div>
            <div className="flex flex-wrap gap-1">
              {(["fl", "pitIn", "pitOut"] as const).map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => startDrawMarker(tag)}
                  className="px-2 py-1 rounded font-semibold text-[10px] border border-zinc-700 hover:bg-zinc-800"
                  style={{ borderColor: TAG_COLOR[tag], color: TAG_COLOR[tag] }}
                >
                  配置: {TAG_LABEL[tag]}
                </button>
              ))}
            </div>
          </div>

          <p className="text-zinc-500">
            同じタグを再度描くと<strong className="text-zinc-300">古いレイヤーが残る</strong>ので、Geomanの削除ツールで消してから描き直してください。
          </p>

          <button
            type="button"
            onClick={runExport}
            className="w-full py-2 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold"
          >
            SVG用コードを再生成
          </button>
        </aside>

        <div className="flex-1 min-h-[320px] relative z-0">
          <MapContainer
            center={OKAYAMA_CENTER}
            zoom={16}
            className="h-full w-full min-h-[320px] z-0"
            scrollWheelZoom
            ref={mapRef}
          >
            <TileLayer attribution={attribution} url={tileUrl} maxZoom={19} />
            <MapGeomanBridge
              pendingTagRef={pendingTagRef}
              onLayersChange={onLayersChange}
              onMapMounted={onMapMounted}
            />
          </MapContainer>
        </div>
      </div>

      <section className="flex-shrink-0 border-t border-zinc-800 p-3 flex flex-col gap-2 max-h-[40vh]">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold text-zinc-500 uppercase">エクスポート（path d と座標）</span>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(exportText);
            }}
            className="text-[10px] px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
          >
            クリップボードにコピー
          </button>
        </div>
        <textarea
          readOnly
          className="flex-1 min-h-[140px] w-full font-mono text-[10px] leading-relaxed bg-zinc-900 border border-zinc-800 rounded p-2 text-emerald-200/90 resize-y"
          value={exportText}
          spellCheck={false}
        />
      </section>
    </div>
  );
}
