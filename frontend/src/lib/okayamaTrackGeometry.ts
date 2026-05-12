import { TRACK_PATH_PIT_IN, TRACK_SECTOR_PATHS } from "@/lib/okayamaTrackAsset";

const NS = "http://www.w3.org/2000/svg";

const SAMPLE_COUNT = 512;

export type Vec2 = { x: number; y: number };

export type OkayamaLapGeometry = {
  lapD: string;
  totalLen: number;
  cutS1: number;
  cutS2: number;
  samples: Vec2[];
  sectorLabelCenters: { s1: Vec2; s2: Vec2; s3: Vec2 };
  pitInCenter: Vec2;
  timing: {
    fl: Vec2;
    s1End: Vec2;
    s2End: Vec2;
    /** 単位接線（FL 付近） */
    flTangent: Vec2;
  };
};

function stripLeadingMoveto(d: string): string {
  return d.replace(/^M\s*[-\d.]+\s*[-\d.]+\s*/i, "");
}

function sampleMergedPath(merged: SVGPathElement): Vec2[] {
  const total = merged.getTotalLength();
  const out: Vec2[] = [];
  if (!Number.isFinite(total) || total <= 0) return out;
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const pt = merged.getPointAtLength((i / (SAMPLE_COUNT - 1)) * total);
    out.push({ x: pt.x, y: pt.y });
  }
  return out;
}

function bboxCenter(svg: SVGSVGElement, d: string): Vec2 {
  const p = document.createElementNS(NS, "path") as SVGPathElement;
  p.setAttribute("d", d);
  svg.appendChild(p);
  try {
    const bb = p.getBBox();
    return { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 };
  } finally {
    svg.removeChild(p);
  }
}

export function pointOnLapSamples(samples: Vec2[], t: number): Vec2 {
  if (samples.length < 2) return { x: 600, y: 315 };
  const u = ((t % 1) + 1) % 1;
  const idx = u * (samples.length - 1);
  const i = Math.floor(idx);
  const f = idx - i;
  const a = samples[i]!;
  const b = samples[Math.min(i + 1, samples.length - 1)]!;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

/**
 * S1→S2→S3 を直線ブリッジでつなぎ一周パスを生成し、長さとサンプルを求める（クライアントのみ）。
 */
export function buildOkayamaLapGeometry(
  sectors: [string, string, string] = TRACK_SECTOR_PATHS,
): OkayamaLapGeometry | null {
  if (typeof document === "undefined") return null;

  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.style.cssText =
    "position:fixed;left:-9999px;top:0;visibility:hidden;pointer-events:none";
  document.body.appendChild(svg);

  try {
    const lengths: number[] = [];
    const ends: Vec2[] = [];
    const starts: Vec2[] = [];

    for (const d of sectors) {
      const p = document.createElementNS(NS, "path") as SVGPathElement;
      p.setAttribute("d", d);
      svg.appendChild(p);
      const len = p.getTotalLength();
      if (!Number.isFinite(len) || len <= 0) return null;
      const pLen = p.getPointAtLength(len);
      const p0 = p.getPointAtLength(0);
      lengths.push(len);
      ends.push({ x: pLen.x, y: pLen.y });
      starts.push({ x: p0.x, y: p0.y });
    }

    let combined = sectors[0];
    for (let i = 1; i < sectors.length; i++) {
      const st = starts[i];
      combined += ` L ${st.x} ${st.y} ` + stripLeadingMoveto(sectors[i]);
    }
    const st0 = starts[0];
    combined += ` L ${st0.x} ${st0.y}`;

    const merged = document.createElementNS(NS, "path") as SVGPathElement;
    merged.setAttribute("d", combined);
    svg.appendChild(merged);
    const totalLen = merged.getTotalLength();
    if (!Number.isFinite(totalLen) || totalLen <= 0) return null;

    const b12 = Math.hypot(starts[1].x - ends[0].x, starts[1].y - ends[0].y);
    const cutS1 = lengths[0];
    const cutS2 = lengths[0] + b12 + lengths[1];

    const samples = sampleMergedPath(merged);

    const fl = merged.getPointAtLength(0);
    const s1End = merged.getPointAtLength(Math.min(cutS1, totalLen));
    const s2End = merged.getPointAtLength(Math.min(cutS2, totalLen));
    const look = Math.min(6, totalLen * 0.004);
    const flB = merged.getPointAtLength(look);
    const dx = flB.x - fl.x;
    const dy = flB.y - fl.y;
    const tl = Math.hypot(dx, dy) || 1;

    const sectorLabelCenters = {
      s1: bboxCenter(svg, sectors[0]),
      s2: bboxCenter(svg, sectors[1]),
      s3: bboxCenter(svg, sectors[2]),
    };

    return {
      lapD: combined,
      totalLen,
      cutS1,
      cutS2,
      samples,
      sectorLabelCenters,
      pitInCenter: bboxCenter(svg, TRACK_PATH_PIT_IN),
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
