// How counters, prefixes and suffixes are used. These words never stand on their own, so
// they're shown with 〜 where the rest goes (〜か月, 再〜), with an example, and for some a note.
//
// Examples are written by hand: matching words automatically finds false ones (文化 "culture"
// isn't 文 + 〜化). Counters without an entry get 二 + the counter, which none of them change.

/** Spelling -> [example, reading, meaning]. */
export const EXAMPLES = {
  // Counters (two of something)
  'か月': ['二か月', 'にかげつ', 'two months'],
  '回': ['二回', 'にかい', 'twice'],
  '個': ['二個', 'にこ', 'two (things)'],
  '歳': ['二歳', 'にさい', 'two years old'],
  '冊': ['二冊', 'にさつ', 'two books'],
  '番目': ['二番目', 'にばんめ', 'the second'],
  '枚': ['二枚', 'にまい', 'two sheets'],
  '匹': ['二匹', 'にひき', 'two (small animals)'],
  '問': ['二問', 'にもん', 'two questions'],
  '泊': ['二泊', 'にはく', 'two nights'],
  '遍': ['二遍', 'にへん', 'twice'],
  '校': ['二校', 'にこう', 'two schools'],
  '滴': ['二滴', 'にてき', 'two drops'],
  '誌': ['二誌', 'にし', 'two magazines'],
  '把': ['二把', 'にわ', 'two bundles'],
  // Prefixes
  '各': ['各国', 'かっこく', 'each country'],
  '幾': ['幾日', 'いくにち', 'how many days'],
  '旧': ['旧友', 'きゅうゆう', 'old friend'],
  '故': ['故山田氏', 'こやまだし', 'the late Mr. Yamada'],
  '再': ['再開', 'さいかい', 'reopening'],
  '昨': ['昨年', 'さくねん', 'last year'],
  '諸': ['諸国', 'しょこく', 'various countries'],
  '全': ['全国', 'ぜんこく', 'the whole country'],
  '総': ['総人口', 'そうじんこう', 'total population'],
  '第': ['第一', 'だいいち', 'first'],
  '超': ['超高速', 'ちょうこうそく', 'super-fast'],
  '同': ['同年', 'どうねん', 'the same year'],
  '反': ['反政府', 'はんせいふ', 'anti-government'],
  '片': ['片手', 'かたて', 'one hand'],
  '毎': ['毎日', 'まいにち', 'every day'],
  '来': ['来年', 'らいねん', 'next year'],
  '不': ['不便', 'ふべん', 'inconvenient'],
  '現': ['現政府', 'げんせいふ', 'the current government'],
  '翌': ['翌日', 'よくじつ', 'the next day'],
  '当': ['当日', 'とうじつ', 'that day'],
  '未': ['未完成', 'みかんせい', 'unfinished'],
  '低': ['低価格', 'ていかかく', 'low price'],
  // Suffixes
  '圏': ['首都圏', 'しゅとけん', 'the capital region'],
  '次第': ['天気次第', 'てんきしだい', 'depending on the weather'],
  '弱': ['一時間弱', 'いちじかんじゃく', 'just under an hour'],
  '強': ['一時間強', 'いちじかんきょう', 'just over an hour'],
  '症': ['不眠症', 'ふみんしょう', 'insomnia'],
  '丁目': ['三丁目', 'さんちょうめ', 'block 3 (of a district)'],
  '殿': ['山田殿', 'やまだどの', 'Mr. Yamada (formal)'],
  '年生': ['一年生', 'いちねんせい', 'first-year student'],
  '様': ['山田様', 'やまださま', 'Mr./Ms. Yamada'],
  '流': ['日本流', 'にほんりゅう', 'the Japanese way'],
  '化': ['自動化', 'じどうか', 'automation'],
  '戦': ['決勝戦', 'けっしょうせん', 'the final (match)'],
  '狂': ['野球狂', 'やきゅうきょう', 'baseball fanatic'],
  '屋': ['本屋', 'ほんや', 'bookshop'],
  '氏': ['山田氏', 'やまだし', 'Mr. Yamada'],
  '刊': ['月刊', 'げっかん', 'monthly (publication)'],
  '建て': ['二階建て', 'にかいだて', 'two-storey'],
  '病': ['心臓病', 'しんぞうびょう', 'heart disease'],
  '教': ['仏教', 'ぶっきょう', 'Buddhism'],
  '街': ['商店街', 'しょうてんがい', 'shopping street'],
  '発': ['東京発', 'とうきょうはつ', 'departing from Tokyo'],
  '着': ['大阪着', 'おおさかちゃく', 'arriving in Osaka'],
  '費': ['交通費', 'こうつうひ', 'travel costs'],
  '集': ['作品集', 'さくひんしゅう', 'collected works'],
  '界': ['芸能界', 'げいのうかい', 'the entertainment world'],
  '園': ['動物園', 'どうぶつえん', 'zoo'],
  '船': ['貨物船', 'かもつせん', 'cargo ship'],
  '博': ['万国博', 'ばんこくはく', "world's fair"],
  '舎': ['校舎', 'こうしゃ', 'school building'],
  '妃': ['皇太子妃', 'こうたいしひ', 'crown princess'],
  '御中': ['営業部御中', 'えいぎょうぶおんちゅう', 'to the Sales Department (on mail)'],
  '向け': ['子供向け', 'こどもむけ', 'for children'],
};

