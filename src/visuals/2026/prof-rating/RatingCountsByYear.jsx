import { useEffect, useState } from 'react';
import * as d3 from 'd3';
import {
  Figure, PARTIAL_NOTE, RatingBars, RmpLink, parseRatingYear,
} from './shared';
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
    <Figure
      title="Reviews posted each year, by rating"
      subtitle={(
        <>
          <RmpLink />
          {' reviews of UC Berkeley professors by the quality rating they gave, from 1 (awful) to 5 (awesome).'}
        </>
      )}
      note={PARTIAL_NOTE}
    >
      <RatingBars years={years} />
    </Figure>
  );
};

export default RatingCountsByYear;
