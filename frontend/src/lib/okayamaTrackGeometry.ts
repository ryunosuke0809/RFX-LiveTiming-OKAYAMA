import {
  TRACK_SECTORS,
  type SectorAsset,
  type Vec2,
} from "@/lib/okayamaTrackAsset";

const NS = "http://www.w3.org/2000/svg";

/**
 * 1 セクターあたりの初期サンプル数（少なめにして Chaikin がコーナーを大きく丸めるようにする）。
 * 元 SVG の細かな角を残さないため、敢えてサンプル数を絞る。
 */
const SAMPLES_PER_SECTOR = 60;

/** Chaikin スムージングの繰返し回数（多いほど角が丸くなる） */
const SMOOTHING_ITERATIONS = 4;

/** 隣接セクター間ギャップ補完の最小距離 */
const BRIDGE_THRESHOLD = 4;

export type { Vec2 } from "@/lib/okayamaTrackAsset";

export type OkayamaLapGeometry = {
  /** ワールド座標で結合された一周パスの d 文字列（M/L のみ） */
  lapD: string;
  /** スムージング済みの各セクター d 文字列（ワールド座標） */
  sectorDs: { s1: string; s2: string; s3: string };
  totalLen: number;
  /** ラップ全体に占める各セクターの長さ累積（ワールド座標基準） */
  cutS1: number;
  cutS2: number;
  /** 一周をサンプリングしたワールド座標列（マーカー位置補間用） */
  samples: Vec2[];
  sectorLabelCenters: { s1: Vec2; s2: Vec2; s3: Vec2 };
  timing: {
    fl: Vec2;
    s1End: Vec2;
    s2End: Vec2;
    /** 各境界点での単位接線（横断ラインの傾き計算に使用） */
    flTangent: Vec2;
    s1EndTangent: Vec2;
    s2EndTangent: Vec2;
  };
};

function sampleSectorWorld(svg: SVGSVGElement, sector: SectorAsset): Vec2[] {
  const p = document.createElementNS(NS, "path") as SVGPathElement;
  p.setAttribute("d", sector.d);
  svg.appendChild(p);
  try {
    const len = p.getTotalLength();
    if (!Number.isFinite(len) || len <= 0) return [];
    const samples: Vec2[] = [];
    for (let i = 0; i <= SAMPLES_PER_SECTOR; i++) {
      const pt = p.getPointAtLength((i / SAMPLES_PER_SECTOR) * len);
      samples.push({ x: pt.x + sector.offset.x, y: pt.y + sector.offset.y });
    }
    return samples;
  } finally {
    svg.removeChild(p);
  }
}

/** Chaikin の角丸めアルゴリズム。両端点は固定して保つ。 */
function chaikinSmooth(pts: Vec2[]): Vec2[] {
  if (pts.length < 3) return pts;
  const out: Vec2[] = [pts[0]!];
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i]!;
    const q = pts[i + 1]!;
    out.push({ x: 0.75 * p.x + 0.25 * q.x, y: 0.75 * p.y + 0.25 * q.y });
    out.push({ x: 0.25 * p.x + 0.75 * q.x, y: 0.25 * p.y + 0.75 * q.y });
  }
  out.push(pts[pts.length - 1]!);
  return out;
}

function smoothPolyline(pts: Vec2[], iterations = SMOOTHING_ITERATIONS): Vec2[] {
  let cur = pts;
  for (let i = 0; i < iterations; i++) cur = chaikinSmooth(cur);
  return cur;
}

function bridgeBetween(prev: Vec2, next: Vec2, stepPx = 6): Vec2[] {
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= BRIDGE_THRESHOLD) return [];
  const steps = Math.ceil(dist / stepPx);
  const out: Vec2[] = [];
  for (let i = 1; i < steps; i++) {
    out.push({ x: prev.x + (dx * i) / steps, y: prev.y + (dy * i) / steps });
  }
  return out;
}

function polylineToD(points: Vec2[]): string {
  if (points.length === 0) return "";
  const head = points[0]!;
  const parts: string[] = [`M ${head.x.toFixed(3)} ${head.y.toFixed(3)}`];
  for (let i = 1; i < points.length; i++) {
    const p = points[i]!;
    parts.push(`L ${p.x.toFixed(3)} ${p.y.toFixed(3)}`);
  }
  return parts.join(" ");
}

