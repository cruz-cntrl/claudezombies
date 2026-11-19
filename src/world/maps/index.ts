import type { MapDef } from '../mapTypes';
import { testRoom } from './testRoom';
import { ravenmoor } from './ravenmoor';
import { halcyonStation } from './halcyonStation';
import { grounds } from './grounds';

export const MAPS: Record<string, MapDef> = {
  grounds,
  ravenmoor,
  station: halcyonStation,
  test: testRoom,
};
