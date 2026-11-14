import {
  useEffect, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import * as d3 from 'd3';
import { theme } from '../../../styles/theme';
import {
  Figure, formatCount, formatRating, tooltipBox,
} from './shared';
// Built by scripts/department_ranks.py in the scraping project: the 10 departments with the
// most RateMyProfessors reviews, ranked against each other every school year (August through
// July, by when a review was posted) by the average quality of that year's reviews (each
// review counts once). One row per school year x department:
//   year (the year it ends: 2026), label (2025–26), department, reviews, professors,
//   score (average quality), rank (1 = best of 10).
// Imported as a URL (?url), so it's fetched at run time instead of bundled.
import DATA_URL from './data/department_school_year_ranks.csv?url';

// Highlighted departments, in the order they're picked.
const HIGHLIGHT = [theme.palette.darkBlue, theme.palette.orange, theme.palette.darkBlueGreen];
const MAX_PINS = HIGHLIGHT.length;
// Highlighted when the chart loads, in color order: the departments the article's text discusses,
// sociology (first most often), political science (the steepest drop) and math (at or near the
// bottom every year).
const START_PINS = ['Sociology', 'Political Science', 'Mathematics'];
const LINE = '#d3d3d3';
const ROW = 40;
const MARGIN_TOP = 46;
const MARGIN_BOTTOM = 12;
// Room for a highlighted name: bold, after its 22px line key. "6. Business Administration" in
// bold is about 205px, so 225 clipped it; 250 leaves a margin.
const NAME_SPACE = 250;
// Narrowest gap between years before the chart scrolls sideways; "2025–26" is about 52px wide.
const MIN_STEP = 58;
const WINDOW_GUTTER = 16; // closest the chart comes to the window's edges when it spreads past the column

const DepartmentRankBump = () => {
  const [rows, setRows] = useState(null);
  const [pins, setPins] = useState(START_PINS);
  const [hover, setHover] = useState(null); // { dept, i }
  const scrollRef = useRef();
  const columnRef = useRef();
  // The article column's width and left edge, and the window's width (see the layout below).
  const [space, setSpace] = useState({ colW: 640, colLeft: 0, winW: 640 });

  useEffect(() => {
    d3.csv(DATA_URL, (r) => ({
      year: +r.year,
      label: r.label,
      department: r.department,
      reviews: +r.reviews,
      professors: +r.professors,
      score: +r.score,
      rank: +r.rank,
    })).then(setRows);
  }, []);

  useEffect(() => {
    const col = columnRef.current;
    if (!col) return undefined;
    const measure = () => {
      const rect = col.getBoundingClientRect();
      setSpace({
        colW: rect.width,
        colLeft: rect.left,
        winW: document.documentElement.clientWidth,
      });
    };
    measure();
    window.addEventListener('resize', measure);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (observer) observer.observe(col);
    return () => {
      window.removeEventListener('resize', measure);
      if (observer) observer.disconnect();
    };
  }, []);

  // School years in order, the departments, and each department's point in every year.
  const data = useMemo(() => {
    if (!rows) return null;
    const years = Array.from(new Set(rows.map((r) => r.year))).sort((a, b) => a - b);
    const yearIndex = new Map(years.map((yr, i) => [yr, i]));
    const labels = years.map((yr) => rows.find((r) => r.year === yr).label);
    const departments = Array.from(new Set(rows.map((r) => r.department)));
    const series = {};
    rows.forEach((r) => {
      series[r.department] = series[r.department] || [];
      series[r.department][yearIndex.get(r.year)] = r;
    });
    return {
      years, labels, departments, series,
    };
  }, [rows]);

  const togglePin = (d) => setPins((p) => {
    if (p.includes(d)) return p.filter((x) => x !== d);
    return p.length < MAX_PINS ? [...p, d] : [...p.slice(1), d];
  });

  // A department keeps its color while it stays highlighted.
  const [colors, setColors] = useState({});
  useEffect(() => {
    setColors((prev) => {
      const next = {};
      const free = HIGHLIGHT.filter((c) => !pins.some((d) => prev[d] === c));
      pins.forEach((d) => { next[d] = prev[d] || free.shift(); });
      return next;
    });
  }, [pins]);

  // Layout. The chart wants room for names on both sides (fullW). When the article column is
  // narrower, it spreads past the column into the page margins, centered on the column and kept
  // WINDOW_GUTTER from the window's edges. Only when the window itself is too narrow does it
  // drop the left-hand names (narrow), and then scroll sideways inside its box.
  const nYears = data ? data.years.length : 11;
  const { colW, colLeft, winW } = space;
  const fullW = 2 * NAME_SPACE + 28 + MIN_STEP * (nYears - 1);
  const boxW = Math.max(colW, Math.min(fullW, winW - 2 * WINDOW_GUTTER));
  let shift = (colW - boxW) / 2; // negative when the box is wider than the column
  const boxLeft = colLeft + shift;
  if (boxLeft < WINDOW_GUTTER) shift += WINDOW_GUTTER - boxLeft;
  if (boxLeft + boxW > winW - WINDOW_GUTTER) shift -= boxLeft + boxW - (winW - WINDOW_GUTTER);
  const narrow = boxW < fullW;
  const left = narrow ? 34 : NAME_SPACE;
  const width = Math.max(boxW, left + NAME_SPACE + 28 + MIN_STEP * (nYears - 1));
  const nDepts = data ? data.departments.length : 10;
  const height = MARGIN_TOP + nDepts * ROW + MARGIN_BOTTOM;

  // When the chart is wider than the column, start scrolled to the latest year.
  const scrolled = useRef(false);
  useLayoutEffect(() => {
    if (!data || scrolled.current || !scrollRef.current) return;
    scrolled.current = true;
    scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
  }, [data, width]);

  const x = d3.scalePoint().domain(d3.range(nYears)).range([left + 14, width - NAME_SPACE - 14]);
  const y = (rank) => MARGIN_TOP + (rank - 0.5) * ROW;
  const line = d3.line().x((p, i) => x(i)).y((p) => y(p.rank)).curve(d3.curveBumpX);

  const series = data ? data.series : null;
  const hoverDept = hover && hover.dept;
  const isOn = (d) => pins.includes(d) || hoverDept === d;
  const colorOf = (d) => colors[d] || (hoverDept === d ? theme.palette.black : LINE);
  // Highlighted lines are drawn last, on top.
  const drawOrder = data ? [...data.departments].sort((a, b) => isOn(a) - isOn(b)) : [];

  const onLineMove = (d) => (event) => {
    const [px] = d3.pointer(event, event.currentTarget.ownerSVGElement);
    const i = d3.minIndex(d3.range(nYears), (k) => Math.abs(x(k) - px));
    if (!hover || hover.dept !== d || hover.i !== i) setHover({ dept: d, i });
  };

  // Hovering a side label highlights the line without a tooltip (i is null then).
  const tipPoint = hover && hover.i !== null && series ? series[hover.dept][hover.i] : null;
  const scrollLeft = scrollRef.current ? scrollRef.current.scrollLeft : 0;
  const tipX = tipPoint ? x(hover.i) - scrollLeft : 0;
  const tipOnLeft = tipX > boxW * 0.6;

  // A department's name at one end of the chart (on narrow screens the left end shows only the
  // rank). Hovering highlights the line; clicking or Enter pins it.
  const label = (d, i, anchor, lx) => {
    const p = series[d][i];
    const on = isOn(d);
    const rankOnly = narrow && anchor === 'end';
    const keyX = anchor === 'start' ? lx : lx - 16;
    const textX = anchor === 'start' ? lx + (on ? 22 : 0) : lx - (on && !rankOnly ? 22 : 0);
    return (
      <g
        key={`${anchor}-${d}`}
        role="button"
        tabIndex={0}
        aria-pressed={pins.includes(d)}
        aria-label={`Highlight ${d}`}
        style={{ cursor: 'pointer' }}
        onClick={() => togglePin(d)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            togglePin(d);
          }
        }}
        onPointerEnter={() => setHover({ dept: d, i: null })}
        onPointerLeave={() => setHover(null)}
      >
        <rect
          x={anchor === 'start' ? lx - 4 : lx - (rankOnly ? 28 : NAME_SPACE - 10)}
          y={y(p.rank) - ROW / 2}
          width={rankOnly ? 32 : NAME_SPACE - 6}
          height={ROW}
          fill="transparent"
        />
        {on && !rankOnly && (
          <line x1={keyX} x2={keyX + 16} y1={y(p.rank)} y2={y(p.rank)} stroke={colorOf(d)} strokeWidth={3} strokeLinecap="round" />
        )}
        <text
          x={textX}
          y={y(p.rank)}
          dy="0.32em"
          textAnchor={anchor}
          fontSize={14}
          fontWeight={on ? 700 : 400}
          fill={on || !(pins.length || hoverDept) ? theme.palette.black : theme.palette.darkGrey}
        >
          {rankOnly ? p.rank : `${p.rank}. ${d}`}
        </text>
      </g>
    );
  };

  return (
    <Figure
      title="Most reviewed departments ranked by average quality score, 2015-16 to 2025-26"
      subtitle="The 10 departments with the most RateMyProfessors reviews, ranked against each other by their average quality rating."
      note="Academic years last 12 months, beginning in August. Each department is ranked by the average quality score of every review associated with a professor in the department."
    >
      {/* columnRef measures the article column; the box inside can be wider than it */}
      <div ref={columnRef}>
        <div style={{ position: 'relative', width: boxW, marginLeft: shift }}>
          <div ref={scrollRef} style={{ overflowX: 'auto' }} onScroll={() => setHover(null)}>
            <svg
              width={width}
              height={height}
              role="img"
              aria-label="Bump chart of the 10 most-reviewed departments' ranks by academic year."
              style={{ display: 'block', overflow: 'visible', fontFamily: 'Georgia, serif' }}
            >
              {data && data.labels.map((text, i) => (
                <g key={text}>
                  <line x1={x(i)} x2={x(i)} y1={MARGIN_TOP - 6} y2={height - MARGIN_BOTTOM} stroke="#ececec" />
                  <text x={x(i)} y={24} textAnchor="middle" fontSize={13} fill={theme.palette.darkGrey}>{text}</text>
                </g>
              ))}
              {series && drawOrder.map((d) => {
                const on = isOn(d);
                const pts = series[d];
                return (
                  <g key={d}>
                    <path
                      d={line(pts)}
                      fill="none"
                      stroke={colorOf(d)}
                      strokeWidth={on ? 3.5 : 2}
                      strokeLinecap="round"
                    />
                    {pts.map((p, i) => (
                      <circle
                        key={p.year}
                        cx={x(i)}
                        cy={y(p.rank)}
                        r={on ? 5 : 3.5}
                        fill={colorOf(d)}
                        stroke="#fff"
                        strokeWidth={2}
                      />
                    ))}
                    {/* A wide invisible copy of the line, so it's easy to hover and click */}
                    <path
                      d={line(pts)}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={18}
                      style={{ cursor: 'pointer' }}
                      onPointerMove={onLineMove(d)}
                      onPointerLeave={() => setHover(null)}
                      onClick={() => togglePin(d)}
                    />
                  </g>
                );
              })}
              {series && data.departments.map((d) => label(d, 0, 'end', left - 10))}
              {series && data.departments.map((d) => label(d, nYears - 1, 'start', width - NAME_SPACE + 10))}
              {/* The hovered point, drawn last so it sits on top: a bigger dot with a faint halo.
                  pointerEvents none, so it doesn't take the pointer from the line under it. */}
              {tipPoint && (
                <g pointerEvents="none">
                  <circle
                    cx={x(hover.i)}
                    cy={y(tipPoint.rank)}
                    r={13}
                    fill={colorOf(hover.dept)}
                    fillOpacity={0.18}
                  />
                  <circle
                    cx={x(hover.i)}
                    cy={y(tipPoint.rank)}
                    r={7.5}
                    fill={colorOf(hover.dept)}
                    stroke="#fff"
                    strokeWidth={2.5}
                  />
                </g>
              )}
            </svg>
          </div>

          {tipPoint && (
            <div style={{
              ...tooltipBox,
              top: y(tipPoint.rank) - 10,
              [tipOnLeft ? 'right' : 'left']: tipOnLeft ? boxW - tipX + 14 : tipX + 14,
            }}
            >
              <div style={{ color: theme.palette.darkGrey, fontSize: 13 }}>
                {`${tipPoint.label} academic year`}
              </div>
              <div style={{ fontWeight: 700 }}>{`${tipPoint.rank}. ${tipPoint.department}`}</div>
              {/* A plain average: every review that year counts once (not the weighted rating) */}
              <div>{`${formatRating(tipPoint.score)} average rating`}</div>
              <div style={{ color: theme.palette.darkGrey, fontSize: 13 }}>
                {`${formatCount(tipPoint.reviews)} reviews of ${formatCount(tipPoint.professors)} professors.`}
              </div>
            </div>
          )}
        </div>
      </div>
    </Figure>
  );
};

export default DepartmentRankBump;