export function pointOnLapSamples(samples: Vec2[], t: number): Vec2 {
  if (samples.length < 2) return { x: 800, y: 400 };
  const u = ((t % 1) + 1) % 1;
  const idx = u * (samples.length - 1);
  const i = Math.floor(idx);
  const f = idx - i;
  const a = samples[i]!;
  const b = samples[Math.min(i + 1, samples.length - 1)]!;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

function computePolylineCenter(pts: Vec2[]): Vec2 {
  if (pts.length === 0) return { x: 0, y: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

function polylineLength(pts: Vec2[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  }
  return total;
}

/**
 * Sec1 → Sec2 → Sec3 の順にサンプリング → スムージング → ワールド結合し、一周パスを生成する。
 */
export function buildOkayamaLapGeometry(
  sectors: [SectorAsset, SectorAsset, SectorAsset] = TRACK_SECTORS,
): OkayamaLapGeometry | null {
  if (typeof document === "undefined") return null;

  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.style.cssText =
    "position:fixed;left:-9999px;top:0;visibility:hidden;pointer-events:none";
  document.body.appendChild(svg);

  try {
    const rawSectorPolys = sectors.map((s) => sampleSectorWorld(svg, s));
    if (rawSectorPolys.some((p) => p.length < 2)) return null;

    const smoothPolys = rawSectorPolys.map((p) => smoothPolyline(p));
    const sectorDs = {
      s1: polylineToD(smoothPolys[0]!),
      s2: polylineToD(smoothPolys[1]!),
      s3: polylineToD(smoothPolys[2]!),
    };

    const merged: Vec2[] = [];
    const sectorEndIdx: number[] = [];

    for (let i = 0; i < smoothPolys.length; i++) {
      const poly = smoothPolys[i]!;
      if (i > 0) {
        const prev = merged[merged.length - 1]!;
        const next = poly[0]!;
        merged.push(...bridgeBetween(prev, next));
      }
      merged.push(...poly);
      sectorEndIdx.push(merged.length - 1);
    }

    const last = merged[merged.length - 1]!;
    const head = merged[0]!;
    merged.push(...bridgeBetween(last, head));
    merged.push({ x: head.x, y: head.y });

    const lapD = polylineToD(merged);

    const lapPath = document.createElementNS(NS, "path") as SVGPathElement;
    lapPath.setAttribute("d", lapD);
    svg.appendChild(lapPath);
    const totalLen = lapPath.getTotalLength();
    if (!Number.isFinite(totalLen) || totalLen <= 0) return null;

    const cumulative: number[] = [0];
    for (let i = 1; i < merged.length; i++) {
      cumulative.push(
        cumulative[i - 1]! +
          Math.hypot(merged[i]!.x - merged[i - 1]!.x, merged[i]!.y - merged[i - 1]!.y),
      );
    }
    const cutS1 = cumulative[sectorEndIdx[0]!]!;
    const cutS2 = cumulative[sectorEndIdx[1]!]!;

    const fl = lapPath.getPointAtLength(0);
    const s1End = lapPath.getPointAtLength(Math.min(cutS1, totalLen));
    const s2End = lapPath.getPointAtLength(Math.min(cutS2, totalLen));
    const look = Math.min(8, totalLen * 0.004);

    function tangentAt(at: number): Vec2 {
      const a = lapPath.getPointAtLength(Math.max(0, at - look / 2));
      const b = lapPath.getPointAtLength(Math.min(totalLen, at + look / 2));
      const tdx = b.x - a.x;
      const tdy = b.y - a.y;
      const tlen = Math.hypot(tdx, tdy) || 1;
      return { x: tdx / tlen, y: tdy / tlen };
    }

    const flTangent = tangentAt(0);
    const s1EndTangent = tangentAt(Math.min(cutS1, totalLen));
    const s2EndTangent = tangentAt(Math.min(cutS2, totalLen));

    const sectorLabelCenters = {
      s1: computePolylineCenter(smoothPolys[0]!),
      s2: computePolylineCenter(smoothPolys[1]!),
      s3: computePolylineCenter(smoothPolys[2]!),
    };
    void polylineLength;

    return {
      lapD,
      sectorDs,
      totalLen,
      cutS1,
      cutS2,
      samples: merged,
      sectorLabelCenters,
      timing: {
        fl: { x: fl.x, y: fl.y },
        s1End: { x: s1End.x, y: s1End.y },
        s2End: { x: s2End.x, y: s2End.y },
        flTangent,
        s1EndTangent,
        s2EndTangent,
      },
    };
  } finally {
    document.body.removeChild(svg);
  }
}
