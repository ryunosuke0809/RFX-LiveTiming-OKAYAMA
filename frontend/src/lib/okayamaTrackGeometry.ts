import {
  TRACK_PATH_PIT_IN,
  TRACK_OFFSETS,
  TRACK_SECTORS,
  type SectorAsset,
  type Vec2,
} from "@/lib/okayamaTrackAsset";

const NS = "http://www.w3.org/2000/svg";

const SAMPLES_PER_SECTOR = 256;

export type { Vec2 } from "@/lib/okayamaTrackAsset";

export type OkayamaLapGeometry = {
  /** ワールド座標で結合された一周パスの d 文字列（M/L のみ） */
  lapD: string;
  totalLen: number;
  /** ラップ全体に占める各セクターの長さ累積（ワールド座標基準） */
  cutS1: number;
  cutS2: number;
  /** 一周をサンプリングしたワールド座標列（マーカー位置補間用） */
  samples: Vec2[];
  sectorLabelCenters: { s1: Vec2; s2: Vec2; s3: Vec2 };
  pitInCenter: Vec2;
  timing: {
    fl: Vec2;
    s1End: Vec2;
    s2End: Vec2;
    /** FL 付近の単位接線（コントロールラインの傾き） */
    flTangent: Vec2;
  };
};

function sampleSectorWorld(
  svg: SVGSVGElement,
  sector: SectorAsset,
): { samples: Vec2[]; len: number; bbox: { x: number; y: number; w: number; h: number } } {
  const p = document.createElementNS(NS, "path") as SVGPathElement;
  p.setAttribute("d", sector.d);
  svg.appendChild(p);
  try {
    const len = p.getTotalLength();
    if (!Number.isFinite(len) || len <= 0) {
      return { samples: [], len: 0, bbox: { x: 0, y: 0, w: 0, h: 0 } };
    }
    const samples: Vec2[] = [];
    for (let i = 0; i <= SAMPLES_PER_SECTOR; i++) {
      const pt = p.getPointAtLength((i / SAMPLES_PER_SECTOR) * len);
      samples.push({ x: pt.x + sector.offset.x, y: pt.y + sector.offset.y });
    }
    const bb = p.getBBox();
    return {
      samples,
      len,
      bbox: { x: bb.x + sector.offset.x, y: bb.y + sector.offset.y, w: bb.width, h: bb.height },
    };
  } finally {
    svg.removeChild(p);
  }
}

function bridgeBetween(prev: Vec2, next: Vec2, stepPx = 6): Vec2[] {
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= stepPx) return [];
  const steps = Math.ceil(dist / stepPx);
  const out: Vec2[] = [];
  for (let i = 1; i < steps; i++) {
    out.push({ x: prev.x + (dx * i) / steps, y: prev.y + (dy * i) / steps });
  }
  return out;
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

function buildLapDFromPoints(points: Vec2[]): string {
  if (points.length === 0) return "";
  const head = points[0]!;
  const parts: string[] = [`M ${head.x.toFixed(3)} ${head.y.toFixed(3)}`];
  for (let i = 1; i < points.length; i++) {
    const p = points[i]!;
    parts.push(`L ${p.x.toFixed(3)} ${p.y.toFixed(3)}`);
  }
  return parts.join(" ");
}

function bboxCenter(svg: SVGSVGElement, d: string, offset: Vec2): Vec2 {
  const p = document.createElementNS(NS, "path") as SVGPathElement;
  p.setAttribute("d", d);
  svg.appendChild(p);
  try {
    const bb = p.getBBox();
    return { x: bb.x + bb.width / 2 + offset.x, y: bb.y + bb.height / 2 + offset.y };
  } finally {
    svg.removeChild(p);
  }
}

