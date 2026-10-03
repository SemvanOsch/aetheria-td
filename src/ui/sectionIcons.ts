import type { SectionId } from '../domain/levels';
import type { IconName } from './components/Icon';

/** Chapter emblems (the section data carries an emoji for legacy callers). */
export const SECTION_ICONS: Record<SectionId, IconName> = {
  castle: 'castle',
  capital: 'houses',
  forest: 'tree',
  inn: 'tankard',
};
