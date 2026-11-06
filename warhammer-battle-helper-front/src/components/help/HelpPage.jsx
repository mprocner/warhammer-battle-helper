import React, { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Markdown from 'markdown-to-jsx';
import { MenuBook as MenuBookIcon } from '@mui/icons-material';
import {
  HELP_PAGES,
  helpHref,
  helpLanguage,
  isHelpPage,
  loadHelpMarkdown,
  parseHeadings,
  rewriteGuideLink,
  splitHeadingAnchor,
} from '../../help/helpPages';
import './HelpPage.css';

// Heading text arrives as children; the {#id} anchor is the tail of the last text child.
const headingParts = (children) => {
  const list = React.Children.toArray(children);
  const last = list[list.length - 1];
  if (typeof last !== 'string') return { content: children, id: null };
  const { text, id } = splitHeadingAnchor(last);
  return { content: [...list.slice(0, -1), text], id };
};

const heading = (Tag) => {
  const Heading = ({ children }) => {
    const { content, id } = headingParts(children);
    return <Tag id={id || undefined}>{content}</Tag>;
  };
  Heading.displayName = `Help${Tag.toUpperCase()}`;
  return Heading;
};

// Links between guide pages stay inside the app (no reload); anything else opens in a new tab.
const GuideLink = ({ href, children, title }) => {
  const target = rewriteGuideLink(href);
  if (target && target.startsWith('/help')) {
    return <Link to={target} title={title}>{children}</Link>;
  }
  if (target && target.startsWith('#')) {
    return <a href={target} title={title}>{children}</a>;
  }
  return <a href={target} title={title} target="_blank" rel="noopener noreferrer">{children}</a>;
};

const MARKDOWN_OPTIONS = {
  // Raw HTML in the guide is never rendered - the files are plain Markdown on purpose.
  disableParsingRawHTML: true,
  overrides: {
    h1: heading('h1'),
    h2: heading('h2'),
    h3: heading('h3'),
    h4: heading('h4'),
    a: GuideLink,
  },
};

// /help and /help/:page - the user guide, public like /privacy, in the interface language.
const HelpPage = () => {
  const { page = 'home' } = useParams();
  const { hash } = useLocation();
  const { t, i18n } = useTranslation();
  const language = helpLanguage(i18n.language);
  const [state, setState] = useState({ key: null, markdown: '', error: false });
  const key = `${language}/${page}`;
  const known = isHelpPage(page);

  useEffect(() => {
    if (!known) return undefined;
    let cancelled = false;
    loadHelpMarkdown(language, page)
      .then(markdown => { if (!cancelled) setState({ key, markdown, error: false }); })
      .catch(() => { if (!cancelled) setState({ key, markdown: '', error: true }); });
    return () => { cancelled = true; };
  }, [language, page, key, known]);

  const ready = state.key === key;

  // The section in the URL exists only once its page has rendered, so the scroll waits for the
  // content and runs again when the hash changes (a click in the section list).
  useEffect(() => {
    if (!ready) return;
    const id = decodeURIComponent(hash.replace(/^#/, ''));
    const target = id ? document.getElementById(id) : null;
    if (target) target.scrollIntoView({ block: 'start' });
    else window.scrollTo(0, 0);
  }, [ready, hash, state.markdown]);

  const sections = useMemo(
    () => (ready ? parseHeadings(state.markdown).filter(h => h.level === 2 && h.id) : []),
    [ready, state.markdown]
  );

  if (!known) return <Navigate to="/help" replace />;

  return (
    <div className="help-page">
      <nav className="help-page__sidebar" aria-label={t('help.navLabel')}>
        <div className="help-page__sidebar-title">
          <MenuBookIcon fontSize="small" />
          {t('help.title')}
        </div>
        <ul className="help-page__nav">
          {HELP_PAGES.map(({ slug }) => (
            <li key={slug}>
              <Link
                to={helpHref(slug)}
                className={`help-page__nav-link${slug === page ? ' help-page__nav-link--active' : ''}`}
                aria-current={slug === page ? 'page' : undefined}
              >
                {t(`help.pages.${slug}`)}
              </Link>
              {slug === page && sections.length > 0 && (
                <ul className="help-page__sections">
                  {sections.map(section => (
                    <li key={section.id}>
                      <Link to={helpHref(`${slug}#${section.id}`)} className="help-page__section-link">
                        {section.text}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </nav>

      <main className="help-page__content">
        {!ready && <p className="help-page__status">{t('help.loading')}</p>}
        {ready && state.error && <p className="help-page__status">{t('help.loadError')}</p>}
        {ready && !state.error && (
          <article className="help-page__article">
            <Markdown options={MARKDOWN_OPTIONS}>{state.markdown}</Markdown>
          </article>
        )}
      </main>
    </div>
  );
};

export default HelpPage;