/**
 * Sec1 → Sec2 → Sec3（順序固定）にオフセットを適用し、ワールド座標で一周パスを生成する。
 * 端点の僅かなズレは直線ブリッジで吸収する（クライアントのみ）。
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
    const sectorWorlds = sectors.map((s) => sampleSectorWorld(svg, s));
    if (sectorWorlds.some((sw) => sw.samples.length < 2)) return null;

    const merged: Vec2[] = [];
    const sectorLengthsWorld: number[] = [];

    for (let i = 0; i < sectorWorlds.length; i++) {
      const samples = sectorWorlds[i].samples;
      if (i > 0) {
        const prev = merged[merged.length - 1]!;
        const next = samples[0]!;
        merged.push(...bridgeBetween(prev, next));
      }
      const startIdx = merged.length;
      merged.push(...samples);
      let lenAccum = 0;
      for (let j = startIdx + 1; j < merged.length; j++) {
        const a = merged[j - 1]!;
        const b = merged[j]!;
        lenAccum += Math.hypot(b.x - a.x, b.y - a.y);
      }
      sectorLengthsWorld.push(lenAccum);
    }

    const last = merged[merged.length - 1]!;
    const head = merged[0]!;
    merged.push(...bridgeBetween(last, head));
    merged.push({ x: head.x, y: head.y });

    const lapD = buildLapDFromPoints(merged);

    const lapPath = document.createElementNS(NS, "path") as SVGPathElement;
    lapPath.setAttribute("d", lapD);
    svg.appendChild(lapPath);
    const totalLen = lapPath.getTotalLength();
    if (!Number.isFinite(totalLen) || totalLen <= 0) return null;

    const segLengths: number[] = [];
    for (let i = 1; i < merged.length; i++) {
      segLengths.push(
        Math.hypot(merged[i]!.x - merged[i - 1]!.x, merged[i]!.y - merged[i - 1]!.y),
      );
    }
    const cumulative = [0];
    for (const l of segLengths) cumulative.push(cumulative[cumulative.length - 1]! + l);

    let cumIndex = 0;
    function lengthAtIndex(targetIdx: number): number {
      const idx = Math.min(Math.max(targetIdx, 0), cumulative.length - 1);
      return cumulative[idx]!;
    }

    let counter = 0;
    const sectorEndIdx: number[] = [];
    for (let i = 0; i < sectorWorlds.length; i++) {
      if (i > 0) {
        const prev = sectorWorlds[i - 1].samples[sectorWorlds[i - 1].samples.length - 1]!;
        const next = sectorWorlds[i].samples[0]!;
        const dist = Math.hypot(next.x - prev.x, next.y - prev.y);
        if (dist > 6) counter += Math.ceil(dist / 6) - 1;
      }
      counter += sectorWorlds[i].samples.length;
      sectorEndIdx.push(counter - 1);
    }
    void cumIndex;

    const cutS1 = lengthAtIndex(sectorEndIdx[0]!);
    const cutS2 = lengthAtIndex(sectorEndIdx[1]!);

    const fl = lapPath.getPointAtLength(0);
    const s1End = lapPath.getPointAtLength(Math.min(cutS1, totalLen));
    const s2End = lapPath.getPointAtLength(Math.min(cutS2, totalLen));
    const look = Math.min(8, totalLen * 0.004);
    const flB = lapPath.getPointAtLength(look);
    const dx = flB.x - fl.x;
    const dy = flB.y - fl.y;
    const tl = Math.hypot(dx, dy) || 1;

    const sectorLabelCenters = {
      s1: bboxCenter(svg, sectors[0].d, sectors[0].offset),
      s2: bboxCenter(svg, sectors[1].d, sectors[1].offset),
      s3: bboxCenter(svg, sectors[2].d, sectors[2].offset),
    };

    return {
      lapD,
      totalLen,
      cutS1,
      cutS2,
      samples: merged,
      sectorLabelCenters,
      pitInCenter: bboxCenter(svg, TRACK_PATH_PIT_IN, TRACK_OFFSETS.pitIn),
      timing: {
        fl: { x: fl.x, y: fl.y },
        s1End: { x: s1End.x, y: s1End.y },
        s2End: { x: s2End.x, y: s2End.y },
        flTangent: { x: dx / tl, y: dy / tl },
      },
    };
  } finally {
    document.body.removeChild(svg);
  }
}