/** Spelling -> a note on use: sound changes, or a word it's easily confused with. */
export const NOTES = {
  'か月': 'Counts months. Without か, a number and 月 name a month: 三か月 (さんかげつ) is three months, 三月 (さんがつ) is March. Sound changes: 一か月 いっかげつ, 六か月 ろっかげつ, 十か月 じゅっかげつ. Also written ヶ月 or カ月.',
  '月': 'After a number, 月 is read がつ and names a month: 三月 (さんがつ) is March. To count months, use 〜か月: 三か月 (さんかげつ) is three months.',
  '回': 'Sound changes: 一回 いっかい, 六回 ろっかい, 十回 じゅっかい.',
  '個': 'Sound changes: 一個 いっこ, 六個 ろっこ, 十個 じゅっこ.',
  '歳': 'Sound changes: 一歳 いっさい, 八歳 はっさい, 十歳 じゅっさい; 20 is usually はたち (二十歳). Also written 才.',
  '冊': 'Sound changes: 一冊 いっさつ, 八冊 はっさつ, 十冊 じゅっさつ.',
  '匹': 'Sound changes: 一匹 いっぴき, 三匹 さんびき, 六匹 ろっぴき, 十匹 じゅっぴき.',
  '泊': 'Sound changes: 一泊 いっぱく, 三泊 さんぱく, 十泊 じゅっぱく.',
  '遍': 'Sound changes: 一遍 いっぺん, 三遍 さんべん.',
  '滴': 'Sound change: 一滴 いってき.',
  '把': 'Sound changes: 一把 いちわ, 三把 さんば, 六把 ろっぱ.',
  '番目': '〜番 (ばん) is a number in a sequence; 〜番目 is the nth: 二番目 is the second.',
  '第': 'Makes ordinals: 第一 (だいいち) first, 第二 (だいに) second.',
};

const AFFIX_POS = new Set(['counter', 'suffix', 'prefix', 'noun prefix']);

/**
 * 'prefix' or 'suffix' for a word that only works attached to something (counters count as
 * suffixes), else null. "noun suffix" counts for single characters (街, 費) and words with an
 * example here (向け); others like 以前 and 以来 also stand alone.
 */
export function affixOf(v) {
  const pos = v.pos || [];
  if (!pos.length) return null;
  const ok = pos.every((p) => AFFIX_POS.has(p) || (p === 'noun suffix' && ([...v.w].length === 1 || v.w in EXAMPLES)));
  if (!ok) return null;
  return pos.some((p) => p.includes('prefix')) ? 'prefix' : 'suffix';
}

/** The usage example for a word: { w, r, meaning } or null. */
export function exampleOf(v) {
  const e = EXAMPLES[v.w];
  if (e) return { w: e[0], r: e[1], meaning: e[2] };
  if ((v.pos || []).includes('counter') && affixOf(v)) return { w: '二' + v.w, r: 'に' + v.readings[0], meaning: '' };
  return null;
}

export const noteOf = (v) => NOTES[v.w] || null;
