import React, {
  useEffect, useMemo, useRef, useState,
} from 'react';
import * as d3 from 'd3';
import { theme } from '../../../styles/theme';
// Built by scripts/lookup_data.py in the scraping project.
// professor_ratings.csv: name, department, rating (average quality, 1-5), reviews, rank,
//   weighted (the average as if the professor also had 20 reviews at the campus average,
//   so ratings from few reviews are pulled to the middle; rank orders by it).
// rating_histogram.csv: score (1.00-5.00 in steps of 0.02), professors and
//   professors_weighted (smoothed counts of professors near that score for each kind
//   of rating, so the curves read as continuous).
// Imported as URLs (?url), so they're fetched at run time instead of bundled.
import PROFS_URL from './data/professor_ratings.csv?url';
import HIST_URL from './data/rating_histogram.csv?url';

const MAX_SUGGESTIONS = 8;
const LISTBOX_ID = 'prof-rating-suggestions';
const HEIGHT = 260;
const MARGIN = {
  top: 34, right: 16, bottom: 42, left: 46,
};
const MARKER = theme.palette.red;

// The two ways to rate a professor; the toggle picks one.
const MODES = {
  average: { label: 'Average rating', value: (p) => p.rating, curve: 'professors' },
  weighted: { label: 'Weighted by number of ratings', value: (p) => p.weighted, curve: 'professorsWeighted' },
};

const formatRating = d3.format('.2f');
const formatCount = d3.format(',');
const plural = (n, word) => `${formatCount(n)} ${word}${n === 1 ? '' : 's'}`;

// Lowercase words with accents and punctuation dropped, for matching.
const tokenize = (text) => text.toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .split(/[^a-z0-9]+/)
  .filter(Boolean);

const cell = {
  padding: '6px 8px',
  borderBottom: '1px solid #e3e3e3',
  verticalAlign: 'top',
};

