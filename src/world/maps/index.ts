import type { MapDef } from '../mapTypes';
import { testRoom } from './testRoom';
import { ravenmoor } from './ravenmoor';

export const MAPS: Record<string, MapDef> = {
  ravenmoor,
  test: testRoom,
};
