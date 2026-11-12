import React, {
  useEffect, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import * as d3 from 'd3';
import { theme } from '../../../styles/theme';
// Built by scripts/department_ranks.py in the scraping project: the 10 departments with the
// most RateMyProfessors reviews, ranked against each other every semester by the average
// quality of their reviews from that semester and the one before (each review counts once).
// One row per semester x department:
//   term (2025F), semester (Fall 2025), previous (the semester before it), department,
//   reviews, professors (in the two semesters), score (average quality), rank (1 = best of 10).
// Imported as a URL (?url), so it's fetched at run time instead of bundled.
import DATA_URL from './data/department_semester_ranks.csv?url';

// Highlighted departments, in the order they're picked.
const HIGHLIGHT = [theme.palette.darkBlue, theme.palette.orange, theme.palette.darkBlueGreen];
const MAX_PINS = HIGHLIGHT.length;
const LINE = '#d3d3d3';
const ROW = 40;
const MARGIN_TOP = 46;
const MARGIN_BOTTOM = 12;
const NAME_SPACE = 200; // room for "10. Business Administration"
const MIN_STEP = 56; // narrowest gap between semesters before the chart scrolls sideways

const formatScore = d3.format('.2f');
const formatCount = d3.format(',');

const DepartmentRankBump = () => {
  const [rows, setRows] = useState(null);
  const [pins, setPins] = useState([]);
  const [hover, setHover] = useState(null); // { dept, i }
  const scrollRef = useRef();
  const [avail, setAvail] = useState(640);

  useEffect(() => {
    d3.csv(DATA_URL, (r) => ({
      term: r.term,
      semester: r.semester,
      previous: r.previous,
      department: r.department,
      reviews: +r.reviews,
      professors: +r.professors,
      score: +r.score,
      rank: +r.rank,
    })).then(setRows);
  }, []);

  useEffect(() => {
    const box = scrollRef.current;
    if (!box || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => setAvail(entry.contentRect.width));
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  // Semesters in order, the departments, and each department's point in every semester.
  const data = useMemo(() => {
    if (!rows) return null;
    const terms = Array.from(new Set(rows.map((r) => r.term)))
      .sort((a, b) => (+a.slice(0, 4) * 2 + (a[4] === 'F')) - (+b.slice(0, 4) * 2 + (b[4] === 'F')));
    const termIndex = new Map(terms.map((t, i) => [t, i]));
    const labels = terms.map((t) => rows.find((r) => r.term === t));
    const departments = Array.from(new Set(rows.map((r) => r.department)));
    const series = {};
    rows.forEach((r) => {
      series[r.department] = series[r.department] || [];
      series[r.department][termIndex.get(r.term)] = r;
    });
    return {
      terms, labels, departments, series,
    };
  }, [rows]);

  // Start by highlighting the three departments whose rank changed most.
  useEffect(() => {
    if (!data || pins.length) return;
    const s = data.series;
    const last = data.terms.length - 1;
    setPins(data.departments
      .map((d) => ({ d, move: Math.abs(s[d][0].rank - s[d][last].rank) }))
      .sort((a, b) => b.move - a.move)
      .slice(0, MAX_PINS)
      .map(({ d }) => d));
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const nTerms = data ? data.terms.length : 11;
  const narrow = avail < 2 * NAME_SPACE + 28 + MIN_STEP * (nTerms - 1);
  const left = narrow ? 34 : NAME_SPACE;
  const width = Math.max(avail, left + NAME_SPACE + 28 + MIN_STEP * (nTerms - 1));
  const nDepts = data ? data.departments.length : 10;
  const height = MARGIN_TOP + nDepts * ROW + MARGIN_BOTTOM;

  // When the chart is wider than the column, start scrolled to the latest semester.
  const scrolled = useRef(false);
  useLayoutEffect(() => {
    if (!data || scrolled.current || !scrollRef.current) return;
    scrolled.current = true;
    scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
  }, [data, width]);

  const x = d3.scalePoint().domain(d3.range(nTerms)).range([left + 14, width - NAME_SPACE - 14]);
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
    const i = d3.minIndex(d3.range(nTerms), (k) => Math.abs(x(k) - px));
    if (!hover || hover.dept !== d || hover.i !== i) setHover({ dept: d, i });
  };

  const tipPoint = hover && series ? series[hover.dept][hover.i] : null;
  const scrollLeft = scrollRef.current ? scrollRef.current.scrollLeft : 0;
  const tipX = tipPoint ? x(hover.i) - scrollLeft : 0;
  const tipOnLeft = tipX > avail * 0.6;

  const label = (d, i, anchor, lx) => {
    const p = series[d][i];
    const on = isOn(d);
    const rankOnly = narrow && anchor === 'end';
    const name = d.length > 24 ? `${d.slice(0, 23)}…` : d;
    const keyX = anchor === 'start' ? lx : lx - 16;
    const textX = anchor === 'start' ? lx + (on ? 22 : 0) : lx - (on && !rankOnly ? 22 : 0);
    return (
      <g
        key={`${anchor}-${d}`}
        role="button"
        tabIndex={0}
        aria-pressed={pins.includes(d)}
        aria-label={`Highlight ${d}`}
        style={{ cursor: 'pointer', outline: 'none' }}
        onClick={() => togglePin(d)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            togglePin(d);
          }
        }}
        onPointerEnter={() => setHover({ dept: d, i })}
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
          {rankOnly ? p.rank : `${p.rank}. ${name}`}
          <title>{d}</title>
        </text>
      </g>
    );
  };

  return (
    <figure style={{ margin: '2rem 0', fontFamily: 'Georgia, serif' }}>
      <h3 style={{ margin: '0 0 0.25rem' }}>How the most-reviewed departments rank</h3>
      <p style={{ margin: '0 0 0.75rem', color: theme.palette.darkGrey }}>
        The 10 departments with the most RateMyProfessors reviews, ranked against each other by
        their average quality rating.
      </p>

      <div style={{ position: 'relative' }}>
        <div ref={scrollRef} style={{ overflowX: 'auto' }} onScroll={() => setHover(null)}>
          <svg
            width={width}
            height={height}
            role="img"
            aria-label="Bump chart of the 10 most-reviewed departments' ranks by semester."
            style={{ display: 'block', overflow: 'visible', fontFamily: 'Georgia, serif' }}
          >
            {data && data.labels.map((r, i) => {
              const [season, year] = r.semester.split(' ');
              return (
                <g key={r.term}>
                  <line x1={x(i)} x2={x(i)} y1={MARGIN_TOP - 6} y2={height - MARGIN_BOTTOM} stroke="#ececec" />
                  <text x={x(i)} y={14} textAnchor="middle" fontSize={13} fill={theme.palette.darkGrey}>{season}</text>
                  <text x={x(i)} y={30} textAnchor="middle" fontSize={12} fill={theme.palette.grey}>{year}</text>
                </g>
              );
            })}
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
                      key={p.term}
                      cx={x(i)}
                      cy={y(p.rank)}
                      r={on ? 5 : 3.5}
                      fill={colorOf(d)}
                      stroke="#fff"
                      strokeWidth={2}
                    />
                  ))}
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
            {series && data.departments.map((d) => label(d, nTerms - 1, 'start', width - NAME_SPACE + 10))}
          </svg>
        </div>

        {tipPoint && (
          <div style={{
            position: 'absolute',
            top: y(tipPoint.rank) - 10,
            [tipOnLeft ? 'right' : 'left']: tipOnLeft ? avail - tipX + 14 : tipX + 14,
            background: '#fff',
            border: '1px solid #ccc',
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
            padding: '8px 10px',
            fontSize: 14,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            zIndex: 2,
          }}
          >
            <div style={{ color: theme.palette.darkGrey, fontSize: 13 }}>{tipPoint.semester}</div>
            <div style={{ fontWeight: 700 }}>{tipPoint.department}</div>
            <div>{`No. ${tipPoint.rank}, ${formatScore(tipPoint.score)} average`}</div>
            <div style={{ color: theme.palette.darkGrey, fontSize: 13 }}>
              {`${formatCount(tipPoint.reviews)} reviews of ${formatCount(tipPoint.professors)} professors, ${tipPoint.previous} and ${tipPoint.semester}`}
            </div>
          </div>
        )}
      </div>

      <figcaption style={{ fontSize: 14, color: theme.palette.darkGrey, marginTop: '0.75rem' }}>
        <p style={{ margin: '0 0 0.5rem', fontSize: 14 }}>
          Each semester’s rank uses that semester’s and the previous semester’s reviews
          together, which halves how much ranks jump around from a few unusual reviews. Every
          review counts once, so a heavily reviewed professor can move a whole department.
          Semesters are assigned by when a review was posted (January–May is spring,
          August–December fall; summer reviews are left out). Fall 2026 is left out because it’s
          still in progress.
        </p>
        Source: Brendan Raykoff/The Daily Californian analysis of RateMyProfessors reviews
      </figcaption>
    </figure>
  );
};

export default DepartmentRankBump;