// hist: [{ score, professors }] for the chosen kind of rating; value: the selected
// professor's rating of that kind.
const Histogram = ({
  hist, total, selected, value, axisLabel,
}) => {
  const boxRef = useRef();
  const [width, setWidth] = useState(640);

  useEffect(() => {
    const box = boxRef.current;
    if (!box || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry.contentRect.width)));
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  const narrow = width < 480;
  const x = d3.scaleLinear().domain([1, 5]).range([MARGIN.left, width - MARGIN.right]);
  const y = d3.scaleLinear()
    .domain([0, hist ? d3.max(hist, (d) => d.professors) * 1.05 : 1])
    .nice()
    .range([HEIGHT - MARGIN.bottom, MARGIN.top]);
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
        height={HEIGHT}
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
          y={HEIGHT - 4}
          textAnchor="middle"
          fontSize={13}
          fill={theme.palette.darkGrey}
        >
          {axisLabel}
        </text>
        <text
          transform={`translate(12,${(MARGIN.top + HEIGHT - MARGIN.bottom) / 2}) rotate(-90)`}
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

const ProfRatingSearch = () => {
  const [profs, setProfs] = useState(null);
  const [hist, setHist] = useState(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [selected, setSelected] = useState(null);
  const [mode, setMode] = useState('average');
  const { value, curve, label: modeLabel } = MODES[mode];

  // Both files are small (about 60KB gzipped together), so they load right away:
  // the histogram is shown before anyone searches.
  useEffect(() => {
    d3.csv(HIST_URL, (r) => ({
      score: +r.score,
      professors: +r.professors,
      professorsWeighted: +r.professors_weighted,
    })).then(setHist);
    d3.csv(PROFS_URL, (r) => ({
      name: r.name,
      department: r.department,
      rating: +r.rating,
      reviews: +r.reviews,
      rank: +r.rank,
      weighted: +r.weighted,
      tokens: tokenize(r.name),
    })).then((rows) => {
      // Most-reviewed professors are suggested first.
      rows.sort((a, b) => b.reviews - a.reviews || a.rank - b.rank);
      setProfs(rows);
    });
  }, []);

  // Ratings of the chosen kind sorted low to high, to find the share of professors below one.
  const sortedRatings = useMemo(
    () => (profs ? profs.map(value).sort(d3.ascending) : []),
    [profs, value],
  );
  const curvePoints = useMemo(
    () => (hist ? hist.map((d) => ({ score: d.score, professors: d[curve] })) : null),
    [hist, curve],
  );

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
    setSelected(prof);
    setQuery(prof.name);
    setOpen(false);
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
  const total = profs ? profs.length : 0;
  const pctBelow = selected
    ? Math.round((100 * d3.bisectLeft(sortedRatings, value(selected))) / total)
    : null;
  const rankText = (
    <>
      {'They rank '}
      <strong>{`No. ${formatCount(selected?.rank ?? 0)}`}</strong>
      {` of ${formatCount(total)}`}
    </>
  );

  return (
    <figure style={{ margin: '2rem 0', fontFamily: 'Georgia, serif' }}>
      <h3 style={{ margin: '0 0 0.25rem' }}>Search UC Berkeley professors’ ratings</h3>
      <p style={{ margin: '0 0 0.75rem', color: theme.palette.darkGrey }}>
        Type a UC Berkeley professor’s name to see their average RateMyProfessors rating and
        where it falls among
        {total ? ` all ${formatCount(total)} ` : ' all '}
        rated professors.
      </p>
      <div style={{ position: 'relative' }}>
        <input
          type="search"
          value={query}
          placeholder="Search by name"
          role="combobox"
          aria-label="Professor name"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={LISTBOX_ID}
          aria-activedescendant={showList && suggestions[active] ? `${LISTBOX_ID}-${active}` : undefined}
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
          }}
        />
        {showList && (
          <ul
            id={LISTBOX_ID}
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
                key={p.rank}
                id={`${LISTBOX_ID}-${i}`}
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
                  {formatRating(value(p))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div
        role="group"
        aria-label="Rating to show"
        style={{
          display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: '0.75rem',
        }}
      >
        {Object.entries(MODES).map(([key, m]) => (
          <button
            key={key}
            type="button"
            aria-pressed={mode === key}
            onClick={() => setMode(key)}
            style={{
              padding: '5px 12px',
              fontSize: 14,
              fontFamily: 'inherit',
              borderRadius: 16,
              cursor: 'pointer',
              border: `1px solid ${mode === key ? theme.palette.darkBlue : theme.palette.grey}`,
              background: mode === key ? theme.palette.darkBlue : '#fff',
              color: mode === key ? '#fff' : theme.palette.black,
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div style={{ marginTop: '0.75rem', minHeight: '3em' }}>
        {selected && mode === 'average' && (
          <p style={{ margin: 0 }}>
            <strong>{selected.name}</strong>
            {` (${selected.department}) has an average rating of `}
            <strong>{formatRating(selected.rating)}</strong>
            {` out of 5 from ${plural(selected.reviews, 'review')}, higher than ${pctBelow}% of rated professors. `}
            {rankText}
            {' once the number of reviews is taken into account.'}
          </p>
        )}
        {selected && mode === 'weighted' && (
          <p style={{ margin: 0 }}>
            <strong>{selected.name}</strong>
            {` (${selected.department}) has a weighted rating of `}
            <strong>{formatRating(selected.weighted)}</strong>
            {` (an average of ${formatRating(selected.rating)} from ${plural(selected.reviews, 'review')}), higher than ${pctBelow}% of rated professors. `}
            {rankText}
            .
          </p>
        )}
        {!selected && (
          <p style={{ margin: 0, color: theme.palette.darkGrey }}>
            {mode === 'average'
              ? 'The curve shows how professors’ average ratings are spread from 1 to 5.'
              : 'Weighted ratings pull professors with few reviews toward the campus average, so the curve bunches up near 3.74.'}
          </p>
        )}
      </div>

      <div style={{ marginTop: '0.75rem' }}>
        <Histogram
          hist={curvePoints}
          total={total}
          selected={selected}
          value={selected ? value(selected) : 0}
          axisLabel={mode === 'average' ? 'Average rating' : 'Weighted rating'}
        />
      </div>

      <figcaption style={{ fontSize: 14, color: theme.palette.darkGrey, marginTop: '0.75rem' }}>
        <p style={{ margin: '0 0 0.5rem', fontSize: 14 }}>
          Ratings are each professor’s average quality score across all of their RateMyProfessors
          reviews as of Nov. 5, 2026; professors without reviews aren’t included. The curve is a
          smoothed histogram: its height shows how many professors have ratings near each score.
          The weighted rating, which the ranking uses, counts every professor as if they also had
          20 reviews at the campus average of 3.74, so a perfect score from a handful of reviews
          doesn’t outrank a near-perfect score from hundreds.
        </p>
        Source: The Daily Californian analysis of RateMyProfessors reviews
      </figcaption>
    </figure>
  );
};

export default ProfRatingSearch;
