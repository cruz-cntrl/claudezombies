import type { MapDef } from '../mapTypes';
import { testRoom } from './testRoom';
import { ravenmoor } from './ravenmoor';
import { halcyonStation } from './halcyonStation';

export const MAPS: Record<string, MapDef> = {
  ravenmoor,
  station: halcyonStation,
  test: testRoom,
};
