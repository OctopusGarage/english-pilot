export interface PronunciationEntry {
  word: string;
  ipa: string;
}

export interface PronunciationDetail extends PronunciationEntry {
  stress: string;
}

export interface PronunciationLookup {
  entries: PronunciationDetail[];
  unknown: string[];
}

interface PronunciationRecord {
  ipa: string;
  stress: string;
}

export function lookupPronunciations(text: string, limit = 8): PronunciationLookup {
  const seen = new Set<string>();
  const entries: PronunciationDetail[] = [];
  const unknown: string[] = [];

  for (const rawWord of text.toLowerCase().match(/[a-z]+/g) ?? []) {
    if (seen.has(rawWord)) continue;
    seen.add(rawWord);
    const record = PRONUNCIATION_DICTIONARY[rawWord];
    if (!record) {
      unknown.push(rawWord);
      continue;
    }
    entries.push({ word: rawWord, ipa: record.ipa, stress: record.stress });
    if (entries.length >= limit) break;
  }

  return { entries, unknown };
}

export function buildPronunciationBite(text: string, limit = 3): PronunciationEntry[] {
  return lookupPronunciations(text, limit).entries.map(({ word, ipa }) => ({ word, ipa }));
}

const PRONUNCIATION_DICTIONARY: Record<string, PronunciationRecord> = {
  access: { ipa: '/ˈækses/', stress: 'AC-cess' },
  align: { ipa: '/əˈlaɪn/', stress: 'a-LIGN' },
  automatically: { ipa: '/ˌɔːtəˈmætɪkli/', stress: 'au-to-MAT-i-cal-ly' },
  adjustable: { ipa: '/əˈdʒʌstəbl/', stress: 'ad-JUST-a-ble' },
  bonus: { ipa: '/ˈboʊnəs/', stress: 'BO-nus' },
  calibration: { ipa: '/ˌkælɪˈbreɪʃn/', stress: 'cal-i-BRA-tion' },
  create: { ipa: '/kriˈeɪt/', stress: 'cre-ATE' },
  design: { ipa: '/dɪˈzaɪn/', stress: 'de-SIGN' },
  distribute: { ipa: '/dɪˈstrɪbjuːt/', stress: 'dis-TRIB-ute' },
  english: { ipa: '/ˈɪŋɡlɪʃ/', stress: 'ENG-lish' },
  evaluate: { ipa: '/ɪˈvæljueɪt/', stress: 'e-VAL-u-ate' },
  everyone: { ipa: '/ˈevriwʌn/', stress: 'EV-ery-one' },
  fairly: { ipa: '/ˈferli/', stress: 'FAIR-ly' },
  guangzhou: { ipa: '/ˈɡwɑːŋˈdʒoʊ/', stress: 'GWANG-JOE' },
  humid: { ipa: '/ˈhjuːmɪd/', stress: 'HYOO-mid' },
  implementation: { ipa: '/ˌɪmplɪmenˈteɪʃn/', stress: 'im-ple-men-TA-tion' },
  intensity: { ipa: '/ɪnˈtensəti/', stress: 'in-TEN-si-ty' },
  later: { ipa: '/ˈleɪtər/', stress: 'LA-ter' },
  learn: { ipa: '/lɝːn/', stress: 'LEARN' },
  local: { ipa: '/ˈloʊkl/', stress: 'LO-cal' },
  practice: { ipa: '/ˈpræktɪs/', stress: 'PRAC-tice' },
  project: { ipa: '/ˈprɑːdʒekt/', stress: 'PROJ-ect' },
  pronunciation: { ipa: '/prəˌnʌnsiˈeɪʃn/', stress: 'pro-nun-ci-A-tion' },
  refine: { ipa: '/rɪˈfaɪn/', stress: 're-FINE' },
  review: { ipa: '/rɪˈvjuː/', stress: 're-VIEW' },
  sophisticated: { ipa: '/səˈfɪstɪkeɪtɪd/', stress: 'so-PHIS-ti-ca-ted' },
  threshold: { ipa: '/ˈθreʃhoʊld/', stress: 'THRESH-hold' },
  thunderstorm: { ipa: '/ˈθʌndərstɔːrm/', stress: 'THUN-der-storm' },
  weather: { ipa: '/ˈweðər/', stress: 'WEATH-er' },
  week: { ipa: '/wiːk/', stress: 'WEEK' },
  work: { ipa: '/wɝːk/', stress: 'WORK' },
  workflow: { ipa: '/ˈwɝːkfloʊ/', stress: 'WORK-flow' },
};
