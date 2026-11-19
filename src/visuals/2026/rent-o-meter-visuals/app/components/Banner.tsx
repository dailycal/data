import wordmark from "../../../../../assets/site/dclogoblack.webp";
import { strings } from "../strings";

/** The Daily Californian wordmark bar, as on the story template on data.dailycal.org, over the finder. The
 * wordmark goes to the site's front page. Like the site's header, it's hidden with ?embed in the page's URL
 * (see src/layouts/PageLayout.astro); the finder then starts at the top of the page. */
export function Banner() {
  if (new URLSearchParams(window.location.search).has("embed")) {
    return null;
  }
  return (
    <header className="topbar">
      <a href={strings.banner.home}>
        <img src={wordmark.src} alt={strings.banner.masthead} />
      </a>
    </header>
  );
}
