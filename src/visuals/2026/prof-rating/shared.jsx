// Pieces shared by the prof-rating story's visuals: the article's search (ProfRatingSearch.jsx),
// the campus-wide ratings-by-year chart (RatingCountsByYear.jsx) and the professor report page
// (ProfReport.jsx, at /interactive/profratings).
import React, {
  useEffect, useMemo, useRef, useState,
} from 'react';
import * as d3 from 'd3';
import { theme } from '../../../styles/theme';

export const formatRating = d3.format('.2f');
export const formatCount = d3.format(',');
export const plural = (n, word) => `${formatCount(n)} ${word}${n === 1 ? '' : 's'}`;

// Lowercase words with accents and punctuation dropped, for matching.
export const tokenize = (text) => text.toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .split(/[^a-z0-9]+/)
  .filter(Boolean);

// Width of an element, kept up to date as it resizes (640 until it's measured).
export const useWidth = (ref, min = 280) => {
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const box = ref.current;
    if (!box || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(min, entry.contentRect.width)));
    observer.observe(box);
    return () => observer.disconnect();
  }, [ref, min]);
  return width;
};

const MARGIN = {
  top: 34, right: 16, bottom: 42, left: 46,
};
const MARKER = theme.palette.red;

// A smoothed histogram of professors' ratings, with the selected professor marked.
// hist: [{ score, professors }]; value: the selected professor's rating on the same scale.
export const Histogram = ({
  hist, total, selected, value, axisLabel, height = 260,
}) => {
  const boxRef = useRef();
  const width = useWidth(boxRef);

  const narrow = width < 480;
  const x = d3.scaleLinear().domain([1, 5]).range([MARGIN.left, width - MARGIN.right]);
  const y = d3.scaleLinear()
    .domain([0, hist ? d3.max(hist, (d) => d.professors) * 1.05 : 1])
    .nice()
    .range([height - MARGIN.bottom, MARGIN.top]);
  const area = d3.area().x((d) => x(d.score)).y0(y(0)).y1((d) => y(d.professors))
    .curve(d3.curveMonotoneX);
  const line = d3.line().x((d) => x(d.score)).y((d) => y(d.professors)).curve(d3.curveMonotoneX);
  const xTicks = narrow ? [1, 2, 3, 4, 5] : d3.range(1, 5.01, 0.5);
  const yTicks = y.ticks(4);

  // The part of the curve below the selected rating is shaded darker.
  const below = hist && selected ? hist.filter((d) => d.score <= value) : null;
  // Height of the curve at the selected rating, for the marker's dot.
  const curveAt = (score) => {
    const i = d3.bisector((d) => d.score).center(hist, score);
    return hist[i].professors;
  };

  const mx = selected ? x(value) : 0;
  const labelEnd = selected && mx > width * 0.62;

  return (
    <div ref={boxRef} style={{ width: '100%' }}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={selected
          ? `Distribution of ${formatCount(total)} professors' ratings (${axisLabel.toLowerCase()}), with ${selected.name} marked at ${formatRating(value)}.`
          : `Distribution of professors' ratings (${axisLabel.toLowerCase()}), from 1 to 5.`}
        style={{ display: 'block', overflow: 'visible', fontFamily: 'Georgia, serif' }}
      >
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(t)} y2={y(t)} stroke="#e6e6e6" />
            <text x={MARGIN.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={12} fill={theme.palette.darkGrey}>
              {t}
            </text>
          </g>
        ))}
        {hist && (
          <>
            <path d={area(hist)} fill={theme.palette.dcBlue} fillOpacity={0.45} />
            {below && below.length > 1 && (
              <path d={area(below)} fill={theme.palette.darkBlue} fillOpacity={0.35} />
            )}
            <path d={line(hist)} fill="none" stroke={theme.palette.darkBlue} strokeWidth={2} />
          </>
        )}
        <line
          x1={MARGIN.left}
          x2={width - MARGIN.right}
          y1={y(0)}
          y2={y(0)}
          stroke={theme.palette.grey}
        />
        {xTicks.map((t) => (
          <g key={t} transform={`translate(${x(t)},${y(0)})`}>
            <line y2={5} stroke={theme.palette.grey} />
            <text y={19} textAnchor="middle" fontSize={12} fill={theme.palette.darkGrey}>
              {Number.isInteger(t) ? t : t.toFixed(1)}
            </text>
          </g>
        ))}
        <text
          x={(MARGIN.left + width - MARGIN.right) / 2}
          y={height - 4}
          textAnchor="middle"
          fontSize={13}
          fill={theme.palette.darkGrey}
        >
          {axisLabel}
        </text>
        <text
          transform={`translate(12,${(MARGIN.top + height - MARGIN.bottom) / 2}) rotate(-90)`}
          textAnchor="middle"
          fontSize={13}
          fill={theme.palette.darkGrey}
        >
          Professors
        </text>
        {hist && selected && (
          <g>
            <line x1={mx} x2={mx} y1={MARGIN.top - 6} y2={y(0)} stroke={MARKER} strokeWidth={2.5} />
            <circle cx={mx} cy={y(curveAt(value))} r={5} fill={MARKER} stroke="#fff" strokeWidth={2} />
            <text
              x={mx + (labelEnd ? -8 : 8)}
              y={MARGIN.top - 14}
              textAnchor={labelEnd ? 'end' : 'start'}
              fontSize={14}
              fontWeight="bold"
              fill={theme.palette.black}
            >
              {`${selected.name}: ${formatRating(value)}`}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
};

const MAX_SUGGESTIONS = 8;

const cell = {
  padding: '6px 8px',
  borderBottom: '1px solid #e3e3e3',
  verticalAlign: 'top',
};

// A name search with suggestions, like money-flow's donor search. profs must be sorted in
// the order suggestions should come in, each with `tokens` (tokenize(name)), `name`,
// `department` and an `id`. ratingOf(prof) is shown next to each suggestion. `name` sets
// the box's text from outside (e.g. the professor a page opened on).
export const ProfSearchBox = ({
  profs, onChoose, ratingOf, listboxId, name = '', inputStyle = {},
}) => {
  const [query, setQuery] = useState(name);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => setQuery(name), [name]);

  // A name matches when every typed word starts one of its words, so "toni mar",
  // "mar t" and "ton" all find "Toni Mar".
  const suggestions = useMemo(() => {
    const words = tokenize(query);
    if (!profs || !words.length) return [];
    const found = [];
    for (let i = 0; i < profs.length && found.length < MAX_SUGGESTIONS; i += 1) {
      const p = profs[i];
      if (words.every((w) => p.tokens.some((t) => t.startsWith(w)))) found.push(p);
    }
    return found;
  }, [profs, query]);

  const choose = (prof) => {
    setQuery(prof.name);
    setOpen(false);
    onChoose(prof);
  };

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!suggestions.length) return;
      setOpen(true);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((a) => (a + step + suggestions.length) % suggestions.length);
    } else if (event.key === 'Enter') {
      if (open && suggestions[active]) {
        event.preventDefault();
        choose(suggestions[active]);
      }
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  const showList = open && query.trim() !== '';

  return (
    <div style={{ position: 'relative' }}>
      <input
        type="search"
        value={query}
        placeholder="Search by name"
        role="combobox"
        aria-label="Professor name"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listboxId}
        aria-activedescendant={showList && suggestions[active] ? `${listboxId}-${active}` : undefined}
        autoComplete="off"
        spellCheck={false}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '10px 12px',
          fontSize: 17,
          fontFamily: 'inherit',
          border: `1px solid ${theme.palette.grey}`,
          borderRadius: 4,
          background: '#fff',
          color: theme.palette.black,
          ...inputStyle,
        }}
      />
      {showList && (
        <ul
          id={listboxId}
          role="listbox"
          style={{
            position: 'absolute',
            zIndex: 2,
            left: 0,
            right: 0,
            margin: '2px 0 0',
            padding: 0,
            listStyle: 'none',
            background: '#fff',
            border: '1px solid #ccc',
            borderRadius: 4,
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
            textAlign: 'left',
          }}
        >
          {!profs && <li style={{ ...cell, color: theme.palette.darkGrey }}>Loading names…</li>}
          {profs && !suggestions.length && (
            <li style={{ ...cell, color: theme.palette.darkGrey }}>No results</li>
          )}
          {suggestions.map((p, i) => (
            // The input handles the keyboard for the list (arrow keys and Enter).
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events
            <li
              key={p.id}
              id={`${listboxId}-${i}`}
              role="option"
              aria-selected={i === active}
              // Keep focus in the input so blur doesn't close the list before the click lands.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(p)}
              onMouseEnter={() => setActive(i)}
              style={{
                ...cell,
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                cursor: 'pointer',
                background: i === active ? '#eef4fa' : '#fff',
              }}
            >
              <span>
                {p.name}
                <span style={{ marginLeft: 8, fontSize: 14, color: theme.palette.darkGrey }}>
                  {p.department}
                </span>
              </span>
              <span style={{ color: theme.palette.darkGrey, whiteSpace: 'nowrap' }}>
                {formatRating(ratingOf(p))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// ---------- reviews by rating, year by year (stacked bars) ----------

export const RATINGS = [1, 2, 3, 4, 5];
// Low ratings red, the middle gray, high ratings blue. 1 is stacked at the bottom.
const RATING_COLORS = {
  1: theme.palette.red,
  2: '#f2a3a0',
  3: '#cfcfcf',
  4: theme.palette.dcBlue,
  5: theme.palette.darkBlue,
};
const RATING_LABELS = {
  1: '1 (awful)', 2: '2', 3: '3', 4: '4', 5: '5 (awesome)',
};
// The latest year in the data is only partly covered: the scrape ran on Nov. 5, 2026.
export const PARTIAL_YEAR = 2026;
export const PARTIAL_NOTE = '*2026 includes reviews through Nov. 5.';

// A row of rating_counts_by_year.csv or profratings_years.csv (year, r1-r5, and an id in the
// latter) as { id, year, total, 1: n, ..., 5: n }.
export const parseRatingYear = (r) => {
  const row = { id: r.id === undefined ? undefined : +r.id, year: +r.year };
  RATINGS.forEach((k) => { row[k] = +r[`r${k}`]; });
  row.total = d3.sum(RATINGS, (k) => row[k]);
  return row;
};

// Years in order, with any missing years between the first and last filled in as empty bars.
export const fillYears = (rows) => {
  if (!rows.length) return [];
  const byYear = new Map(rows.map((r) => [r.year, r]));
  const [y0, y1] = d3.extent(rows, (r) => r.year);
  return d3.range(y0, y1 + 1).map((year) => byYear.get(year)
    || { year, total: 0, ...Object.fromEntries(RATINGS.map((k) => [k, 0])) });
};

const BAR_MARGIN = {
  top: 12, right: 18, bottom: 50, left: 68,
};
const BAR_GAP = 1.5; // white line between stacked segments

// The legend and a stacked bar chart of reviews by rating for each year: `years` is
// [{ year, total, 1: n, ..., 5: n }] in order (see parseRatingYear and fillYears).
export const RatingBars = ({ years, height = 350 }) => {
  const boxRef = useRef();
  const width = useWidth(boxRef);
  const [hover, setHover] = useState(null); // index of the hovered year

  const stacked = d3.stack().keys(RATINGS).value((yr, k) => yr[k])(years);
  const x = d3.scaleBand()
    .domain(years.map((yr) => yr.year))
    .range([BAR_MARGIN.left, width - BAR_MARGIN.right])
    .paddingInner(0.25)
    .paddingOuter(0.1);
  const barWidth = Math.min(24, x.bandwidth());
  const barX = (year) => x(year) + (x.bandwidth() - barWidth) / 2;
  const y = d3.scaleLinear()
    .domain([0, d3.max(years, (yr) => yr.total) || 1])
    .nice()
    .range([height - BAR_MARGIN.bottom, BAR_MARGIN.top]);
  // Whole numbers only: a professor with two reviews in a year shouldn't get a 0.5 tick.
  const yTicks = y.ticks(5).filter(Number.isInteger);
  // Full years when there's room, two-digit years when it's tighter, otherwise every fifth year.
  let every = 5;
  if (x.step() >= 30) every = 1;
  const yearText = (year) => (every === 1 && x.step() < 44 ? `’${String(year).slice(2)}` : year);

  const hovered = hover !== null ? years[hover] : null;
  const tipX = hovered ? barX(hovered.year) + barWidth / 2 : 0;
  const tipOnLeft = tipX > width * 0.6;

  return (
    <div>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: 14, marginBottom: '0.75rem',
      }}
      >
        {RATINGS.map((k) => (
          <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{
              width: 12, height: 12, borderRadius: 2, background: RATING_COLORS[k], display: 'inline-block',
            }}
            />
            {RATING_LABELS[k]}
          </span>
        ))}
      </div>

      <div ref={boxRef} style={{ position: 'relative', width: '100%' }}>
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`Stacked bar chart of reviews by rating for each year from ${years.length ? years[0].year : ''} to ${years.length ? years[years.length - 1].year : ''}.`}
          style={{ display: 'block', overflow: 'visible', fontFamily: 'Georgia, serif' }}
          onPointerLeave={() => setHover(null)}
        >
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={BAR_MARGIN.left} x2={width - BAR_MARGIN.right} y1={y(t)} y2={y(t)} stroke="#e6e6e6" />
              <line x1={BAR_MARGIN.left - 5} x2={BAR_MARGIN.left} y1={y(t)} y2={y(t)} stroke={theme.palette.grey} />
              <text x={BAR_MARGIN.left - 9} y={y(t)} dy="0.32em" textAnchor="end" fontSize={12} fill={theme.palette.darkGrey}>
                {formatCount(t)}
              </text>
            </g>
          ))}

          {stacked.map((layer) => (
            <g key={layer.key}>
              {layer.map((seg, i) => {
                const yr = years[i];
                const h = y(seg[0]) - y(seg[1]);
                return (
                  <rect
                    key={yr.year}
                    x={barX(yr.year)}
                    y={y(seg[1])}
                    width={barWidth}
                    // a white gap between segments, never a negative height
                    height={Math.max(0, h - (seg[1] > seg[0] && layer.key !== 5 ? BAR_GAP : 0))}
                    fill={RATING_COLORS[layer.key]}
                    opacity={hover === null || hover === i ? 1 : 0.45}
                  />
                );
              })}
            </g>
          ))}

          {/* Axes: lines, tick marks and titles */}
          <line x1={BAR_MARGIN.left} x2={width - BAR_MARGIN.right} y1={y(0)} y2={y(0)} stroke={theme.palette.grey} />
          <line x1={BAR_MARGIN.left} x2={BAR_MARGIN.left} y1={BAR_MARGIN.top} y2={y(0)} stroke={theme.palette.grey} />
          {years.map((yr, i) => (i % every === 0 || i === years.length - 1) && (
            <g key={yr.year} transform={`translate(${x(yr.year) + x.bandwidth() / 2},${y(0)})`}>
              <line y2={5} stroke={theme.palette.grey} />
              <text y={19} textAnchor="middle" fontSize={12} fill={theme.palette.darkGrey}>
                {yearText(yr.year)}
                {yr.year === PARTIAL_YEAR ? '*' : ''}
              </text>
            </g>
          ))}
          <text
            x={(BAR_MARGIN.left + width - BAR_MARGIN.right) / 2}
            y={height - 6}
            textAnchor="middle"
            fontSize={13}
            fill={theme.palette.darkGrey}
          >
            Year
          </text>
          <text
            transform={`translate(14,${(BAR_MARGIN.top + height - BAR_MARGIN.bottom) / 2}) rotate(-90)`}
            textAnchor="middle"
            fontSize={13}
            fill={theme.palette.darkGrey}
          >
            Number of reviews
          </text>

          {/* Hover targets: the whole column for each year, bigger than the bar */}
          {years.map((yr, i) => (
            <rect
              key={yr.year}
              x={x(yr.year) - (x.step() - x.bandwidth()) / 2}
              y={BAR_MARGIN.top}
              width={x.step()}
              height={height - BAR_MARGIN.top - BAR_MARGIN.bottom}
              fill="transparent"
              onPointerEnter={() => setHover(i)}
            />
          ))}
        </svg>

        {hovered && (
          <div style={{
            position: 'absolute',
            top: BAR_MARGIN.top,
            [tipOnLeft ? 'right' : 'left']: tipOnLeft ? width - tipX + barWidth : tipX + barWidth,
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
            <div style={{ fontWeight: 700 }}>
              {hovered.year}
              {hovered.year === PARTIAL_YEAR ? ' (through Nov. 5)' : ''}
            </div>
            <div style={{ color: theme.palette.darkGrey, fontSize: 13, marginBottom: 4 }}>
              {plural(hovered.total, 'review')}
            </div>
            {[...RATINGS].reverse().map((k) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  width: 10, height: 10, borderRadius: 2, background: RATING_COLORS[k], display: 'inline-block',
                }}
                />
                <span style={{ minWidth: 70 }}>{RATING_LABELS[k]}</span>
                <strong style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
                  {formatCount(hovered[k])}
                </strong>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
