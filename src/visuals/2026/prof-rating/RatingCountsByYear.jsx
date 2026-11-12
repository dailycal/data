import React, { useEffect, useState } from 'react';
import * as d3 from 'd3';
import { theme } from '../../../styles/theme';
import { PARTIAL_NOTE, RatingBars, parseRatingYear } from './shared';
// Built by scripts/rating_counts.py in the scraping project: how many RateMyProfessors reviews
// of UC Berkeley professors gave each quality rating, by the year the review was posted.
// Columns: year, r1, r2, r3, r4, r5. Imported as a URL (?url), so it's fetched at run time.
// The chart itself is RatingBars in shared.jsx, which the professor report page also uses.
import DATA_URL from './data/rating_counts_by_year.csv?url';

const RatingCountsByYear = () => {
  const [years, setYears] = useState([]);

  useEffect(() => {
    d3.csv(DATA_URL, parseRatingYear).then((rows) => setYears(rows.sort((a, b) => a.year - b.year)));
  }, []);

  return (
    <figure style={{ margin: '2rem 0', fontFamily: 'Georgia, serif' }}>
      <h3 style={{ margin: '0 0 0.25rem' }}>Every review’s rating, year by year</h3>
      <p style={{ margin: '0 0 0.75rem', color: theme.palette.darkGrey }}>
        RateMyProfessors reviews of UC Berkeley professors by the quality rating they gave, from
        1 (awful) to 5 (awesome).
      </p>

      <RatingBars years={years} />

      <figcaption style={{ fontSize: 14, color: theme.palette.darkGrey, marginTop: '0.75rem' }}>
        <p style={{ margin: '0 0 0.5rem', fontSize: 14 }}>{PARTIAL_NOTE}</p>
        Source: Brendan Raykoff/The Daily Californian analysis of RateMyProfessors reviews
      </figcaption>
    </figure>
  );
};

export default RatingCountsByYear;
