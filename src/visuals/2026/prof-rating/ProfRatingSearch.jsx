import { useEffect, useState } from 'react';
import * as d3 from 'd3';
import {
  Figure, Histogram, ProfSearchBox, formatCount, parseHist, tokenize, useReportHref,
} from './shared';
// Built by scripts/lookup_data.py in the scraping project.
// professor_ratings.csv: name, department, reviews, weighted (the average as if the professor
//   also had 20 reviews at the campus average, so ratings from few reviews are pulled to the
//   middle), most-reviewed first: the order suggestions come in. A slimmer copy of the report
//   page's profratings_index.csv, so the article loads a third as much.
// rating_histogram.csv: score (1.00-5.00 in steps of 0.02), professors_weighted (a smoothed
//   count of professors with weighted ratings near that score, so the curve reads as
//   continuous).
// Imported as URLs (?url): fetched at run time, or inlined if tiny (the histogram).
import PROFS_URL from './data/professor_ratings.csv?url';
import HIST_URL from './data/rating_histogram.csv?url';

const weightedOf = (p) => p.weighted;

const ProfRatingSearch = () => {
  const [profs, setProfs] = useState(null);
  const [hist, setHist] = useState(null);

  // Both files are small (about 46KB gzipped together), so they load right away:
  // the histogram is shown before anyone searches.
  useEffect(() => {
    d3.csv(HIST_URL, parseHist).then(setHist);
    // The file is already in suggestion order (most-reviewed first).
    d3.csv(PROFS_URL, (r, i) => ({
      id: i,
      name: r.name,
      department: r.department,
      reviews: +r.reviews,
      weighted: +r.weighted,
      tokens: tokenize(r.name),
    })).then(setProfs);
  }, []);

  // Picking a professor opens their report in this tab.
  const reportHref = useReportHref(profs);
  const openReport = (prof) => window.location.assign(reportHref(prof));

  return (
    <Figure
      title="Search UC Berkeley professors’ ratings"
      subtitle={`Type a UC Berkeley professor’s name to open their report: their rating, how it has changed year by year and where they rank among all ${profs ? `${formatCount(profs.length)} ` : ''}rated professors and in their department.`}
    >
      <ProfSearchBox
        profs={profs}
        onChoose={openReport}
        ratingOf={weightedOf}
        listboxId="prof-rating-suggestions"
      />
      <div style={{ marginTop: '1rem' }}>
        <Histogram
          hist={hist}
          axisLabel="Weighted rating"
          profs={profs}
          ratingOf={weightedOf}
          hrefOf={reportHref}
        />
      </div>
    </Figure>
  );
};

export default ProfRatingSearch;
