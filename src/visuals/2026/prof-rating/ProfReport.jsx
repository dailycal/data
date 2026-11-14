// The professor report page at /interactive/profratings (src/pages/interactive/profratings.astro).
// /interactive/profratings?prof=Toni%20Mar shows that professor's report; when two professors
// share a name, &dept=<department> picks one. Without ?prof it shows the campus-wide top 10.
import {
  useEffect, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import * as d3 from 'd3';
import { theme } from '../../../styles/theme';
import {
  HIGHLIGHT_BG, Histogram, PARTIAL_NOTE, PARTIAL_YEAR, ProfSearchBox, RatingBars,
  formatCount, formatRating, nameKey, parseHist, parseRatingYear, plural, tokenize, useReportHref,
} from './shared';
// Built by scripts/profratings_data.py and scripts/lookup_data.py in the scraping project.
// profratings_index.csv: id, name, department, rating, weighted, rank, reviews, difficulty,
//   first, last (year-month of the first and latest review), tags ("tag:count|tag:count",
//   the most-used three).
// profratings_years.csv: id, year, r1-r5 (reviews at each rating that year), the same layout as
//   the campus-wide chart's data, drawn by the same RatingBars.
// rating_histogram.csv: the smoothed curve of everyone's ratings (professors_weighted).
import INDEX_URL from './data/profratings_index.csv?url';
import YEARS_URL from './data/profratings_years.csv?url';
import HIST_URL from './data/rating_histogram.csv?url';

const RULE = '1px solid #e3e3e3';

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const parseProf = (r) => ({
  id: +r.id,
  name: r.name,
  department: r.department,
  rating: +r.rating,
  weighted: +r.weighted,
  rank: +r.rank,
  reviews: +r.reviews,
  difficulty: +r.difficulty,
  first: r.first,
  last: r.last,
  tags: r.tags ? r.tags.split('|').map((t) => {
    const i = t.lastIndexOf(':');
    return { tag: capitalize(t.slice(0, i)), count: +t.slice(i + 1) };
  }) : [],
  key: nameKey(r.name),
  tokens: tokenize(r.name),
});

// A professor's years in order, from their first review to their latest, with years they got
// no reviews filled in as empty bars.
const fillYears = (rows) => {
  if (!rows.length) return [];
  const byYear = new Map(rows.map((r) => [r.year, r]));
  const [y0, y1] = d3.extent(rows, (r) => r.year);
  return d3.range(y0, y1 + 1).map((year) => byYear.get(year) || {
    year, total: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0,
  });
};

// ---------- small building blocks ----------

const sectionHeading = {
  fontSize: 22, fontWeight: 700, margin: '2.25rem 0 0.5rem', color: theme.palette.black,
};
const muted = { color: theme.palette.darkGrey };

// One figure in the stats strip under the name: a small uppercase label, the number, a note.
// The strip draws the rules; each figure after the first gets a hairline on its left.
const Stat = ({
  label, value, note, first = false,
}) => (
  <div style={{
    padding: first ? '0 14px 0 0' : '0 14px',
    borderLeft: first ? 'none' : RULE,
    minWidth: 0,
  }}
  >
    <div style={{
      fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', ...muted,
    }}
    >
      {label}
    </div>
    <div style={{
      fontSize: 36, fontWeight: 700, lineHeight: 1.1, margin: '4px 0 2px', color: theme.palette.black,
    }}
    >
      {value}
    </div>
    <div style={{ fontSize: 14, ...muted }}>{note}</div>
  </div>
);

// A link to a professor's report that switches in place (and still opens in a new tab).
const ProfLink = ({ prof, href, go, children }) => (
  <a
    href={href(prof)}
    onClick={(event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
      event.preventDefault();
      go(prof);
    }}
    style={{ color: theme.palette.black }}
  >
    {children || prof.name}
  </a>
);

// Ranked rows: position, name, review count, weighted rating. `rows` is [{ pos, prof }] or
// { gap: true } for a "…" standing in for professors not shown, which calls onExpand when clicked.
// With maxHeight, the table scrolls inside a box that tall (header pinned at the top), starting
// with the selected professor's row in the middle.
const headCell = {
  padding: '8px 10px',
  fontWeight: 400,
  position: 'sticky',
  top: 0,
  zIndex: 1,
  background: '#fff',
  boxShadow: 'inset 0 -1px 0 #e3e3e3', // a rule under the header that stays with it while scrolling
};
const RankTable = ({
  rows, selectedId, href, go, showDept = false, onExpand, expandLabel, maxHeight,
}) => {
  const boxRef = useRef();
  useLayoutEffect(() => {
    const box = boxRef.current;
    const row = box && box.querySelector('[data-selected="true"]');
    if (row) box.scrollTop = row.offsetTop - (box.clientHeight - row.offsetHeight) / 2;
  }, [maxHeight, selectedId]);

  const table = (
    <table style={{
      width: '100%', borderCollapse: 'collapse', background: '#fff', border: maxHeight ? 'none' : RULE, fontSize: 16,
    }}
    >
      <thead>
        <tr style={{ fontSize: 13, ...muted, textAlign: 'left' }}>
          <th style={{ ...headCell, width: 44 }}>No.</th>
          <th style={headCell}>Professor</th>
          <th style={{ ...headCell, textAlign: 'right' }}>Weighted rating</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (row.gap ? (
          <tr key={`gap-${i}`}>
            <td colSpan={3} style={{ padding: 0, borderTop: RULE }}>
              <button
                type="button"
                onClick={onExpand}
                aria-label={expandLabel}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '2px 10px',
                  border: 'none',
                  background: 'none',
                  font: 'inherit',
                  textAlign: 'left',
                  letterSpacing: 2,
                  cursor: 'pointer',
                  ...muted,
                }}
              >
                …
              </button>
            </td>
          </tr>
        ) : (
          <tr
            key={row.prof.id}
            data-selected={row.prof.id === selectedId}
            style={{
              borderTop: RULE,
              background: row.prof.id === selectedId ? HIGHLIGHT_BG : 'transparent',
              fontWeight: row.prof.id === selectedId ? 700 : 400,
            }}
          >
            <td style={{ padding: '8px 10px', fontVariantNumeric: 'tabular-nums' }}>{row.pos}</td>
            <td style={{ padding: '8px 10px' }}>
              <ProfLink prof={row.prof} href={href} go={go} />
              <span style={{
                display: 'block', fontSize: 13, fontWeight: 400, ...muted,
              }}
              >
                {showDept ? `${row.prof.department} · ` : ''}
                {plural(row.prof.reviews, 'review')}
              </span>
            </td>
            <td style={{ padding: '8px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {formatRating(row.prof.weighted)}
            </td>
          </tr>
        )))}
      </tbody>
    </table>
  );

  if (!maxHeight) return table;
  // position: relative makes the box the rows' offsetParent, for scrolling to the selected one.
  return (
    <div
      ref={boxRef}
      style={{
        position: 'relative', maxHeight, overflowY: 'auto', border: RULE, background: '#fff',
      }}
    >
      {table}
    </div>
  );
};

