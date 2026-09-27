/**
 * Invented files the showcase dialogs "pick". Every show title and the
 * `[Moonlark]` release tag are made up; the paths use Windows separators
 * because the capture pins a Windows user agent.
 */

const LIBRARY_ROOT = 'D:\\Anime';

const showFolder = (show: string): string => `${LIBRARY_ROOT}\\${show}`;
const episodeStem = (show: string, episode: number): string =>
  `${show} - ${String(episode).padStart(2, '0')} [Moonlark]`;

/** `<show> - <nn> [Moonlark] [1080p].mkv` */
export const episodeVideoName = (show: string, episode: number): string =>
  `${episodeStem(show, episode)} [1080p].mkv`;

/** `<show> - <nn> [Moonlark].en.ass` */
export const episodeSubtitleName = (show: string, episode: number): string =>
  `${episodeStem(show, episode)}.en.ass`;

export const episodeVideo = (show: string, episode: number): string =>
  `${showFolder(show)}\\${episodeVideoName(show, episode)}`;

export const episodeSubtitle = (show: string, episode: number): string =>
  `${showFolder(show)}\\${episodeSubtitleName(show, episode)}`;

/** Output for the default `moekoder` save target: a sibling `moekoder\` folder. */
export const episodeOutput = (show: string, episode: number): string =>
  `${showFolder(show)}\\moekoder\\${episodeStem(show, episode)} [1080p].mp4`;

/** The container the Extract screen opens. */
export const EXTRACT_SOURCE = `${showFolder('Nocturne Garden')}\\${episodeStem('Nocturne Garden', 3)}.mkv`;

/**
 * Canned answers for `dialog.openFile`, keyed by the first filter's `name`,
 * which tells the three pickers apart: the Single route's video and
 * subtitle stages, and the Extract screen's source picker.
 */
export const OPEN_FILE_BY_FILTER: Readonly<Record<string, string>> = {
  Video: episodeVideo('Frostbound Requiem', 1),
  Subtitle: episodeSubtitle('Frostbound Requiem', 1),
  'Matroska / video': EXTRACT_SOURCE,
};
