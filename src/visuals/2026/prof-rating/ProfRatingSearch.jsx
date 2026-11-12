import React, { useEffect, useMemo, useState } from 'react';
import * as d3 from 'd3';
import { theme } from '../../../styles/theme';
import {
  Histogram, ProfSearchBox, formatCount, tokenize,
} from './shared';
// Built by scripts/lookup_data.py in the scraping project.
// professor_ratings.csv: name, department, rating (average quality, 1-5), reviews, rank,
//   weighted (the average as if the professor also had 20 reviews at the campus average,
//   so ratings from few reviews are pulled to the middle; rank orders by it).
// rating_histogram.csv: score (1.00-5.00 in steps of 0.02), professors_weighted (a smoothed
//   count of professors with weighted ratings near that score, so the curve reads as
//   continuous). Its `professors` column (plain averages) isn't used here.
// Imported as URLs (?url), so they're fetched at run time instead of bundled.
import PROFS_URL from './data/professor_ratings.csv?url';
import HIST_URL from './data/rating_histogram.csv?url';

// Picking a professor opens their report (src/pages/interactive/profratings.astro) in this tab.
const REPORT_URL = '/interactive/profratings';

const weightedOf = (p) => p.weighted;
const nameKey = (name) => tokenize(name).join(' ');

const ProfRatingSearch = () => {
  const [profs, setProfs] = useState(null);
  const [hist, setHist] = useState(null);

  // Both files are small (about 60KB gzipped together), so they load right away:
  // the histogram is shown before anyone searches.
  useEffect(() => {
    d3.csv(HIST_URL, (r) => ({ score: +r.score, professors: +r.professors_weighted })).then(setHist);
    d3.csv(PROFS_URL, (r) => ({
      id: +r.rank, // ranks are unique
      name: r.name,
      department: r.department,
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

  // Names shared by more than one professor need their department in the report's URL.
  const nameCounts = useMemo(
    () => (profs ? d3.rollup(profs, (v) => v.length, (p) => nameKey(p.name)) : null),
    [profs],
  );

  const openReport = (prof) => {
    const params = new URLSearchParams({ prof: prof.name });
    if (nameCounts.get(nameKey(prof.name)) > 1) params.set('dept', prof.department);
    window.location.assign(`${REPORT_URL}?${params}`);
  };

  const total = profs ? profs.length : 0;

  return (
    <figure style={{ margin: '2rem 0', fontFamily: 'Georgia, serif' }}>
      <h3 style={{ margin: '0 0 0.25rem' }}>Search UC Berkeley professors’ ratings</h3>
      <p style={{ margin: '0 0 0.75rem', color: theme.palette.darkGrey }}>
        Type a UC Berkeley professor’s name to open their report: their rating, how it has
        changed by semester and where they rank among
        {total ? ` all ${formatCount(total)} ` : ' all '}
        rated professors and in their department.
      </p>
      <ProfSearchBox
        profs={profs}
        onChoose={openReport}
        ratingOf={weightedOf}
        listboxId="prof-rating-suggestions"
      />

      <div style={{ marginTop: '1rem' }}>
        <Histogram hist={hist} total={total} selected={null} value={0} axisLabel="Weighted rating" />
      </div>

      <figcaption style={{ fontSize: 14, color: theme.palette.darkGrey, marginTop: '0.75rem' }}>
        <p style={{ margin: '0 0 0.5rem', fontSize: 14 }}>
          How UC Berkeley professors’ weighted ratings are spread, based on RateMyProfessors
          quality scores as of Nov. 5, 2026; professors without reviews aren’t included. The
          weighted rating counts every professor as if they also had 20 reviews at the campus
          average of 3.74, so a perfect score from a handful of reviews doesn’t outrank a
          near-perfect score from hundreds. The curve is a smoothed histogram: its height shows
          how many professors have weighted ratings near each score.
        </p>
        Source: Brendan Raykoff/The Daily Californian analysis of RateMyProfessors reviews
      </figcaption>
    </figure>
  );
};

export default ProfRatingSearch;