// ---------- the page ----------

// articleUrl: the prof-rating article's, passed in by src/pages/interactive/profratings.astro so
// "Back to the article" follows the article if it's renamed.
const ProfReport = ({ articleUrl }) => {
  const [profs, setProfs] = useState(null);
  const [yearsById, setYearsById] = useState(null);
  const [hist, setHist] = useState(null);
  const [params, setParams] = useState(null);

  useEffect(() => {
    d3.csv(INDEX_URL, parseProf).then(setProfs);
    d3.csv(YEARS_URL, parseRatingYear).then((rows) => setYearsById(d3.group(rows, (r) => r.id)));
    d3.csv(HIST_URL, parseHist).then(setHist);
    const read = () => setParams(new URLSearchParams(window.location.search));
    read();
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, []);

  // Most-reviewed first, for search suggestions.
  const byReviews = useMemo(
    () => (profs ? [...profs].sort((a, b) => b.reviews - a.reviews || a.rank - b.rank) : null),
    [profs],
  );
  const href = useReportHref(profs);
  // Switches to another professor's report without reloading the page.
  const go = (prof) => {
    const url = href(prof);
    window.history.pushState(null, '', url);
    setParams(new URLSearchParams(url.split('?')[1]));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // What the URL asks for: a professor, several with that name, or nothing found.
  const wanted = params && params.get('prof');
  const result = useMemo(() => {
    if (!profs || !wanted) return null;
    let matches = profs.filter((p) => p.key === nameKey(wanted));
    const dept = params.get('dept');
    if (dept && matches.length > 1) {
      const byDept = matches.filter((p) => nameKey(p.department) === nameKey(dept));
      if (byDept.length) matches = byDept;
    }
    if (matches.length === 1) return { prof: matches[0] };
    if (matches.length > 1) return { several: matches };
    const words = tokenize(wanted);
    const close = byReviews.filter((p) => words.some((w) => p.tokens.some((t) => t.startsWith(w)))).slice(0, 5);
    return { notFound: wanted, close };
  }, [profs, byReviews, wanted, params]);

  const prof = result && result.prof;

  useEffect(() => {
    document.title = prof
      ? `${prof.name}: Professor ratings — The Daily Californian: Data`
      : 'Professor ratings — The Daily Californian: Data';
  }, [prof]);

  const total = profs ? profs.length : 0;
  const pctBelow = useMemo(() => {
    if (!prof) return null;
    const sorted = profs.map((p) => p.weighted).sort(d3.ascending);
    // Rounded down, so the top professors read "higher than 99%", never 100%.
    return Math.floor((100 * d3.bisectLeft(sorted, prof.weighted)) / total);
  }, [prof, profs, total]);

  // Which professor's department table is expanded to every professor (by id), so moving to
  // another professor starts collapsed again.
  const [expandedFor, setExpandedFor] = useState(null);
  const expanded = !!prof && expandedFor === prof.id;

  // The department's professors in rank order, and the rows to show. Collapsed: the top 5, then
  // this professor if they're further down, with a "…" (click to show everyone) wherever
  // professors are skipped, including after the last row shown.
  const dept = useMemo(() => {
    if (!prof) return null;
    const list = profs.filter((p) => p.department === prof.department).sort((a, b) => a.rank - b.rank);
    const pos = list.indexOf(prof) + 1;
    const all = list.map((p, i) => ({ pos: i + 1, prof: p }));
    if (expanded) return { size: list.length, pos, rows: all };
    const rows = all.slice(0, 5);
    if (pos > 5) {
      if (pos > 6) rows.push({ gap: true });
      rows.push(all[pos - 1]);
    }
    if (rows[rows.length - 1].pos < list.length) rows.push({ gap: true });
    return { size: list.length, pos, rows };
  }, [prof, profs, expanded]);

  // This professor's reviews by rating for every year from their first review to their latest.
  const profYears = prof && yearsById ? fillYears(yearsById.get(prof.id) || []) : null;

  return (
    <div style={{
      maxWidth: 760, margin: '0 auto', padding: '28px 8px 60px', fontFamily: 'Georgia, serif', color: theme.palette.black,
    }}
    >
      <a
        href={articleUrl}
        style={{
          display: 'inline-block',
          margin: '0 0 18px',
          padding: '6px 14px',
          fontSize: 15,
          border: `1px solid ${theme.palette.black}`,
          color: theme.palette.black,
          textDecoration: 'none',
          background: '#fff',
        }}
      >
        ← Back to the article
      </a>
      <ProfSearchBox
        profs={byReviews}
        onChoose={go}
        ratingOf={(p) => p.weighted}
        listboxId="profratings-suggestions"
        name={prof ? prof.name : ''}
        inputStyle={{ borderRadius: 0 }}
      />

      {!profs && <p style={{ ...muted, marginTop: '1.5rem' }}>Loading…</p>}

      {profs && !wanted && (
        <>
          <h1 style={{ fontSize: 40, fontWeight: 800, margin: '1.75rem 0 0.5rem' }}>Professor ratings</h1>
          <p style={{ fontSize: 17, lineHeight: 1.45, margin: '0 0 0.5rem' }}>
            {`Search any of ${formatCount(total)} UC Berkeley professors with RateMyProfessors reviews to see their ratings, how they’ve changed year by year and how they rank in their department.`}
          </p>
          <h2 style={sectionHeading}>Highest-rated professors</h2>
          <RankTable
            rows={profs.slice().sort((a, b) => a.rank - b.rank).slice(0, 10).map((p) => ({ pos: p.rank, prof: p }))}
            href={href}
            go={go}
            showDept
          />
        </>
      )}

      {result && result.several && (
        <>
          <h1 style={{ fontSize: 32, fontWeight: 800, margin: '1.75rem 0 0.75rem' }}>
            {`More than one professor is named ${result.several[0].name}`}
          </h1>
          <RankTable rows={result.several.map((p) => ({ pos: p.rank, prof: p }))} href={href} go={go} showDept />
        </>
      )}

      {result && result.notFound && (
        <>
          <h1 style={{ fontSize: 32, fontWeight: 800, margin: '1.75rem 0 0.75rem' }}>
            {`No professor named “${result.notFound}”`}
          </h1>
          <p style={{ fontSize: 17 }}>
            Only professors with at least one RateMyProfessors review are included. Try the search
            above
            {result.close.length ? ', or one of these:' : '.'}
          </p>
          {result.close.length > 0 && (
            <RankTable rows={result.close.map((p) => ({ pos: p.rank, prof: p }))} href={href} go={go} showDept />
          )}
        </>
      )}

      {prof && (
        <>
          <h1 style={{
            fontSize: 40, fontWeight: 800, lineHeight: 1.1, margin: '1.75rem 0 0.4rem',
          }}
          >
            {prof.name}
          </h1>
          <p style={{ fontSize: 16, margin: '0 0 1.25rem', ...muted }}>
            {`${prof.department} · ${plural(prof.reviews, 'review')}, ${prof.first.slice(0, 4)}–${prof.last.slice(0, 4)} · `}
            <a
              href={`https://www.ratemyprofessors.com/professor/${prof.id}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: theme.palette.darkBlue }}
            >
              RateMyProfessors profile
            </a>
          </p>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            borderTop: `2px solid ${theme.palette.black}`,
            borderBottom: RULE,
            padding: '14px 0 16px',
          }}
          >
            <Stat
              first
              label="Weighted rating"
              value={formatRating(prof.weighted)}
              note={`No. ${formatCount(prof.rank)} of ${formatCount(total)}`}
            />
            <Stat label="Average rating" value={formatRating(prof.rating)} note="Quality, out of 5" />
            <Stat label="Difficulty" value={formatRating(prof.difficulty)} note="Out of 5" />
          </div>

          {prof.tags.length > 0 && (
            <p style={{ margin: '1rem 0 0', fontSize: 15 }}>
              <span style={{ ...muted, marginRight: 6 }}>Most-used tags:</span>
              {prof.tags.map(({ tag, count }) => (
                <span
                  key={tag}
                  style={{
                    display: 'inline-block', margin: '4px 6px 0 0', padding: '3px 10px', background: '#fff', border: RULE, borderRadius: 14, fontSize: 14,
                  }}
                >
                  {`${tag} (${formatCount(count)})`}
                </span>
              ))}
            </p>
          )}

          <h2 style={sectionHeading}>Where they rank</h2>
          <p style={{ fontSize: 17, lineHeight: 1.45, margin: '0 0 0.75rem' }}>
            {`${prof.name}’s weighted rating of ${formatRating(prof.weighted)} is higher than ${pctBelow}% of rated UC Berkeley professors’.`}
          </p>
          <Histogram
            hist={hist}
            total={total}
            selected={prof}
            value={prof.weighted}
            axisLabel="Weighted rating"
          />

          <h2 style={sectionHeading}>Ratings by year</h2>
          {!profYears && <p style={muted}>Loading…</p>}
          {profYears && (
            <>
              <RatingBars key={prof.id} years={profYears} height={300} />
              {profYears[profYears.length - 1].year === PARTIAL_YEAR && (
                <p style={{ fontSize: 14, margin: '0.5rem 0 0', ...muted }}>{PARTIAL_NOTE}</p>
              )}
            </>
          )}

          <h2 style={sectionHeading}>{`Top professors in ${prof.department}`}</h2>
          <p style={{ fontSize: 17, lineHeight: 1.45, margin: '0 0 0.75rem' }}>
            {`${prof.name} ranks No. ${dept.pos} of ${plural(dept.size, 'rated professor')} in ${prof.department}.`}
          </p>
          <RankTable
            rows={dept.rows}
            selectedId={prof.id}
            href={href}
            go={go}
            onExpand={() => setExpandedFor(prof.id)}
            expandLabel={`Show all ${dept.size} professors in ${prof.department}`}
            maxHeight={expanded ? 520 : undefined}
          />
        </>
      )}
    </div>
  );
};

export default ProfReport;
