// Every text the calendars, their page and the notifications show, the first
// two in each of the languages a page can choose.

export const LANGUAGES = ["hu", "en"] as const;
export type Language = (typeof LANGUAGES)[number];

/** The language of a page that sets none, and of its calendars; an annotation label falls back to it too. */
export const LANGUAGE: Language = "hu";

interface FeedTexts {
  stale: (date: string) => string;
  /** The match's page, named in the description. */
  matchPage: (url: string) => string;
}

/** Texts of the events. */
export const FEED: Record<Language, FeedTexts> = {
  hu: {
    stale: (date) => `A naptár nem frissült ${date} óta`,
    matchPage: (url) => `Adatlap: ${url}`,
  },
  en: {
    stale: (date) => `The calendar has not been updated since ${date}`,
    matchPage: (url) => `Match page: ${url}`,
  },
};

interface PageTexts {
  title: string;
  intro: string;
  apple: string;
  google: string;
  address: string;
  /** The page switcher's label, and the list of the pages without scripts. */
  team: string;
  file: string;
  /** Section headings by source, futsal apart from football. */
  sections: Record<string, string>;
}

/** Texts of the page listing the calendars. */
export const PAGE: Record<Language, PageTexts> = {
  hu: {
    title: "Meccsnaptárak",
    intro: "Iratkozz fel egy naptárra: a meccsek és a változások maguktól frissülnek a naptáradban.",
    apple: "Feliratkozás – iPhone / Mac",
    google: "Feliratkozás – Google Naptár",
    address: "Cím más naptárhoz:",
    team: "Csapat:",
    file: "Naptárfájl",
    sections: {
      mlsz: "Labdarúgás – MLSZ adatbank",
      "mlsz-futsal": "Futsal – MLSZ adatbank",
      mvlsz: "Vízilabda – MVLSZ adatbank",
      mrsz: "Röplabda – MRSZ",
    },
  },
  en: {
    title: "Match calendars",
    intro: "Subscribe to a calendar: the matches and their changes reach your calendar by themselves.",
    apple: "Subscribe – iPhone / Mac",
    google: "Subscribe – Google Calendar",
    address: "Address for other calendars:",
    team: "Team:",
    file: "Calendar file",
    sections: {
      mlsz: "Football – MLSZ data bank",
      "mlsz-futsal": "Futsal – MLSZ data bank",
      mvlsz: "Water polo – MVLSZ data bank",
      mrsz: "Volleyball – MRSZ",
    },
  },
};

/** Texts of the notifications, to the maintainer: in Hungarian only. */
export const NOTIFY = {
  failing: (error: string) => `Nem frissül (${error}); a korábbi menetrend marad kint.`,
  recovered: "Újra frissül.",
  test: "Teszt értesítés: a naptár értesítései ide érkeznek.",
};
